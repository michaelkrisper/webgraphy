// Data Parser Web Worker (v0.4.0 - Advanced Import Settings & Arbitrary Date Formats)
import { secureJSONParse } from '../utils/json';

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
    let result;
    if (type === 'csv') result = await parseCSV(file, settings);
    else if (type === 'json') {
      const text = await file.text();
      result = parseJSON(text, settings);
    }
    else throw new Error(`Unsupported file type: ${type}`);

    const rowCount = result.rowCount;
    const columns = result.columns;
    
    // ⚡ Bolt Optimization: Combine bounds calculation and relative data calculation
    // into a single pass and use column-major (SOA) architecture for much better cache locality
    const colCount = columns.length;
    const relativeData = new Array(colCount);

    const CHUNK_SIZE = 512;
    const numChunks = Math.ceil(rowCount / CHUNK_SIZE);

    // We've already parsed the data and calculated active columns in parseCSV/parseJSON
    // Now we combine bounds calculation, chunk min/max calculation and float data mapping into a single pass per column
    for (let j = 0; j < colCount; j++) {
      let min = Infinity, max = -Infinity;
      let refPoint = 0;

      const colData = new Float32Array(rowCount);
      const sourceData = result.data[j]; // Cache array access
      let startIdx = 0;

      const chunkMin = new Float32Array(numChunks).fill(Infinity);
      const chunkMax = new Float32Array(numChunks).fill(-Infinity);

      // Find reference point first (usually row 0, but could be later if NaN)
      // Any NaNs before the reference point are copied as NaN
      for (; startIdx < rowCount; startIdx++) {
        const val = sourceData[startIdx];
        if (!Number.isNaN(val)) {
          refPoint = val;
          break;
        }
        colData[startIdx] = NaN;
        // NaNs don't update min/max
      }

      // Single pass for the rest of the data: calculate bounds, chunk min/max and relative data
      for (let i = startIdx; i < rowCount; i++) {
        const val = sourceData[i];
        if (!Number.isNaN(val)) {
          if (val < min) min = val;
          if (val > max) max = val;
          
          const chunkIdx = Math.floor(i / CHUNK_SIZE);
          if (val < chunkMin[chunkIdx]) chunkMin[chunkIdx] = val;
          if (val > chunkMax[chunkIdx]) chunkMax[chunkIdx] = val;
        }
        colData[i] = val - refPoint;
      }

      relativeData[j] = {
        data: colData,
        refPoint,
        bounds: { min, max },
        chunkMin,
        chunkMax
      };
    }

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
          bounds: relativeData[colIdx].bounds,
          data: relativeData[colIdx].data,
          chunkMin: relativeData[colIdx].chunkMin,
          chunkMax: relativeData[colIdx].chunkMax
        };
      })
    };

    const transferList: ArrayBuffer[] = [];
    dataset.data.forEach(col => {
      transferList.push(col.data.buffer as ArrayBuffer);
      if (col.chunkMin) transferList.push(col.chunkMin.buffer as ArrayBuffer);
      if (col.chunkMax) transferList.push(col.chunkMax.buffer as ArrayBuffer);
    });

    (self as unknown as Worker).postMessage({ type: 'success', dataset }, transferList);
  } catch (error: unknown) {
    self.postMessage({ type: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};

async function parseCSV(file: File, settings?: ParseSettings) {
  const { delimiter = ',', decimalPoint = '.', startRow = 1, columnConfigs = [] } = settings || {};

  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let remainder = '';
  let isFirstChunk = true;
  let headers: string[] = [];
  const configsByIndex: (ColumnConfigEntry | undefined)[] = [];
  const activeCols: number[] = [];
  const finalHeaders: string[] = [];
  let numActive = 0;

  let capacity = 100000;
  let data: Float64Array[] = [];
  let categoricalMaps: Map<string, number>[] = [];
  const isComma = decimalPoint === ',';
  let actualRowCount = 0;
  let linesRead = 0;

  while (true) {
    const { done, value } = await reader.read();

    let chunk = '';
    if (value) {
      chunk = decoder.decode(value, { stream: !done });
    } else if (done) {
      chunk = decoder.decode();
    }

    if (!chunk && done) break;

    if (isFirstChunk && chunk) {
      if (chunk.charCodeAt(0) === 0xFEFF) {
        chunk = chunk.slice(1);
      }
      isFirstChunk = false;
    }

    const text = remainder + chunk;
    let start = 0;

    for (let i = 0; i < text.length; i++) {
      if (text[i] === '\n') {
        const line = text.substring(start, text[i - 1] === '\r' ? i - 1 : i).trim();
        start = i + 1;

        if (linesRead === 0) {
          headers = line.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
          if (headers.length === 0) throw new Error('Empty CSV file');

          configsByIndex = new Array(headers.length);
          for (let j = 0; j < headers.length; j++) {
            configsByIndex[j] = columnConfigs.find((c: ColumnConfigEntry) => c.index === j);
          }

          for (let j = 0; j < headers.length; j++) {
            if (configsByIndex[j]?.type !== 'ignore') {
              activeCols.push(j);
              finalHeaders.push(configsByIndex[j]?.name || headers[j]);
            }
          }

          numActive = activeCols.length;
          data = new Array(numActive);
          for (let k = 0; k < numActive; k++) {
            data[k] = new Float64Array(capacity);
          }
          categoricalMaps = new Array(numActive).fill(null).map(() => new Map<string, number>());
          linesRead++;
          continue;
        }

        if (linesRead < startRow) {
          linesRead++;
          continue;
        }

        linesRead++;

        if (!line) continue;

        if (actualRowCount >= capacity) {
          capacity = Math.floor(capacity * 1.5);
          for (let k = 0; k < numActive; k++) {
            const newData = new Float64Array(capacity);
            newData.set(data[k]);
            data[k] = newData;
          }
        }

        // Extremely fast line parser:
        // We know we are inside a loop that goes character by character in the outer loop,
        // but here we just process the `line` string. To keep it simple and correct, we'll stick to split for now,
        // but since we might hit memory limits with array allocation if split is slow, we should check it.
        const values = line.split(delimiter);
        for (let k = 0; k < numActive; k++) {
          const j = activeCols[k];
          let val = values[j];
          if (val !== undefined) {
             val = val.trim();
             if (val.length > 1 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
                 val = val.substring(1, val.length - 1);
             }
          }
          data[k][actualRowCount] = parseValue(val, configsByIndex[j], isComma, categoricalMaps[k]);
        }
        actualRowCount++;
      }
    }
    remainder = text.substring(start);

    if (done) break;
  }

  if (remainder.trim()) {
    const line = remainder.trim();
    if (linesRead === 0) {
      headers = line.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
      if (headers.length === 0) throw new Error('Empty CSV file');
      configsByIndex = new Array(headers.length);
      for (let j = 0; j < headers.length; j++) {
        configsByIndex[j] = columnConfigs.find((c: ColumnConfigEntry) => c.index === j);
      }
      for (let j = 0; j < headers.length; j++) {
        if (configsByIndex[j]?.type !== 'ignore') {
          activeCols.push(j);
          finalHeaders.push(configsByIndex[j]?.name || headers[j]);
        }
      }
      numActive = activeCols.length;
      data = new Array(numActive);
      for (let k = 0; k < numActive; k++) {
        data[k] = new Float64Array(capacity);
      }
      categoricalMaps = new Array(numActive).fill(null).map(() => new Map<string, number>());
      linesRead++;
    } else if (linesRead >= startRow) {
      if (actualRowCount >= capacity) {
        capacity = Math.floor(capacity * 1.5);
        for (let k = 0; k < numActive; k++) {
          const newData = new Float64Array(capacity);
          newData.set(data[k]);
          data[k] = newData;
        }
      }
      const values = line.split(delimiter);
      for (let k = 0; k < numActive; k++) {
        const j = activeCols[k];
        let val = values[j];
        if (val !== undefined) {
           val = val.trim();
           if (val.length > 1 && val.charCodeAt(0) === 34 && val.charCodeAt(val.length - 1) === 34) {
               val = val.substring(1, val.length - 1);
           }
        }
        data[k][actualRowCount] = parseValue(val, configsByIndex[j], isComma, categoricalMaps[k]);
      }
      actualRowCount++;
      linesRead++;
    }
  }

  if (linesRead === 0) {
    throw new Error('Empty CSV file');
  }

  for (let k = 0; k < numActive; k++) {
    if (data[k].length !== actualRowCount) {
      data[k] = data[k].subarray(0, actualRowCount);
    }
  }

  return { columns: finalHeaders, rowCount: actualRowCount, data: data };
}

function parseJSON(text: string, settings?: ParseSettings) {
  const { decimalPoint = '.', columnConfigs = [] } = settings || {};
  
  let raw;
  try {
    raw = secureJSONParse(text);
  } catch (error) {
    console.error('Worker: Failed to parse JSON data:', error);
    throw new Error('Invalid JSON format: ' + (error instanceof Error ? error.message : String(error)));
  }

  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format: Expected a non-empty array of objects');

  const allHeaders = Object.keys(raw[0]);
  const rowCount = raw.length;

  // ⚡ Bolt Optimization: Pre-calculate column configurations
  const configsByIndex = new Array(allHeaders.length);
  for (let j = 0; j < allHeaders.length; j++) {
    configsByIndex[j] = columnConfigs.find((c: ColumnConfigEntry) => c.index === j);
  }

  // ⚡ Bolt Optimization: Determine active columns upfront
  const activeCols: number[] = [];
  const finalHeaders: string[] = [];
  for (let j = 0; j < allHeaders.length; j++) {
     if (configsByIndex[j]?.type !== 'ignore') {
         activeCols.push(j);
         finalHeaders.push(configsByIndex[j]?.name || allHeaders[j]);
     }
  }
  const numActive = activeCols.length;

  // ⚡ Bolt Optimization: Column-major storage
  const data: Float64Array[] = new Array(numActive);
  for (let k = 0; k < numActive; k++) {
    data[k] = new Float64Array(rowCount);
  }

  const categoricalMaps = new Array(numActive).fill(null).map(() => new Map<string, number>());
  const isComma = decimalPoint === ',';

  for (let i = 0; i < rowCount; i++) {
    const row = raw[i];

    for (let k = 0; k < numActive; k++) {
      const j = activeCols[k];
      const header = allHeaders[j];
      const config = configsByIndex[j];

      const val = row[header];
      const valStr = val === undefined || val === null ? '' : String(val);
      data[k][i] = parseValue(valStr, config, isComma, categoricalMaps[k]);
    }
  }

  return { columns: finalHeaders, rowCount: rowCount, data: data };
}

function parseValue(val: string, config: ParseConfig | null | undefined, isComma: boolean, categoricalMap: Map<string, number>): number {
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
  // ⚡ Bolt Optimization: Fast path for parseValue
  const p = parseFloat(isComma ? val.replace(',', '.') : val);
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
