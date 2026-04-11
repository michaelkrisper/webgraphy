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
    else if (type === 'json') result = await parseJSON(file, settings);
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

    // ⚡ Bolt Optimization: Map configs by name for O(1) lookup
    const configByName = new Map<string, ColumnConfigEntry>();
    if (settings?.columnConfigs) {
      for (let i = 0; i < settings.columnConfigs.length; i++) {
        const config = settings.columnConfigs[i];
        if (config.name) configByName.set(config.name, config);
      }
    }

    const dataset = {
      id: crypto.randomUUID(),
      name: file.name,
      columns: columns,
      rowCount: rowCount,
      xAxisColumn: settings?.xAxisColumn,
      data: columns.map((colName, colIdx) => {
        const nonIgnoredName = nonIgnoredConfigs[colIdx]?.name;
        const config = configByName.get(colName) || (nonIgnoredName ? configByName.get(nonIgnoredName) : undefined);
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


function processCSVHeader(line: string, delimiter: string, columnConfigs: ColumnConfigEntry[], capacity: number) {
  const headers = line.split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));

  const configMap = new Map<number, ColumnConfigEntry>();
  for (let i = 0; i < columnConfigs.length; i++) {
    configMap.set(columnConfigs[i].index, columnConfigs[i]);
  }

  const configsByIndex = new Array(headers.length);
  for (let j = 0; j < headers.length; j++) {
    configsByIndex[j] = configMap.get(j);
  }

  const activeCols: number[] = [];
  const finalHeaders: string[] = [];

  for (let j = 0; j < headers.length; j++) {
    if (configsByIndex[j]?.type !== 'ignore') {
      activeCols.push(j);
      finalHeaders.push(configsByIndex[j]?.name || headers[j]);
    }
  }

  const numActive = activeCols.length;
  const data = new Array(numActive);
  for (let k = 0; k < numActive; k++) {
    data[k] = new Float64Array(capacity);
  }

  const categoricalMaps = new Array(numActive).fill(null).map(() => new Map<string, number>());

  return { configsByIndex, activeCols, finalHeaders, numActive, data, categoricalMaps };
}

function processCSVRow(
  line: string,
  delimiter: string,
  numActive: number,
  activeCols: number[],
  configsByIndex: (ColumnConfigEntry | undefined)[],
  isComma: boolean,
  categoricalMaps: Map<string, number>[],
  actualRowCount: number,
  data: Float64Array[]
) {
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
}

async function parseCSV(file: File, settings?: ParseSettings) {
  const { delimiter = ',', decimalPoint = '.', startRow = 1, columnConfigs = [] } = settings || {};

  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder('utf-8');

  let buffer = '';
  let lineCount = 0;
  let actualRowCount = 0;

  // We don't know the rowCount in advance when streaming, start with a reasonable capacity and double it when needed
  let capacity = 100000;

  let numActive = 0;
  let activeCols: number[] = [];
  let finalHeaders: string[] = [];
  let configsByIndex: (ColumnConfigEntry | undefined)[] = [];
  let data: Float64Array[] = [];
  let categoricalMaps: Map<string, number>[] = [];
  const isComma = decimalPoint === ',';

  let isFirstLine = true;

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    } else {
      buffer += decoder.decode();
    }

    // Strip BOM if present at the very beginning
    if (isFirstLine && buffer.charCodeAt(0) === 0xFEFF) {
      buffer = buffer.slice(1);
    }

    const lines = buffer.split(/\r?\n/);

    // Keep the last partial line in the buffer
    if (!done) {
      buffer = lines.pop() || '';
    } else {
      buffer = '';
    }

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) {
        if (!done || i < lines.length - 1 || line.length > 0) {
            // Only increment lineCount if it's an actual empty line in the middle of the file
            // Not a trailing empty newline at the end
             if (done && i === lines.length - 1 && line.length === 0) {
                 continue; // ignore trailing empty string
             }
             lineCount++;
        }
        continue;
      }

      if (isFirstLine && lineCount === 0) {
        const headerResult = processCSVHeader(line, delimiter, columnConfigs, capacity);
        configsByIndex = headerResult.configsByIndex;
        activeCols = headerResult.activeCols;
        finalHeaders = headerResult.finalHeaders;
        numActive = headerResult.numActive;
        data = headerResult.data;
        categoricalMaps = headerResult.categoricalMaps;
        isFirstLine = false;
      }
      
      if (lineCount >= startRow) {
        // Ensure capacity
        if (actualRowCount >= capacity) {
          capacity *= 2;
          for (let k = 0; k < numActive; k++) {
            const newData = new Float64Array(capacity);
            newData.set(data[k]);
            data[k] = newData;
          }
        }

        processCSVRow(line, delimiter, numActive, activeCols, configsByIndex, isComma, categoricalMaps, actualRowCount, data);
        actualRowCount++;
      }
      lineCount++;
    }

    if (done) {
      break;
    }
  }

  if (actualRowCount === 0 && lineCount === 0) {
      throw new Error('Empty CSV file');
  }


  for (let k = 0; k < numActive; k++) {
    if (data[k].length !== actualRowCount) {
      data[k] = data[k].subarray(0, actualRowCount);
    }
  }

  return { columns: finalHeaders, rowCount: actualRowCount, data: data };
}

async function parseJSON(file: File, settings?: ParseSettings) {
  const { decimalPoint = '.', columnConfigs = [] } = settings || {};
  
  const text = await file.text();
  let raw;
  try {
    // 🔒 Security Note: Using secureJSONParse instead of native JSON.parse to prevent Prototype Pollution vulnerabilities.
    raw = secureJSONParse(text);
  } catch (error) {
    console.error('Worker: Failed to parse JSON data:', error);
    throw new Error('Invalid JSON format: ' + (error instanceof Error ? error.message : String(error)));
  }

  if (!Array.isArray(raw) || raw.length === 0) throw new Error('Invalid JSON format: Expected a non-empty array of objects');

  const allHeaders = Object.keys(raw[0]);
  const rowCount = raw.length;

  // ⚡ Bolt Optimization: Pre-calculate column configurations
  const configMap = new Map<number, ColumnConfigEntry>();
  for (let i = 0; i < columnConfigs.length; i++) {
    configMap.set(columnConfigs[i].index, columnConfigs[i]);
  }

  const configsByIndex = new Array(allHeaders.length);
  for (let j = 0; j < allHeaders.length; j++) {
    configsByIndex[j] = configMap.get(j);
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
