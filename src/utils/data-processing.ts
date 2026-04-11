
export const CHUNK_SIZE = 512;

export interface ProcessedColumn {
  data: Float32Array;
  refPoint: number;
  bounds: { min: number; max: number };
  chunkMin: Float32Array;
  chunkMax: Float32Array;
}

/**
 * Processes a raw column of data into a format suitable for Webgraphy.
 * Calculates reference point, relative data (Float32Array), bounds, and min/max chunks.
 */
export function processRawColumn(sourceData: Float64Array | number[]): ProcessedColumn {
  const rowCount = sourceData.length;
  const numChunks = Math.ceil(rowCount / CHUNK_SIZE);

  let min = Infinity, max = -Infinity;
  let refPoint = 0;

  const colData = new Float32Array(rowCount);
  let startIdx = 0;

  const chunkMin = new Float32Array(numChunks).fill(Infinity);
  const chunkMax = new Float32Array(numChunks).fill(-Infinity);

  // Find reference point first (usually row 0, but could be later if NaN)
  // Any NaNs before the reference point are copied as NaN
  for (; startIdx < rowCount; startIdx++) {
    const val = sourceData[startIdx];
    if (val !== null && !Number.isNaN(val)) {
      refPoint = val;
      break;
    }
    colData[startIdx] = NaN;
  }

  // Single pass for the rest of the data: calculate bounds, chunk min/max and relative data
  for (let i = startIdx; i < rowCount; i++) {
    const val = sourceData[i];
    if (val !== null && !Number.isNaN(val)) {
      if (val < min) min = val;
      if (val > max) max = val;

      const chunkIdx = Math.floor(i / CHUNK_SIZE);
      if (val < chunkMin[chunkIdx]) chunkMin[chunkIdx] = val;
      if (val > chunkMax[chunkIdx]) chunkMax[chunkIdx] = val;

      colData[i] = (val as number) - refPoint;
    } else {
      colData[i] = NaN;
    }
  }

  return {
    data: colData,
    refPoint,
    bounds: { min, max },
    chunkMin,
    chunkMax
  };
}
