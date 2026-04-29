// src/hooks/useAutoScale.ts
import { useRef, useEffect, useCallback } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../services/persistence';
import { getColumnIndex } from '../utils/columns';

interface UseAutoScaleOptions {
  isLoaded: boolean;
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  activeYAxes: YAxisConfig[];
  activeXAxesUsed: XAxisConfig[];
  padding: { top: number; right: number; bottom: number; left: number };
  chartHeight: number;
  targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  startAnimation: () => void;
  lastAppliedViewId: { id: string } | null;
}

interface UseAutoScaleResult {
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
  handleAutoScaleX: (xAxisId?: string) => void;
}

export function useAutoScale({
  isLoaded, series, yAxes, activeYAxes, activeXAxesUsed,
  padding, chartHeight, targetXAxes, targetYs, startAnimation, lastAppliedViewId,
}: UseAutoScaleOptions): UseAutoScaleResult {
  const wasEmptyRef = useRef(true);

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
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
        const chunkMin = colY.chunkMin, chunkMax = colY.chunkMax;
        if (chunkMin && chunkMax && (endIdx - startIdx) > 512) {
          const startChunk = Math.floor(startIdx / 512), endChunk = Math.floor(endIdx / 512);
          for (let i = startIdx; i < (startChunk + 1) * 512; i++) { const v = yData[i] + refY; if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
          for (let c = startChunk + 1; c < endChunk; c++) { const vMin = chunkMin[c] + refY, vMax = chunkMax[c] + refY; if (vMin < yMin) yMin = vMin; if (vMax > yMax) yMax = vMax; }
          for (let i = endChunk * 512; i <= endIdx; i++) { const v = yData[i] + refY; if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
        } else {
          for (let i = startIdx; i <= endIdx; i++) { const v = yData[i] + refY; if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
        }
      }
    });

    if (yMin !== Infinity) {
      let nMin = yMin, nMax = yMax;
      const r = yMax - yMin || 1, p = r * 0.05;
      if (mouseY !== undefined) {
        if (mouseY < padding.top + chartHeight / 3) { nMin = yMin - r - 3 * p; nMax = yMax + p; }
        else if (mouseY > padding.top + 2 * chartHeight / 3) { nMin = yMin - p; nMax = yMax + r + 3 * p; }
        else { nMin = yMin - p; nMax = yMax + p; }
      } else { nMin = yMin - p; nMax = yMax + p; }
      targetYs.current[axisId] = { min: nMin, max: nMax };
      startAnimation();
    }
  }, [padding.top, chartHeight, targetYs, startAnimation]);

  const handleAutoScaleX = useCallback((xAxisId?: string) => {
    const state = useGraphStore.getState();
    if (state.datasets.length === 0) return;
    const activeDatasetIds = new Set<string>();
    state.series.forEach(s => activeDatasetIds.add(s.sourceId));
    const axesToScale = xAxisId ? [xAxisId] : activeXAxesUsed.map(a => a.id);
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
        targetXAxes.current[id] = { min: xMin - pad, max: xMax + pad };
      }
    });
    startAnimation();
  }, [startAnimation, activeXAxesUsed, targetXAxes]);

  // Initial load + empty-to-data transition
  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    if (state.series.length === 0 && state.datasets.length === 0) { wasEmptyRef.current = true; return; }
    if (wasEmptyRef.current && (state.xAxes[0].min !== 0 || state.xAxes[0].max !== 100)) wasEmptyRef.current = false;
    let shouldReset = wasEmptyRef.current;
    const datasetsByIdLocal = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsByIdLocal.set(d.id, d));
    if (!shouldReset && state.datasets.length > 0) {
      let anyDataVisible = false;
      const xAxesByIdLocal = new Map<string, XAxisConfig>();
      state.xAxes.forEach(a => xAxesByIdLocal.set(a.id, a));
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId), xAxis = xAxesByIdLocal.get(ds?.xAxisId || 'axis-1');
        if (!ds || !xAxis) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), xCol = ds.data[xIdx];
        if (xCol && xCol.bounds) {
          if (Math.max(0, Math.min(xAxis.max, xCol.bounds.max) - Math.max(xAxis.min, xCol.bounds.min)) > 0
            || (xAxis.min >= xCol.bounds.min && xAxis.max <= xCol.bounds.max)) anyDataVisible = true;
        }
      });
      if (!anyDataVisible) shouldReset = true;
    }
    if (shouldReset && state.datasets.length > 0) {
      wasEmptyRef.current = false;
      const xBounds = new Map<string, { min: number; max: number }>();
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId); if (!ds) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), col = ds.data[xIdx];
        if (!col || !col.bounds) return;
        const xId = ds.xAxisId || 'axis-1';
        const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity };
        xBounds.set(xId, { min: Math.min(cur.min, col.bounds.min), max: Math.max(cur.max, col.bounds.max) });
      });
      xBounds.forEach((bounds, id) => {
        if (bounds.min !== Infinity) {
          const pad = (bounds.max - bounds.min || 1) * 0.05;
          const nextX = { min: bounds.min - pad, max: bounds.max + pad };
          targetXAxes.current[id] = nextX;
          state.updateXAxis(id, nextX);
        }
      });
      const seriesByYAxisIdLocal = new Map<string, SeriesConfig[]>();
      state.series.forEach(s => {
        if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []);
        seriesByYAxisIdLocal.get(s.yAxisId)!.push(s);
      });
      activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || [];
        if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => {
          const ds = datasetsByIdLocal.get(s.sourceId); if (!ds) return;
          const yIdx = getColumnIndex(ds, s.yColumn), yCol = ds.data[yIdx];
          if (!yCol || !yCol.bounds) return;
          if (yCol.bounds.min < yMin) yMin = yCol.bounds.min;
          if (yCol.bounds.max > yMax) yMax = yCol.bounds.max;
        });
        if (yMin !== Infinity) {
          const pad = (yMax - yMin || 1) * 0.05;
          const nextY = { min: yMin - pad, max: yMax + pad };
          targetYs.current[axis.id] = nextY;
          state.updateYAxis(axis.id, nextY);
        }
      });
      startAnimation();
    }
  }, [isLoaded, startAnimation, series, yAxes, activeYAxes, targetXAxes, targetYs]);

  // View restoration
  useEffect(() => {
    if (!lastAppliedViewId) return;
    const view = useGraphStore.getState().views.find(v => v.id === lastAppliedViewId.id);
    if (!view) return;
    view.xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
    if (view.yAxes.length > 0) {
      view.yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
    } else {
      activeYAxes.forEach(a => handleAutoScaleY(a.id));
    }
    startAnimation();
  }, [lastAppliedViewId, startAnimation, activeYAxes, handleAutoScaleY, targetXAxes, targetYs]);

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
