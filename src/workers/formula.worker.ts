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
        data: processed.data
      };
      const transferList: Transferable[] = [newColumn.data.buffer];
      (self as unknown as Worker).postMessage({ type: 'success', newColumn, datasetId, name }, transferList);
      return;
    }

    // Two-pass for group-average functions (avgday/avghour/avgminute/avgsecond)
    // Optional alignment suffix: avgDayc (center, default), avgDayl (left/first), avgDayr (right/last)
    const groupAvgMatch = formula.trim().match(/^avg(day|hour|minute|second)([lcr])?\(\[([^\]]+)\]\)$/i);
    if (groupAvgMatch) {
      const granularity = groupAvgMatch[1].toLowerCase();
      const align = (groupAvgMatch[2]?.toLowerCase() ?? 'c') as 'l' | 'c' | 'r';
      const colName = groupAvgMatch[3];

      const compiled = compileFormula(formula, columns);
      if (compiled.error) {
        self.postMessage({ type: 'error', error: compiled.error });
        return;
      }

      const cols = columns as string[];
      const timeGlobalIdx = cols.findIndex((c: string) => c.toLowerCase().includes('time') || c.toLowerCase().includes('date')) ?? 0;
      const valueGlobalIdx = (() => {
        let idx = cols.indexOf(colName);
        if (idx === -1) idx = cols.findIndex((c: string) => c.endsWith(`: ${colName}`) || c === colName);
        return idx;
      })();
      if (valueGlobalIdx === -1) {
        (self as unknown as Worker).postMessage({ type: 'error', error: `Column not found: ${colName}` });
        return;
      }

      const localTimeIdx = compiled.usedColumnIndices.indexOf(timeGlobalIdx);
      const localValueIdx = compiled.usedColumnIndices.indexOf(valueGlobalIdx);
      if (localTimeIdx === -1 || localValueIdx === -1) {
        (self as unknown as Worker).postMessage({ type: 'error', error: 'Could not resolve column indices' });
        return;
      }

      const timeCol = columnData[localTimeIdx];
      const valCol = columnData[localValueIdx];

      const getTimeKey = (t: number): string => {
        const ms = t > 1e14 ? t / 1000 : t > 1e11 ? t : t * 1000;
        const d = new Date(ms);
        const base = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (granularity === 'day') return base;
        if (granularity === 'hour') return `${base}-${d.getHours()}`;
        if (granularity === 'minute') return `${base}-${d.getHours()}-${d.getMinutes()}`;
        return `${base}-${d.getHours()}-${d.getMinutes()}-${d.getSeconds()}`;
      };

      // Pass 1: aggregate per group, track representative row index per alignment
      const groupSums = new Map<string, number>();
      const groupCounts = new Map<string, number>();
      const groupFirst = new Map<string, number>();
      const groupLast = new Map<string, number>();
      for (let i = 0; i < rowCount; i++) {
        const t = timeCol.data[i] + timeCol.refPoint;
        const v = valCol.data[i] + valCol.refPoint;
        const key = getTimeKey(t);
        groupSums.set(key, (groupSums.get(key) ?? 0) + v);
        groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
        if (!groupFirst.has(key)) groupFirst.set(key, i);
        groupLast.set(key, i);
      }

      // Build compact (x, y) arrays — one point per group at representative position
      const repXVals: number[] = [];
      const repYVals: number[] = [];
      groupFirst.forEach((firstIdx, key) => {
        const lastIdx = groupLast.get(key)!;
        let repIdx: number;
        if (align === 'l') repIdx = firstIdx;
        else if (align === 'r') repIdx = lastIdx;
        else repIdx = Math.round((firstIdx + lastIdx) / 2);
        repXVals.push(timeCol.data[repIdx] + timeCol.refPoint);
        repYVals.push(groupSums.get(key)! / groupCounts.get(key)!);
      });

      // Return as compact dataset with only G rows
      const compactX = new Float64Array(repXVals);
      const compactY = new Float64Array(repYVals);
      // Sort by x in case groups are out of order
      const order = Array.from({ length: compactX.length }, (_, i) => i).sort((a, b) => compactX[a] - compactX[b]);
      const sortedX = new Float64Array(order.map(i => compactX[i]));
      const sortedY = new Float64Array(order.map(i => compactY[i]));

      const processedX = processRawColumn(sortedX);
      const processedY = processRawColumn(sortedY);
      (self as unknown as Worker).postMessage({
        type: 'success',
        newColumn: { isFloat64: false, refPoint: processedY.refPoint, bounds: processedY.bounds, data: processedY.data },
        sparseXColumn: { isFloat64: false, refPoint: processedX.refPoint, bounds: processedX.bounds, data: processedX.data },
        datasetId, name
      }, [processedY.data.buffer, processedX.data.buffer]);
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

    // Alignment shift for rolling averages (default: central)
    // Syntax: avg5(x) = central, avg5l(x) = left/trailing, avg5r(x) = right/leading
    //         avg5s(x) = central, avg5sl(x) = left, avg5sr(x) = right  (time-based)
    const avgAlignMatch = formula.match(/avg(\d+)(s|m|h|d)?([lcr])?\s*\(/i);
    if (avgAlignMatch) {
      const num = parseInt(avgAlignMatch[1], 10);
      const unit = avgAlignMatch[2]?.toLowerCase();
      const align = (avgAlignMatch[3]?.toLowerCase() ?? 'c') as 'l' | 'c' | 'r';

      let shift = 0;
      if (unit) {
        // Time-based: compute shift in rows using median row interval
        if (align !== 'l') {
          let windowSec = num;
          if (unit === 'm') windowSec = num * 60;
          else if (unit === 'h') windowSec = num * 3600;
          else if (unit === 'd') windowSec = num * 86400;

          // Estimate median row interval from time column (usedColumnIndices[0] is typically time)
          const timeLocalIdx = 0;
          const timeColData = columnData[timeLocalIdx];
          if (timeColData && rowCount > 1) {
            const sampleSize = Math.min(rowCount - 1, 200);
            const step = Math.floor((rowCount - 1) / sampleSize);
            let totalInterval = 0;
            let count = 0;
            for (let i = 0; i < rowCount - 1; i += step) {
              const t0 = timeColData.data[i] + timeColData.refPoint;
              const t1 = timeColData.data[i + 1] + timeColData.refPoint;
              const dtMs = Math.abs((t1 > 1e11 ? t1 : t1 * 1000) - (t0 > 1e11 ? t0 : t0 * 1000));
              if (dtMs > 0) { totalInterval += dtMs; count++; }
            }
            if (count > 0) {
              const medianIntervalSec = (totalInterval / count) / 1000;
              const halfRows = Math.round((windowSec / 2) / medianIntervalSec);
              shift = align === 'c' ? halfRows : windowSec / medianIntervalSec - 1;
              if (align === 'r') shift = Math.round(windowSec / medianIntervalSec) - 1;
            }
          }
        }
      } else {
        // Count-based
        if (align === 'c') shift = Math.floor(num / 2);
        else if (align === 'r') shift = num - 1;
        // 'l': shift = 0
      }

      if (shift !== 0 && shift < rowCount) {
        const out = new Float64Array(rowCount);
        if (shift > 0) {
          // Shift forward: each row i gets value from row i+shift (center/right lookahead)
          for (let i = 0; i < rowCount - shift; i++) out[i] = resultData[i + shift];
          for (let i = rowCount - shift; i < rowCount; i++) out[i] = resultData[rowCount - 1];
        } else {
          // Shift backward: leading window (unused currently but kept for symmetry)
          const s = -shift;
          for (let i = s; i < rowCount; i++) out[i] = resultData[i - s];
          for (let i = 0; i < s; i++) out[i] = resultData[0];
        }
        resultData.set(out);
      }
    }

    const processed = processRawColumn(resultData);
    
    const newColumn = {
      isFloat64: false,
      refPoint: processed.refPoint,
      bounds: processed.bounds,
      data: processed.data
    };

    const transferList: Transferable[] = [
      newColumn.data.buffer
    ];

    (self as unknown as Worker).postMessage({ type: 'success', newColumn, datasetId, name }, transferList);
  } catch (err) {
    (self as unknown as Worker).postMessage({ type: 'error', error: err instanceof Error ? err.message : String(err) });
  }
};
