// Data Parser Web Worker (v0.4.0 - Advanced Import Settings & Arbitrary Date Formats)

interface ColumnConfigEntry {
  index: number;
  name?: string;
  type?: 'numeric' | 'date' | 'categorical' | 'ignore';
  dateFormat?: string;
}

interface ParseSettings {
  delimiter?: string;
  decimalPoint?: string;
  startRow?: number;
  columnConfigs?: ColumnConfigEntry[];
  xAxisColumn?: string;
}

interface ParseConfig {
  type?: string;
  dateFormat?: string;
}

self.onmessage = async (event) => {
  const { file, type, settings } = event.data;

  try {
    const text = await file.text();
    let result;
    if (type === 'csv') result = parseCSV(text, settings);
    else if (type === 'json') result = parseJSON(text, settings);
    else throw new Error(`Unsupported file type: ${type}`);

    const rowCount = result.rowCount;
    const columns = result.columns;
    
    // 1. Calculate absolute bounds for all columns first
    const colBounds = columns.map((_, colIdx) => {
      let min = Infinity, max = -Infinity;
      for (let i = 0; i < rowCount; i++) {
        const val = result.data[i][colIdx];
        if (val < min) min = val;
        if (val > max) max = val;
      }
      return { min, max };
    });

    // 2. Prepare datasets with synchronized LOD
    const relativeData = columns.map((_, colIdx) => {
      let refPoint = 0;
      for (let i = 0; i < rowCount; i++) {
        const val = result.data[i][colIdx];
        if (!Number.isNaN(val)) {
          refPoint = val;
          break;
        }
      }
      const data = new Float32Array(rowCount);
      for (let i = 0; i < rowCount; i++) {
        data[i] = result.data[i][colIdx] - refPoint;
      }
      return { data, refPoint };
    });

    // ⚡ Bolt Optimization: Pre-calculate non-ignored configs to avoid O(N) array filtering operations inside .find() in the inner loop
    const nonIgnoredConfigs = settings?.columnConfigs ? settings.columnConfigs.filter((cc: { type: string }) => cc.type !== 'ignore') : [];

    const dataset = {
      id: crypto.randomUUID(),
      name: file.name,
      columns: columns,
      rowCount: rowCount,
      xAxisColumn: settings?.xAxisColumn,
      data: columns.map((colName, colIdx) => {
        const config = settings?.columnConfigs?.find((c: { name: string; type: string }) => c.name === colName || (c.name === nonIgnoredConfigs[colIdx]?.name));
        const isPotentialX = config?.type === 'date' || colIdx === 0 || colName.toLowerCase().includes('time') || colName.toLowerCase().includes('date');

        return {
          isFloat64: isPotentialX,
          refPoint: relativeData[colIdx].refPoint,
          bounds: colBounds[colIdx],
          data: relativeData[colIdx].data
        };
      })
    };

    const transferList: ArrayBuffer[] = [];
    dataset.data.forEach(col => {
      transferList.push(col.data.buffer as ArrayBuffer);
    });

    (self as unknown as Worker).postMessage({ type: 'success', dataset }, transferList);
  } catch (error: unknown) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};

function parseCSV(text: string, settings?: ParseSettings) {
  const { delimiter = ',', decimalPoint = '.', startRow = 1, columnConfigs = [] } = settings || {};

  // Strip BOM if present
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length === 0) throw new Error('Empty CSV file');

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const data: number[][] = [];

  const categoricalMaps = new Array(headers.length).fill(null).map(() => new Map<string, number>());

  // ⚡ Bolt Optimization: Pre-calculate column configurations to avoid O(N) .find() lookup inside inner loop
  const configsByIndex = new Array(headers.length);
  for (let j = 0; j < headers.length; j++) {
    configsByIndex[j] = columnConfigs.find((c: ColumnConfigEntry) => c.index === j);
  }

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rawValues = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const parsedRow: number[] = [];

    for (let j = 0; j < headers.length; j++) {
      const config = configsByIndex[j];
      if (config?.type === 'ignore') continue;

      const val = rawValues[j];
      parsedRow.push(parseValue(val, config, decimalPoint, categoricalMaps[j]));
    }
    data.push(parsedRow);
  }

  const finalHeaders = headers.filter((_, i) => {
    const config = columnConfigs.find((c: ColumnConfigEntry) => c.index === i);
    return config?.type !== 'ignore';
  }).map((h) => {
     // Re-find the original index to look up the correct config
     const originalIdx = headers.indexOf(h);
     const config = columnConfigs.find((c: ColumnConfigEntry) => c.index === originalIdx);
     return config?.name || h;
  });

  return { columns: finalHeaders, rowCount: data.length, data: data };
}


function parseJSON(text: string, settings?: ParseSettings) {
  const { decimalPoint = '.', columnConfigs = [] } = settings || {};
  
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    console.error('Worker: Failed to parse JSON data:', error);
    throw new Error('Invalid JSON format: ' + (error instanceof Error ? error.message : String(error)));
  }

  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format: Expected a non-empty array of objects');

  const allHeaders = Object.keys(raw[0]);
  const rowCount = raw.length;

  const categoricalMaps = new Array(allHeaders.length).fill(null).map(() => new Map<string, number>());

  // ⚡ Bolt Optimization: Pre-calculate column configurations to avoid O(N) .find() lookup inside inner loop
  const configsByIndex = new Array(allHeaders.length);
  for (let j = 0; j < allHeaders.length; j++) {
    configsByIndex[j] = columnConfigs.find((c: ColumnConfigEntry) => c.index === j);
  }

  // Pre-calculate active columns to avoid inner loop branching and allow array pre-allocation
  const activeColumns: { header: string; config: ColumnConfigEntry | undefined; catMap: Map<string, number> }[] = [];
  for (let j = 0; j < allHeaders.length; j++) {
    if (configsByIndex[j]?.type !== 'ignore') {
      activeColumns.push({
        header: allHeaders[j],
        config: configsByIndex[j],
        catMap: categoricalMaps[j]
      });
    }
  }

  const activeColCount = activeColumns.length;
  const data = new Array(rowCount);

  for (let i = 0; i < rowCount; i++) {
    const row = raw[i];
    const parsedRow: number[] = new Array(activeColCount);

    for (let j = 0; j < activeColCount; j++) {
      const col = activeColumns[j];
      const val = row[col.header];
      const valStr = val === undefined || val === null ? '' : String(val);
      parsedRow[j] = parseValue(valStr, col.config, decimalPoint, col.catMap);
    }
    data[i] = parsedRow;
  }

  const finalHeaders = activeColumns.map(c => c.config?.name || c.header);

  return { columns: finalHeaders, rowCount: data.length, data: data };
}

function parseValue(val: string, config: ParseConfig | null | undefined, decimalPoint: string, categoricalMap: Map<string, number>): number {
  if (val === undefined || val === null || val === '') return NaN;

  if (config?.type === 'date') {
    return parseDate(val, config.dateFormat);
  }

  if (config?.type === 'categorical') {
    if (!categoricalMap.has(val)) {
      categoricalMap.set(val, categoricalMap.size);
    }
    return categoricalMap.get(val)!;
  }

  // Default: numeric
  const normalized = decimalPoint === ',' ? val.replace(',', '.') : val;
  const p = parseFloat(normalized);
  return isNaN(p) ? NaN : p;
}

function parseDate(val: string, format?: string): number {
  if (!format) {
    const d = new Date(val);
    return d.getTime() / 1000;
  }

  // Basic format parser (YYYY, MM, DD, HH, mm, ss)
  try {
    let year = 1970, month = 0, day = 1, hour = 0, min = 0, sec = 0;

    const parts = {
      YYYY: { idx: format.indexOf('YYYY'), len: 4 },
      MM: { idx: format.indexOf('MM'), len: 2 },
      DD: { idx: format.indexOf('DD'), len: 2 },
      HH: { idx: format.indexOf('HH'), len: 2 },
      mm: { idx: format.indexOf('mm'), len: 2 },
      ss: { idx: format.indexOf('ss'), len: 2 }
    };

    if (parts.YYYY.idx !== -1) year = parseInt(val.substring(parts.YYYY.idx, parts.YYYY.idx + 4));
    if (parts.MM.idx !== -1) month = parseInt(val.substring(parts.MM.idx, parts.MM.idx + 2)) - 1;
    if (parts.DD.idx !== -1) day = parseInt(val.substring(parts.DD.idx, parts.DD.idx + 2));
    if (parts.HH.idx !== -1) hour = parseInt(val.substring(parts.HH.idx, parts.HH.idx + 2));
    if (parts.mm.idx !== -1) min = parseInt(val.substring(parts.mm.idx, parts.mm.idx + 2));
    if (parts.ss.idx !== -1) sec = parseInt(val.substring(parts.ss.idx, parts.ss.idx + 2));

    const d = new Date(year, month, day, hour, min, sec);
    return d.getTime() / 1000;
  } catch {
    const d = new Date(val);
    return d.getTime() / 1000;
  }
}
