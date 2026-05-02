// src/hooks/useAutoScale.ts
import { useRef, useEffect, useCallback } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../services/persistence';
import { getColumnIndex } from '../utils/columns';

interface UseAutoScaleOptions {
  isLoaded: boolean;
  series: SeriesConfig[];
  activeYAxes: YAxisConfig[];
  activeXAxesUsed: XAxisConfig[];
  padding: { top: number; right: number; bottom: number; left: number };
  chartHeight: number;
  targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  syncViewport: () => void;
}

interface UseAutoScaleResult {
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
  handleAutoScaleX: (xAxisId?: string) => void;
}

export function useAutoScale({
  isLoaded, series, activeYAxes, activeXAxesUsed,
  padding, chartHeight, targetXAxes, targetYs, syncViewport,
}: UseAutoScaleOptions): UseAutoScaleResult {
  const wasEmptyRef = useRef(true);

  // Use refs for dependencies to keep callbacks stable
  const depsRef = useRef({ padding, chartHeight, activeXAxesUsed, activeYAxes, syncViewport });
  depsRef.current = { padding, chartHeight, activeXAxesUsed, activeYAxes, syncViewport };

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
    const { padding: p, chartHeight: ch, syncViewport: sv } = depsRef.current;
    const state = useGraphStore.getState();
    const axisSeries = state.series.filter(s => s.yAxisId === axisId);
    if (axisSeries.length === 0) return;
    
    let yMin = Infinity, yMax = -Infinity;
    const datasetsByIdLocal = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsByIdLocal.set(d.id, d));
    const xAxesByIdLocal = new Map<string, XAxisConfig>();
    state.xAxes.forEach(a => xAxesByIdLocal.set(a.id, a));

    axisSeries.forEach(s => {
      const ds = datasetsByIdLocal.get(s.sourceId);
      const xAxis = xAxesByIdLocal.get(ds?.xAxisId || 'axis-1');
      if (!ds || !xAxis) return;
      const xIdx = getColumnIndex(ds, ds.xAxisColumn), yIdx = getColumnIndex(ds, s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;
      const colX = ds.data[xIdx], colY = ds.data[yIdx];
      if (!colX?.data || !colY?.data) return;
      const xData = colX.data, yData = colY.data, refX = colX.refPoint, refY = colY.refPoint;
      let startIdx = -1, endIdx = -1, low = 0, high = xData.length - 1;
      while (low <= high) { const mid = (low + high) >>> 1; if (xData[mid] + refX >= xAxis.min) { startIdx = mid; high = mid - 1; } else low = mid + 1; }
      low = 0; high = xData.length - 1;
      while (low <= high) { const mid = (low + high) >>> 1; if (xData[mid] + refX <= xAxis.max) { endIdx = mid; low = mid + 1; } else high = mid - 1; }
      if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
        for (let i = startIdx; i <= endIdx; i++) {
          const v = yData[i] + refY;
          if (v < yMin) yMin = v;
          if (v > yMax) yMax = v;
        }
      }
    });

    if (yMin !== Infinity) {
      let nMin = yMin, nMax = yMax;
      const r = yMax - yMin || 1, pad = r * 0.05;
      if (mouseY !== undefined) {
        if (mouseY < p.top + ch / 3) { nMin = yMin - r - 3 * pad; nMax = yMax + pad; }
        else if (mouseY > p.top + 2 * ch / 3) { nMin = yMin - pad; nMax = yMax + r + 3 * pad; }
        else { nMin = yMin - pad; nMax = yMax + pad; }
      } else { nMin = yMin - pad; nMax = yMax + pad; }
      
      // eslint-disable-next-line react-hooks/immutability
      targetYs.current[axisId] = { min: nMin, max: nMax };
      sv();
    }
  }, [targetYs]);

  const handleAutoScaleX = useCallback((xAxisId?: string) => {
    const { activeXAxesUsed: axUsed, syncViewport: sv } = depsRef.current;
    const state = useGraphStore.getState();
    if (state.datasets.length === 0) return;
    const activeDatasetIds = new Set<string>();
    state.series.forEach(s => activeDatasetIds.add(s.sourceId));
    const axesToScale = xAxisId ? [xAxisId] : axUsed.map(a => a.id);
    const xs = targetXAxes.current;
    
    axesToScale.forEach(id => {
      const activeDs = state.datasets.filter(d => (d.xAxisId || 'axis-1') === id && activeDatasetIds.has(d.id));
      if (activeDs.length === 0) return;
      let xMin = Infinity, xMax = -Infinity;
      activeDs.forEach(ds => {
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), col = ds.data[xIdx];
        if (col?.bounds) { if (col.bounds.min < xMin) xMin = col.bounds.min; if (col.bounds.max > xMax) xMax = col.bounds.max; }
      });
      if (xMin !== Infinity) {
        const pad = (xMax - xMin || 1) * 0.05;
        xs[id] = { min: xMin - pad, max: xMax + pad };
      }
    });
    sv();
  }, [targetXAxes]);

  // Initial load + empty-to-data transition
  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    
    // If no series, there's nothing to auto-scale or check visibility for.
    // We stay in "wasEmpty" state until at least one series is added.
    if (state.series.length === 0) {
      wasEmptyRef.current = true;
      return;
    }

    const datasetsByIdLocal = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsByIdLocal.set(d.id, d));

    // Determine if we need to reset the view (e.g., first data load or no data visible)
    let shouldReset = wasEmptyRef.current;

    if (!shouldReset && state.datasets.length > 0) {
      let hasValidData = false;
      let anyDataVisible = false;
      const xAxesByIdLocal = new Map<string, XAxisConfig>();
      state.xAxes.forEach(a => xAxesByIdLocal.set(a.id, a));

      const EPSILON = 1e-10;
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId);
        const xAxis = xAxesByIdLocal.get(ds?.xAxisId || 'axis-1');
        if (!ds || !xAxis) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn);
        const xCol = ds.data[xIdx];
        if (xCol && xCol.bounds && Number.isFinite(xCol.bounds.min) && Number.isFinite(xCol.bounds.max)) {
          hasValidData = true;
          // Robust intersection check: overlap if (min1 <= max2 && max1 >= min2)
          // Uses EPSILON to prevent infinite loops from tiny precision differences
          if (xAxis.min <= xCol.bounds.max + EPSILON && xAxis.max >= xCol.bounds.min - EPSILON) {
            anyDataVisible = true;
          }
        }
      });
      if (hasValidData && !anyDataVisible) shouldReset = true;
    }

    if (shouldReset && state.datasets.length > 0) {
      // Mark as no longer empty immediately to prevent re-entry before state update
      wasEmptyRef.current = false;
      
      const xUpdates: Record<string, { min: number, max: number }> = {};
      const yUpdates: Record<string, { min: number, max: number }> = {};
      
      // Calculate X bounds per axis
      const xBounds = new Map<string, { min: number; max: number }>();
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId);
        if (!ds) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn);
        const col = ds.data[xIdx];
        if (!col || !col.bounds || !Number.isFinite(col.bounds.min)) return;
        const xId = ds.xAxisId || 'axis-1';
        const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity };
        xBounds.set(xId, {
          min: Math.min(cur.min, col.bounds.min),
          max: Math.max(cur.max, col.bounds.max)
        });
      });

      const xs = targetXAxes.current;
      xBounds.forEach((bounds, id) => {
        if (bounds.min !== Infinity && !Number.isNaN(bounds.min) && !Number.isNaN(bounds.max)) {
          const pad = (bounds.max - bounds.min || 1) * 0.05;
          const nextX = { min: bounds.min - pad, max: bounds.max + pad };
          if (!Number.isNaN(nextX.min) && !Number.isNaN(nextX.max)) {
            xs[id] = nextX;
            xUpdates[id] = nextX;
          }
        }
      });

      // Calculate Y bounds per axis
      const seriesByYAxisIdLocal = new Map<string, SeriesConfig[]>();
      state.series.forEach(s => {
        if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []);
        seriesByYAxisIdLocal.get(s.yAxisId)!.push(s);
      });

      const ys = targetYs.current;
      depsRef.current.activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || [];
        if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => {
          const ds = datasetsByIdLocal.get(s.sourceId);
          if (!ds) return;
          const yIdx = getColumnIndex(ds, s.yColumn);
          const yCol = ds.data[yIdx];
          if (!yCol || !yCol.bounds || !Number.isFinite(yCol.bounds.min)) return;
          if (yCol.bounds.min < yMin) yMin = yCol.bounds.min;
          if (yCol.bounds.max > yMax) yMax = yCol.bounds.max;
        });

        if (yMin !== Infinity && !Number.isNaN(yMin) && !Number.isNaN(yMax)) {
          const pad = (yMax - yMin || 1) * 0.05;
          const nextY = { min: yMin - pad, max: yMax + pad };
          if (!Number.isNaN(nextY.min) && !Number.isNaN(nextY.max)) {
            ys[axis.id] = nextY;
            yUpdates[axis.id] = nextY;
          }
        }
      });

      if (Object.keys(xUpdates).length > 0 || Object.keys(yUpdates).length > 0) {
        state.batchUpdateAxes(xUpdates, yUpdates);
        syncViewport();
      }
    }
  }, [isLoaded, syncViewport, series, targetXAxes, targetYs]);

  // New series detection
  const prevSeriesRef = useRef(series);
  useEffect(() => {
    if (!isLoaded) return;
    if (series.length > prevSeriesRef.current.length) {
      const added = series[series.length - 1];
      if (added) handleAutoScaleY(added.yAxisId);
    } else {
      series.forEach(s => {
        const prev = prevSeriesRef.current.find(ps => ps.id === s.id);
        if (prev && (prev.yColumn !== s.yColumn || prev.sourceId !== s.sourceId)) handleAutoScaleY(s.yAxisId);
      });
    }
    prevSeriesRef.current = series;
  }, [series, isLoaded, handleAutoScaleY]);

  return { handleAutoScaleY, handleAutoScaleX };
}
