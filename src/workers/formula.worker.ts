// Formula Calculation Worker (v2.0 - Off-thread data processing with regression)
import { compileFormula } from '../utils/formula';
import { processRawColumn } from '../utils/data-processing';
import { linearRegression, polynomialRegression, exponentialRegression, logisticRegression, kdeSmoothing } from '../utils/regression';

// Regex patterns for regression/fitting functions
const REGRESSION_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /^linreg\(\[([^\]]+)\]\)$/i, type: 'linear' },
  { pattern: /^polyreg\(\[([^\]]+)\]\s*,\s*(\d+)\)$/i, type: 'poly' },
  { pattern: /^polyreg\(\[([^\]]+)\]\)$/i, type: 'poly_default' },
  { pattern: /^expreg\(\[([^\]]+)\]\)$/i, type: 'exponential' },
  { pattern: /^logreg\(\[([^\]]+)\]\)$/i, type: 'logistic' },
  { pattern: /^kde\(\[([^\]]+)\]\)$/i, type: 'kde' },
  { pattern: /^kde\(\[([^\]]+)\]\s*,\s*([0-9.]+)\)$/i, type: 'kde_bw' },
];

function tryRegressionFormula(
  formula: string, columns: string[], rowCount: number,
  columnData: { data: Float32Array; refPoint: number }[],
): Float64Array | null {
  const trimmed = formula.trim();

  for (const { pattern, type } of REGRESSION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const colName = match[1];
    // Find column index
    let yColIdx = columns.indexOf(colName);
    if (yColIdx === -1) {
      yColIdx = columns.findIndex(c => c.endsWith(`: ${colName}`) || c === colName);
    }
    if (yColIdx === -1) return null;

    // Build x and y arrays
    const xArr = new Float64Array(rowCount);
    const yArr = new Float64Array(rowCount);
    const xRef = columnData[0]?.refPoint || 0; // x column is first in columnData for regression
    const yRef = columnData[1]?.refPoint || 0;
    const xData = columnData[0]?.data;
    const yData = columnData[1]?.data;
    if (!xData || !yData) return null;

    for (let i = 0; i < rowCount; i++) {
      xArr[i] = xData[i] + xRef;
      yArr[i] = yData[i] + yRef;
    }

    switch (type) {
      case 'linear': return linearRegression(xArr, yArr);
      case 'poly': return polynomialRegression(xArr, yArr, parseInt(match[2], 10));
      case 'poly_default': return polynomialRegression(xArr, yArr, 3);
      case 'exponential': return exponentialRegression(xArr, yArr);
      case 'logistic': return logisticRegression(xArr, yArr);
      case 'kde': return kdeSmoothing(xArr, yArr);
      case 'kde_bw': return kdeSmoothing(xArr, yArr, parseFloat(match[2]));
    }
  }
  return null;
}

self.onmessage = (event) => {
  const { datasetId, name, formula, columns, rowCount, columnData } = event.data;

  try {
    // Try regression formulas first (they need full-column access)
    const regressionResult = tryRegressionFormula(formula, columns, rowCount, columnData);
    if (regressionResult) {
      const processed = processRawColumn(regressionResult);
      const newColumn = {
        isFloat64: false,
        refPoint: processed.refPoint,
        bounds: processed.bounds,
        data: processed.data,
        chunkMin: processed.chunkMin,
        chunkMax: processed.chunkMax
      };
      const transferList: Transferable[] = [newColumn.data.buffer, newColumn.chunkMin.buffer, newColumn.chunkMax.buffer];
      (self as unknown as Worker).postMessage({ type: 'success', newColumn, datasetId, name }, transferList);
      return;
    }

    const { evaluate, usedColumnIndices, error, createContext } = compileFormula(formula, columns);
    if (error) {
      self.postMessage({ type: 'error', error });
      return;
    }

    const resultData = new Float64Array(rowCount);
    const rowValues = new Array(usedColumnIndices.length);
    const ctx = createContext ? createContext() : undefined;

    for (let i = 0; i < rowCount; i++) {
      for (let j = 0; j < usedColumnIndices.length; j++) {
        rowValues[j] = columnData[j].data[i] + columnData[j].refPoint;
      }
      resultData[i] = evaluate(rowValues, ctx);
    }

    // Center-align rolling averages
    const avgMatch = formula.match(/avg(\d+)\s*\(/i);
    if (avgMatch && !formula.match(/avg\d+[smhd]\s*\(/i)) {
      const windowSize = parseInt(avgMatch[1], 10);
      const shift = Math.floor(windowSize / 2);
      if (shift > 0 && shift < rowCount) {
        const shifted = new Float64Array(rowCount);
        for (let i = 0; i < rowCount - shift; i++) {
          shifted[i] = resultData[i + shift];
        }
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
