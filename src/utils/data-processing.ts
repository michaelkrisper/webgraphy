
export interface ProcessedColumn {
  data: Float32Array;
  refPoint: number;
  bounds: { min: number; max: number };
}

/**
 * Processes a raw column of data into a format suitable for Webgraphy.
 * Calculates reference point, relative data (Float32Array), and bounds.
 */
export function processRawColumn(sourceData: Float64Array | number[]): ProcessedColumn {
  const rowCount = sourceData.length;

  let min = Infinity, max = -Infinity;
  let refPoint = 0;

  const colData = new Float32Array(rowCount);
  let startIdx = 0;

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

  // Single pass for the rest of the data: calculate bounds and relative data
  for (let i = startIdx; i < rowCount; i++) {
    const val = sourceData[i];
    if (val !== null && !Number.isNaN(val)) {
      if (val < min) min = val;
      if (val > max) max = val;

      const relativeVal = (val as number) - refPoint;
      colData[i] = relativeVal;
    } else {
      colData[i] = NaN;
    }
  }

  return {
    data: colData,
    refPoint,
    bounds: { min, max }
  };
}

/**
 * Smoothes an array of data using a simple moving average.
 * Handles NaN values by ignoring them in the average calculation.
 */
export function smoothArray(data: Float32Array, windowSize: number = 5): Float32Array {
  const result = new Float32Array(data.length);
  const halfWindow = Math.floor(windowSize / 2);

  for (let i = 0; i < data.length; i++) {
    let sum = 0;
    let count = 0;

    for (let j = i - halfWindow; j <= i + halfWindow; j++) {
      if (j >= 0 && j < data.length) {
        const val = data[j];
        if (!Number.isNaN(val)) {
          sum += val;
          count++;
        }
      }
    }

    if (count > 0) {
      result[i] = sum / count;
    } else {
      result[i] = data[i];
    }
  }

  return result;
}
