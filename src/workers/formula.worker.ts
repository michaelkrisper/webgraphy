// Formula Calculation Worker (v1.0 - Off-thread data processing)
import { compileFormula } from '../utils/formula';
import { processRawColumn } from '../utils/data-processing';

self.onmessage = (event) => {
  const { datasetId, name, formula, columns, rowCount, columnData } = event.data;

  try {
    const { evaluate, usedColumnIndices, error, createContext } = compileFormula(formula, columns);
    if (error) {
      self.postMessage({ type: 'error', error });
      return;
    }

    const resultData = new Float64Array(rowCount);
    // columnData contains { data: Float32Array, refPoint: number } for each used column
    const rowValues = new Array(usedColumnIndices.length);
    const ctx = createContext ? createContext() : undefined;

    for (let i = 0; i < rowCount; i++) {
      for (let j = 0; j < usedColumnIndices.length; j++) {
        rowValues[j] = columnData[j].data[i] + columnData[j].refPoint;
      }
      resultData[i] = evaluate(rowValues, ctx);
    }

    // Center-align rolling averages: shift output left by half the window size
    // Detect avgN pattern in formula and apply shift
    const avgMatch = formula.match(/avg(\d+)\s*\(/i);
    if (avgMatch && !formula.match(/avg\d+[smhd]\s*\(/i)) {
      const windowSize = parseInt(avgMatch[1], 10);
      const shift = Math.floor(windowSize / 2);
      if (shift > 0 && shift < rowCount) {
        const shifted = new Float64Array(rowCount);
        for (let i = 0; i < rowCount - shift; i++) {
          shifted[i] = resultData[i + shift];
        }
        // Fill tail with last valid values
        for (let i = rowCount - shift; i < rowCount; i++) {
          shifted[i] = resultData[rowCount - 1];
        }
        resultData.set(shifted);
      }
    }

    const processed = processRawColumn(resultData);
    
    const newColumn = {
      isFloat64: false,
      refPoint: processed.refPoint,
      bounds: processed.bounds,
      data: processed.data,
      chunkMin: processed.chunkMin,
      chunkMax: processed.chunkMax
    };

    const transferList: Transferable[] = [
      newColumn.data.buffer,
      newColumn.chunkMin.buffer,
      newColumn.chunkMax.buffer
    ];

    (self as unknown as Worker).postMessage({ type: 'success', newColumn, datasetId, name }, transferList);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
