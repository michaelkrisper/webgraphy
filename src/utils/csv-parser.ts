import type { ParseSettings, ColumnConfigEntry } from "./parser-types";
import { parseValue } from "./value-parser";

export function splitCSVLine(line: string, delimiter: string): string[] {
  if (delimiter.length === 1) {
    const delimChar = delimiter.charCodeAt(0);
    const vals: string[] = [];
    let start = 0;
    const lineLen = line.length;
    let inQuote = false;

    for (let i = 0; i < lineLen; i++) {
      const c = line.charCodeAt(i);
      if (c === 34) {
        inQuote = !inQuote;
      } else if (c === delimChar && !inQuote) {
        vals.push(line.substring(start, i));
        start = i + 1;
      }
    }
    vals.push(line.substring(start));
    return vals;
  }

  return line.split(delimiter);
}

function processCSVHeader(
  line: string,
  delimiter: string,
  columnConfigs: ColumnConfigEntry[],
  capacity: number,
) {
  const headers = splitCSVLine(line, delimiter).map((h) =>
    h.trim().replace(/^"|"$/g, ""),
  );

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
    if (configsByIndex[j]?.type !== "ignore") {
      activeCols.push(j);
      finalHeaders.push(configsByIndex[j]?.name || headers[j]);
    }
  }

  const numActive = activeCols.length;
  const data = new Array(numActive);
  for (let k = 0; k < numActive; k++) {
    data[k] = new Float64Array(capacity);
  }

  const categoricalMaps = new Array(numActive)
    .fill(null)
    .map(() => new Map<string, number>());

  return {
    configsByIndex,
    activeCols,
    finalHeaders,
    numActive,
    data,
    categoricalMaps,
  };
}

function findNextDelimiterIndex(
  line: string,
  start: number,
  lineLen: number,
  delimChar: number,
): number {
  let inQuote = false;
  let end = start;
  while (end < lineLen) {
    const c = line.charCodeAt(end);
    if (c === 34) {
      inQuote = !inQuote;
    } else if (c === delimChar && !inQuote) {
      break;
    }
    end++;
  }
  return end;
}

function extractCSVValue(line: string, start: number, end: number): string {
  let vStart = start;
  let vEnd = end - 1;

  // Inline trim() logic
  while (vStart <= vEnd && line.charCodeAt(vStart) <= 32) vStart++;
  while (vEnd >= vStart && line.charCodeAt(vEnd) <= 32) vEnd--;

  if (vStart <= vEnd) {
    // Handle surrounding quotes
    if (
      line.charCodeAt(vStart) === 34 &&
      line.charCodeAt(vEnd) === 34 &&
      vEnd > vStart
    ) {
      vStart++;
      vEnd--;
    }
    return line.substring(vStart, vEnd + 1);
  }
  return "";
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
  data: Float64Array[],
) {
  // Optimization: When the delimiter is a single character, avoiding String.split()
  // and manually iterating over the string provides a significant performance boost
  // because it prevents the allocation of intermediate arrays and strings for discarded columns.
  const delimLen = delimiter.length;

  if (delimLen === 1) {
    let start = 0;
    let currentCol = 0;
    const delimChar = delimiter.charCodeAt(0);
    const lineLen = line.length;

    for (let k = 0; k < numActive; k++) {
      const targetCol = activeCols[k];

      // Fast forward to target column
      while (currentCol < targetCol && start < lineLen) {
        start = findNextDelimiterIndex(line, start, lineLen, delimChar);
        if (start < lineLen) {
          start++;
          currentCol++;
        }
      }

      let val = "";
      if (start < lineLen) {
        const end = findNextDelimiterIndex(line, start, lineLen, delimChar);
        val = extractCSVValue(line, start, end);
        start = end + 1;
        currentCol++;
      } else if (start === lineLen) {
        // Handle empty value at the very end of line if we expect it
        if (currentCol < targetCol) {
          val = "";
        }
        // Move past so we don't process it again
        start++;
        currentCol++;
      }

      data[k][actualRowCount] = parseValue(
        val,
        configsByIndex[activeCols[k]],
        isComma,
        categoricalMaps[k],
      );
    }
  } else {
    // Fallback for multi-character delimiters
    const values = line.split(delimiter);
    for (let k = 0; k < numActive; k++) {
      const j = activeCols[k];
      let val = values[j];

      if (val !== undefined) {
        val = val.trim();
        if (
          val.length > 1 &&
          val.charCodeAt(0) === 34 &&
          val.charCodeAt(val.length - 1) === 34
        ) {
          val = val.substring(1, val.length - 1);
        }
      } else {
        val = "";
      }

      data[k][actualRowCount] = parseValue(
        val,
        configsByIndex[j],
        isComma,
        categoricalMaps[k],
      );
    }
  }
}

async function* readCSVChunks(file: File) {
  const stream = file.stream();
  const reader = stream.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";
  let isFirstChunk = true;

  while (true) {
    const { done, value } = await reader.read();

    if (value) {
      buffer += decoder.decode(value, { stream: true });
    } else {
      buffer += decoder.decode();
    }

    // Strip BOM if present at the very beginning
    if (isFirstChunk && buffer.charCodeAt(0) === 0xfeff) {
      buffer = buffer.slice(1);
    }

    const lines = buffer.split(/\r?\n/);

    // Keep the last partial line in the buffer
    if (!done) {
      buffer = lines.pop() || "";
    } else {
      buffer = "";
    }

    yield { lines, done };
    isFirstChunk = false;

    if (done) {
      break;
    }
  }
}

export async function parseCSV(file: File, settings?: ParseSettings) {
  const {
    delimiter = ",",
    decimalPoint = ".",
    startRow = 1,
    commentChar,
    columnConfigs = [],
  } = settings || {};

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
  const isComma = decimalPoint === ",";

  let isFirstLine = true;

  for await (const { lines, done } of readCSVChunks(file)) {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();

      // Skip lines that start with the comment character
      if (commentChar && line.startsWith(commentChar)) {
        continue;
      }

      if (!line) {
        // Count every blank line except the artifact left by a trailing
        // newline, which only appears as the last entry of the final chunk.
        // (Per-chunk position is unreliable: readCSVChunks holds back the
        // last partial line, so chunk boundaries are arbitrary.)
        if (!(done && i === lines.length - 1)) {
          lineCount++;
        }
        continue;
      }

      if (isFirstLine && lineCount === startRow - 1) {
        const headerResult = processCSVHeader(
          line,
          delimiter,
          columnConfigs,
          capacity,
        );
        configsByIndex = headerResult.configsByIndex;
        activeCols = headerResult.activeCols;
        finalHeaders = headerResult.finalHeaders;
        numActive = headerResult.numActive;
        data = headerResult.data;
        categoricalMaps = headerResult.categoricalMaps;
        isFirstLine = false;
      }

      if (lineCount >= startRow && !isFirstLine) {
        // Ensure capacity
        if (actualRowCount >= capacity) {
          capacity *= 2;
          for (let k = 0; k < numActive; k++) {
            const newData = new Float64Array(capacity);
            newData.set(data[k]);
            data[k] = newData;
          }
        }

        processCSVRow(
          line,
          delimiter,
          numActive,
          activeCols,
          configsByIndex,
          isComma,
          categoricalMaps,
          actualRowCount,
          data,
        );
        actualRowCount++;
      }
      lineCount++;
    }
  }

  if (actualRowCount === 0 && lineCount === 0) {
    throw new Error("Empty CSV file");
  }

  for (let k = 0; k < numActive; k++) {
    if (data[k].length !== actualRowCount) {
      data[k] = data[k].subarray(0, actualRowCount);
    }
  }

  return {
    columns: finalHeaders,
    rowCount: actualRowCount,
    data: data,
    categoricalMaps,
  };
}
