// Data Parser Web Worker (v0.4.0 - Advanced Import Settings & Arbitrary Date Formats)

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

    const lodLevels = generateSynchronizedLOD(relativeData, rowCount);

    const dataset = {
      id: crypto.randomUUID(),
      name: file.name,
      columns: columns,
      rowCount: rowCount,
      data: columns.map((colName, colIdx) => {
        const config = settings?.columnConfigs?.find((c: any) => c.name === colName || (settings.columnConfigs.filter((cc: any) => cc.type !== 'ignore')[colIdx]?.name === colName));
        const isPotentialX = config?.type === 'date' || colIdx === 0 || colName.toLowerCase().includes('time') || colName.toLowerCase().includes('date');
        return {
          isFloat64: isPotentialX,
          refPoint: relativeData[colIdx].refPoint,
          bounds: colBounds[colIdx],
          levels: lodLevels[colIdx]
        };
      })
    };

    const transferList: ArrayBuffer[] = [];
    dataset.data.forEach(col => {
      col.levels.forEach(level => transferList.push(level.buffer as ArrayBuffer));
    });

    (self as any).postMessage({ type: 'success', dataset }, transferList);
  } catch (error: any) {
    self.postMessage({ type: 'error', error: error.message });
  }
};

/**
 * Generates LOD levels where all columns use the same sampled row indices.
 * This preserves X-Y pairing and ensures visual integrity.
 */
function generateSynchronizedLOD(relativeData: { data: Float32Array, refPoint: number }[], rowCount: number): Float32Array[][] {
  const numCols = relativeData.length;
  const levels: Float32Array[][] = relativeData.map(col => [col.data]);
  
  const factor = 8;
  let currentIndices = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) currentIndices[i] = i;

  while (levels[0].length < 8 && currentIndices.length > factor * 2) {
    const nextIndicesSet = new Set<number>();
    
    // Explicitly include global first and last indices for visual consistency
    nextIndicesSet.add(0);
    nextIndicesSet.add(rowCount - 1);

    for (let i = 0; i < currentIndices.length; i += factor) {
      const end = Math.min(i + factor, currentIndices.length);
      
      // Always include first and last of chunk
      nextIndicesSet.add(currentIndices[i]);
      nextIndicesSet.add(currentIndices[end - 1]);
      
      // For each column, find min and max in this chunk
      for (let j = 0; j < numCols; j++) {
        const colData = relativeData[j].data;
        let minVal = Infinity, maxVal = -Infinity;
        let minIdx = currentIndices[i], maxIdx = currentIndices[i];
        
        for (let k = i; k < end; k++) {
          const idx = currentIndices[k];
          const val = colData[idx];
          if (val < minVal) { minVal = val; minIdx = idx; }
          if (val > maxVal) { maxVal = val; maxIdx = idx; }
        }
        nextIndicesSet.add(minIdx);
        nextIndicesSet.add(maxIdx);
      }
    }
    
    const sortedIndices = Array.from(nextIndicesSet).sort((a, b) => a - b);
    const nextIdxArray = new Uint32Array(sortedIndices);

    // Create new data arrays for this level
    for (let j = 0; j < numCols; j++) {
      const colData = relativeData[j].data;
      const levelData = new Float32Array(nextIdxArray.length);
      for (let k = 0; k < nextIdxArray.length; k++) {
        levelData[k] = colData[nextIdxArray[k]];
      }
      levels[j].push(levelData);
    }
    
    const prevLength = currentIndices.length;
    currentIndices = nextIdxArray;

    if (currentIndices.length >= prevLength * 0.8 && currentIndices.length > 2000) {
      // If reduction is not significant, stop to prevent too many levels
      // (This can happen if there are many columns with different peaks)
      break;
    }
  }
  
  return levels;
}

function parseCSV(text: string, settings?: any) {
  const { delimiter = ',', decimalPoint = '.', startRow = 1, columnConfigs = [] } = settings || {};

  // Strip BOM if present
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/);
  if (lines.length === 0) throw new Error('Empty CSV file');

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  const data: number[][] = [];

  const categoricalMaps = new Array(headers.length).fill(null).map(() => new Map<string, number>());

  for (let i = startRow; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const rawValues = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const parsedRow: number[] = [];

    for (let j = 0; j < headers.length; j++) {
      const config = columnConfigs.find((c: any) => c.index === j);
      if (config?.type === 'ignore') continue;

      const val = rawValues[j];
      parsedRow.push(parseValue(val, config, decimalPoint, categoricalMaps[j]));
    }
    data.push(parsedRow);
  }

  const finalHeaders = headers.filter((_, i) => {
    const config = columnConfigs.find((c: any) => c.index === i);
    return config?.type !== 'ignore';
  }).map((h, i) => {
     // Re-find the original index to look up the correct config
     const originalIdx = headers.indexOf(h);
     const config = columnConfigs.find((c: any) => c.index === originalIdx);
     return config?.name || h;
  });

  return { columns: finalHeaders, rowCount: data.length, data: data };
}


function parseJSON(text: string, settings?: any) {
  const { decimalPoint = '.', columnConfigs = [] } = settings || {};
  const raw = JSON.parse(text);
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format');

  const allHeaders = Object.keys(raw[0]);
  const rowCount = raw.length;

  const categoricalMaps = new Array(allHeaders.length).fill(null).map(() => new Map<string, number>());
  const data = [];

  for (let i = 0; i < rowCount; i++) {
    const row = raw[i];
    const parsedRow: number[] = [];

    for (let j = 0; j < allHeaders.length; j++) {
      const header = allHeaders[j];
      const config = columnConfigs.find((c: any) => c.index === j);
      if (config?.type === 'ignore') continue;

      const val = String(row[header]);
      parsedRow.push(parseValue(val, config, decimalPoint, categoricalMaps[j]));
    }
    data.push(parsedRow);
  }

  const finalHeaders = allHeaders.filter((_, i) => {
    const config = columnConfigs.find((c: any) => c.index === i);
    return config?.type !== 'ignore';
  }).map((h, i) => {
     const originalIdx = allHeaders.indexOf(h);
     const config = columnConfigs.find((c: any) => c.index === originalIdx);
     return config?.name || h;
  });

  return { columns: finalHeaders, rowCount: data.length, data: data };
}

function parseValue(val: string, config: any, decimalPoint: string, categoricalMap: Map<string, number>): number {
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
  } catch (e) {
    const d = new Date(val);
    return d.getTime() / 1000;
  }
}
