import { type Dataset, type SeriesConfig, type XAxisConfig, type ViewSnapshot } from '../services/persistence';
import { getColumnIndex } from './columns';

interface InterestingSpot {
  name: string;
  xCenter: number;
  xAxisId: string;
  yAxisId: string;
  yCenter: number;
  importance: number;
}

export function findInterestingSpots(
  datasets: Dataset[],
  series: SeriesConfig[],
  xAxes: XAxisConfig[],
): ViewSnapshot[] {
  const visibleSeries = series.filter(s => !s.hidden);
  if (visibleSeries.length === 0) return [];

  const datasetsById = new Map<string, Dataset>();
  for (const d of datasets) {
    datasetsById.set(d.id, d);
  }

  const spots: InterestingSpot[] = [];

  for (const s of visibleSeries) {
    const ds = datasetsById.get(s.sourceId);
    if (!ds) continue;

    const xIdx = getColumnIndex(ds, ds.xAxisColumn);
    const yIdx = getColumnIndex(ds, s.yColumn);
    if (xIdx === -1 || yIdx === -1) continue;

    const xCol = ds.data[xIdx];
    const yCol = ds.data[yIdx];
    const xRef = xCol.refPoint || 0;
    const yRef = yCol.refPoint || 0;
    const n = ds.rowCount;
    if (n < 3) continue;

    const xAxisId = ds.xAxisId || 'axis-1';

    // Find global min and max
    let minVal = Infinity, maxVal = -Infinity;
    let minIdx = 0, maxIdx = 0;
    for (let i = 0; i < n; i++) {
      const v = yCol.data[i] + yRef;
      if (v < minVal) { minVal = v; minIdx = i; }
      if (v > maxVal) { maxVal = v; maxIdx = i; }
    }
    const range = maxVal - minVal;
    if (range === 0) continue;

    spots.push({
      name: `${s.name || s.yColumn} — Maximum`,
      xCenter: xCol.data[maxIdx] + xRef,
      xAxisId,
      yAxisId: s.yAxisId,
      yCenter: maxVal,
      importance: 1.0,
    });

    spots.push({
      name: `${s.name || s.yColumn} — Minimum`,
      xCenter: xCol.data[minIdx] + xRef,
      xAxisId,
      yAxisId: s.yAxisId,
      yCenter: minVal,
      importance: 0.9,
    });

    // Find biggest rate changes (steepest slopes)
    const slopeWindowSize = Math.max(1, Math.floor(n / 200));
    let maxSlope = 0;
    let maxSlopeIdx = 0;
    for (let i = slopeWindowSize; i < n - slopeWindowSize; i++) {
      const dx = (xCol.data[i + slopeWindowSize] + xRef) - (xCol.data[i - slopeWindowSize] + xRef);
      if (Math.abs(dx) < 1e-12) continue;
      const dy = (yCol.data[i + slopeWindowSize] + yRef) - (yCol.data[i - slopeWindowSize] + yRef);
      const slope = Math.abs(dy / dx);
      if (slope > maxSlope) { maxSlope = slope; maxSlopeIdx = i; }
    }

    if (maxSlope > 0) {
      spots.push({
        name: `${s.name || s.yColumn} — Steepest Change`,
        xCenter: xCol.data[maxSlopeIdx] + xRef,
        xAxisId,
        yAxisId: s.yAxisId,
        yCenter: yCol.data[maxSlopeIdx] + yRef,
        importance: 0.85,
      });
    }
    // Find anomalies: points with z-score > 3 relative to local window
    const windowSize = Math.max(10, Math.floor(n / 50));
    let bestAnomaly = { idx: -1, score: 0 };
    for (let i = windowSize; i < n - windowSize; i++) {
      let localSum = 0, localSqSum = 0;
      for (let j = i - windowSize; j < i + windowSize; j++) {
        const v = yCol.data[j] + yRef;
        localSum += v;
        localSqSum += v * v;
      }
      const localN = windowSize * 2;
      const localMean = localSum / localN;
      const localStd = Math.sqrt(localSqSum / localN - localMean * localMean);
      if (localStd < 1e-12) continue;
      const val = yCol.data[i] + yRef;
      const zScore = Math.abs(val - localMean) / localStd;
      if (zScore > bestAnomaly.score) {
        bestAnomaly = { idx: i, score: zScore };
      }
    }
    if (bestAnomaly.score > 3) {
      spots.push({
        name: `${s.name || s.yColumn} — Anomaly (z=${bestAnomaly.score.toFixed(1)})`,
        xCenter: xCol.data[bestAnomaly.idx] + xRef,
        xAxisId,
        yAxisId: s.yAxisId,
        yCenter: yCol.data[bestAnomaly.idx] + yRef,
        importance: Math.min(0.95, 0.7 + bestAnomaly.score * 0.05),
      });
    }
  }

  // Find intersections between series on same x-axis
  const seriesByXAxis: Record<string, { s: SeriesConfig; ds: Dataset }[]> = {};
  for (const s of visibleSeries) {
    const ds = datasetsById.get(s.sourceId);
    if (!ds) continue;
    const xAxisId = ds.xAxisId || 'axis-1';
    if (!seriesByXAxis[xAxisId]) seriesByXAxis[xAxisId] = [];
    seriesByXAxis[xAxisId].push({ s, ds });
  }

  for (const group of Object.values(seriesByXAxis)) {
    if (group.length < 2) continue;
    // Check pairs on same Y-axis for intersections
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        if (group[i].s.yAxisId !== group[j].s.yAxisId) continue;
        const ix = findIntersection(group[i].ds, group[i].s, group[j].ds, group[j].s);
        if (ix) {
          spots.push({
            ...ix,
            importance: 0.8,
          });
        }
      }
    }
  }

  // Sort by importance, take top 8
  spots.sort((a, b) => b.importance - a.importance);
  const topSpots = spots.slice(0, 8);

  // Convert spots to view snapshots
  return topSpots.map((spot, idx): ViewSnapshot => {
    const xAxis = xAxes.find(a => a.id === spot.xAxisId) || xAxes[0];
    const xRange = (xAxis.max - xAxis.min) * 0.15; // 15% window around spot

    return {
      id: crypto.randomUUID(),
      name: `${idx + 1}. ${spot.name}`,
      xAxes: xAxes.map(a => a.id === spot.xAxisId
        ? { id: a.id, min: spot.xCenter - xRange, max: spot.xCenter + xRange }
        : { id: a.id, min: a.min, max: a.max }
      ),
      yAxes: [], // Empty = don't change Y axes, let auto-scale handle it
    };
  });
}

function findIntersection(
  ds1: Dataset, s1: SeriesConfig,
  ds2: Dataset, s2: SeriesConfig,
): { name: string; xCenter: number; xAxisId: string; yAxisId: string; yCenter: number } | null {
  const x1Idx = getColumnIndex(ds1, ds1.xAxisColumn);
  const y1Idx = getColumnIndex(ds1, s1.yColumn);
  const x2Idx = getColumnIndex(ds2, ds2.xAxisColumn);
  const y2Idx = getColumnIndex(ds2, s2.yColumn);
  if (x1Idx === -1 || y1Idx === -1 || x2Idx === -1 || y2Idx === -1) return null;

  const x1Col = ds1.data[x1Idx], y1Col = ds1.data[y1Idx];
  const x2Col = ds2.data[x2Idx], y2Col = ds2.data[y2Idx];
  const x1Ref = x1Col.refPoint || 0, y1Ref = y1Col.refPoint || 0;
  const x2Ref = x2Col.refPoint || 0, y2Ref = y2Col.refPoint || 0;

  // Sample both series at regular intervals and find sign changes
  const n = Math.min(ds1.rowCount, ds2.rowCount);
  const step = Math.max(1, Math.floor(n / 500));

  for (let i = step; i < n; i += step) {
    const x1 = x1Col.data[i] + x1Ref;
    const x2 = x2Col.data[i] + x2Ref;
    // Only compare if x values are close enough
    if (Math.abs(x1 - x2) > Math.abs(x1) * 0.01) continue;

    const y1curr = y1Col.data[i] + y1Ref;
    const y2curr = y2Col.data[i] + y2Ref;
    const y1prev = y1Col.data[i - step] + y1Ref;
    const y2prev = y2Col.data[i - step] + y2Ref;

    const diffCurr = y1curr - y2curr;
    const diffPrev = y1prev - y2prev;

    if (diffCurr * diffPrev < 0) {
      // Sign change = intersection
      return {
        name: `${s1.name || s1.yColumn} ∩ ${s2.name || s2.yColumn}`,
        xCenter: x1,
        xAxisId: ds1.xAxisId || 'axis-1',
        yAxisId: s1.yAxisId,
        yCenter: (y1curr + y2curr) / 2,
      };
    }
  }

  return null;
}
