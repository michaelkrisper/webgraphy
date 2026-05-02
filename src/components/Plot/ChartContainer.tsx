/* eslint-disable react-hooks/refs */
// src/components/Plot/ChartContainer.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { THEMES } from '../../themes';
import { applyKeyboardZoom, syncAxesWithTargets, type AxesFrame } from '../../utils/animation';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset, type XAxisConfig, type YAxisConfig } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels } from '../../utils/time';
import { calcNumericStep, calcNumericPrecision, calcNumericTicks, calcYAxisTicks } from '../../utils/axisCalculations';
import { WebGLRenderer, type WebGLRendererHandle } from './WebGLRenderer';
import { ChartLegend } from './ChartLegend';
import { GridLines, type GridLinesHandle } from './GridLines';
import { AxesLayer, type AxesLayerHandle } from './AxesLayer';
import { Crosshair } from './Crosshair';
import { BenchmarkOverlay } from './BenchmarkOverlay';
import { usePanZoom } from '../../hooks/usePanZoom';
import { useAutoScale } from '../../hooks/useAutoScale';
import ErrorBoundary from '../ErrorBoundary';
import { type XAxisLayout, type YAxisLayout, type XAxisMetrics } from './chartTypes';

type DatasetsByAxisId = Record<string, Dataset[]>;

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };
const BASE_PADDING_MOBILE = { top: 10, right: 10, bottom: 40, left: 10 };

const getXAxisMetrics = (isMobile: boolean, xMode: 'date' | 'numeric'): Omit<XAxisMetrics, 'id' | 'cumulativeOffset'> => {
  if (xMode === 'date') {
    return { height: isMobile ? 50 : 60, labelBottom: isMobile ? 18 : 22, secLabelBottom: isMobile ? 32 : 38, titleBottom: isMobile ? 44 : 52 };
  }
  return { height: 40, labelBottom: 18, secLabelBottom: 0, titleBottom: 32 };
};

const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const series = useGraphStore(s => s.series);
  const xAxes = useGraphStore(s => s.xAxes);
  const yAxes = useGraphStore(s => s.yAxes);
  const isLoaded = useGraphStore(s => s.isLoaded);
  const lastAppliedViewId = useGraphStore(s => s.lastAppliedViewId);
  const datasets = useGraphStore(s => s.datasets);
  const highlightedSeriesId = useGraphStore(s => s.highlightedSeriesId);
  const legendVisible = useGraphStore(s => s.legendVisible);
  const [themeName] = useTheme();
  const themeColors = THEMES[themeName];

  const xAxesById = useMemo(() => { const m = new Map<string, XAxisConfig>(); xAxes.forEach(a => m.set(a.id, a)); return m; }, [xAxes]);
  const yAxesById = useMemo(() => { const m = new Map(); yAxes.forEach(a => m.set(a.id, a)); return m; }, [yAxes]);

  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);

  const targetXAxes = useRef<Record<string, { min: number; max: number }>>({});
  const targetYs = useRef<Record<string, { min: number; max: number }>>({});
  const webglRef = useRef<WebGLRendererHandle | null>(null);
  const axesLayerRef = useRef<AxesLayerHandle | null>(null);
  const gridLinesRef = useRef<GridLinesHandle | null>(null);
  const lockedXSteps = useRef<Record<string, { step?: number; timeStep?: ReturnType<typeof getTimeStep> }>>({});
  const lockedYSteps = useRef<Record<string, number>>({});

  const activeXAxesUsedRef = useRef<XAxisConfig[]>([]);
  const chartWidthRef = useRef(0);
  const chartHeightRef = useRef(0);

  const buildLiveAxes = useCallback((
    xUpdates: Record<string, { min: number; max: number }>,
    yUpdates: Record<string, { min: number; max: number }>
  ) => {
    const state = useGraphStore.getState();
    const liveX = state.xAxes.map(a => xUpdates[a.id] ? { ...a, ...xUpdates[a.id] } : a);
    const liveY = state.yAxes.map(a => yUpdates[a.id] ? { ...a, ...yUpdates[a.id] } : a);
    return { liveX, liveY };
  }, []);

  const computeXAxesLayout = useCallback((liveXAxes: XAxisConfig[]): XAxisLayout[] => {
    const activeDsIds = new Set(series.map(s => s.sourceId));
    const dsByX: DatasetsByAxisId = {};
    datasets.forEach(d => {
      if (activeDsIds.has(d.id)) {
        const xId = d.xAxisId || 'axis-1';
        if (!dsByX[xId]) dsByX[xId] = [];
        dsByX[xId].push(d);
      }
    });
    return liveXAxes.filter(axis =>
      datasets.some(d => series.some(s => s.sourceId === d.id) && (d.xAxisId || 'axis-1') === axis.id)
    ).map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date';
      const dss = dsByX[axis.id] || [];
      const title = Array.from(new Set(dss.map((d: Dataset) => d.xAxisColumn))).join(' / ');
      const color = themeColors.labelColor;
      const cw = chartWidthRef.current;
      if (r <= 0 || cw <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
      if (!isDate) {
        const locked = lockedXSteps.current[axis.id]?.step;
        const step = locked ?? calcNumericStep(r, Math.max(2, Math.floor(cw / 60)));
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedXSteps.current[axis.id]?.timeStep;
        const ts = lockedTs ?? getTimeStep(r, Math.max(2, Math.floor(cw / 80)));
        return { id: axis.id, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [series, datasets, themeColors.labelColor, lockedXSteps]);

  const computeYAxesLayout = useCallback((liveYAxes: YAxisConfig[]): YAxisLayout[] => {
    const isMobile = width < 768 || height < 500;
    const chartH = Math.max(0, height - (isMobile ? 40 : 60) - 20);
    const usedYAxisIds = new Set(series.map(s => s.yAxisId));
    return liveYAxes.filter(a => usedYAxisIds.has(a.id)).map(axis => {
      const locked = lockedYSteps.current[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartH, locked);
      lockedYSteps.current[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [width, height, series, lockedYSteps]);

  const syncViewport = useCallback(() => {
    const state = useGraphStore.getState();
    const kbZoom = applyKeyboardZoom(state, pressedKeysRef.current, targetXAxes.current, targetYs.current);
    
    const { xUpdates, yUpdates }: AxesFrame = syncAxesWithTargets(state, targetXAxes.current, targetYs.current);

    const hasUpdates = Object.keys(xUpdates).length > 0 || Object.keys(yUpdates).length > 0;
    if (hasUpdates) {
      const { liveX, liveY } = buildLiveAxes(xUpdates, yUpdates);

      webglRef.current?.redraw(liveX, liveY);

      const xLayout = computeXAxesLayout(liveX);
      const yLayout = computeYAxesLayout(liveY);
      const activeXAxesNow = activeXAxesUsedRef.current;
      const xVp = liveX
        .filter(a => activeXAxesNow.some(ax => ax.id === a.id))
        .map(a => ({ id: a.id, xMin: a.min, xMax: a.max }));
      const yVp = yLayout.map(a => ({
        id: a.id,
        xMin: liveX[0]?.min ?? 0,
        xMax: liveX[0]?.max ?? 1,
        yMin: a.min,
        yMax: a.max,
      }));
      axesLayerRef.current?.redraw(xLayout, yLayout);
      gridLinesRef.current?.redraw(xLayout, yLayout, xVp, yVp);

      state.batchUpdateAxes(xUpdates, yUpdates);
    }
    // If keyboard zoom is active, we still need to schedule the next frame to keep zooming
    if (kbZoom) {
      requestAnimationFrame(syncViewport);
    }
  }, [buildLiveAxes, computeXAxesLayout, computeYAxesLayout]);

  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isLoaded) {
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      syncViewport();
    }
  }, [isLoaded, xAxes, yAxes, syncViewport]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries.length > 0) { const e = entries[entries.length - 1]; setWidth(e.contentRect.width); setHeight(e.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const activeXAxesUsed = useMemo(() => {
    const axisToMinDsIdx = new Map<string, number>();
    datasets.forEach((d, dsIdx) => { if (series.some(s => s.sourceId === d.id)) { const xId = d.xAxisId || 'axis-1'; if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) axisToMinDsIdx.set(xId, dsIdx); } });
    return xAxes.filter(a => axisToMinDsIdx.has(a.id)).sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);
  activeXAxesUsedRef.current = activeXAxesUsed;

  const axisLayout = useMemo(() => {
    const layout: Record<string, { total: number; label: number }> = {};
    activeYAxes.forEach(axis => {
      const step = calcNumericStep(axis.max - axis.min, Math.max(2, Math.floor(height / 30)));
      const precision = calcNumericPrecision(step);
      const widestValChars = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
      const labelWidth = widestValChars * 6;
      layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
    });
    return layout;
  }, [activeYAxes, height]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  const { leftOffsets, rightOffsets } = useMemo(() => {
    const leftOffsets: Record<string, number> = {}; let lOff = 0;
    for (const a of leftAxes) { leftOffsets[a.id] = lOff; lOff += axisLayout[a.id]?.total || 40; }
    const rightOffsets: Record<string, number> = {}; let rOff = 0;
    for (const a of rightAxes) { rightOffsets[a.id] = rOff; rOff += axisLayout[a.id]?.total || 40; }
    return { leftOffsets, rightOffsets };
  }, [leftAxes, rightAxes, axisLayout]);

  const xAxesMetrics = useMemo((): XAxisMetrics[] => {
    const isMobile = width < 768 || height < 500;
    const result: XAxisMetrics[] = [];
    let currentOffset = 0;
    for (const axis of activeXAxesUsed) {
      const base = getXAxisMetrics(isMobile, axis.xMode);
      result.push({ ...base, id: axis.id, cumulativeOffset: currentOffset });
      currentOffset += base.height;
    }
    return result;
  }, [activeXAxesUsed, width, height]);

  const padding = useMemo(() => {
    const isMobile = width < 768 || height < 500;
    const base = isMobile ? BASE_PADDING_MOBILE : BASE_PADDING_DESKTOP;
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const bottom = xAxesMetrics.length > 0 ? xAxesMetrics.reduce((sum, m) => sum + m.height, 0) : base.bottom;
    return { ...base, left: base.left + leftSum, right: base.right + rightSum, bottom };
  }, [leftAxes, rightAxes, axisLayout, xAxesMetrics, width, height]);

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);
  chartWidthRef.current = chartWidth;
  chartHeightRef.current = chartHeight;

  const { handleAutoScaleY, handleAutoScaleX } = useAutoScale({
    isLoaded, series, yAxes, activeYAxes, activeXAxesUsed,
    padding, chartHeight, targetXAxes, targetYs, syncViewport, lastAppliedViewId,
  });

  const {
    panTarget, isCtrlPressed, isShiftPressed, isInteracting, zoomBoxState,
    handleMouseDown, handleTouchStart, handleWheel,
  } = usePanZoom({
    containerRef, width, height, padding, chartWidth, chartHeight,
    activeXAxes: activeXAxesUsed, activeYAxes, xAxesById, yAxesById,
    targetXAxes, targetYs, syncViewport,
    xAxesMetrics, axisLayout, leftAxes, rightAxes,
    handleAutoScaleX, handleAutoScaleY,
    pressedKeys: pressedKeysRef,
    onPanEnd: useCallback(() => {
      syncViewport();
    }, [syncViewport]),
  });

  const activeYAxesLayout = useMemo((): YAxisLayout[] => {
    const isMobile = width < 768 || height < 500;
    const chartH = Math.max(0, height - (isMobile ? 40 : 60) - 20);
    const lockedCurrent = lockedYSteps.current;
    return activeYAxes.map(axis => {
      const locked = lockedCurrent[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartH, isInteracting ? locked : undefined);
      lockedCurrent[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [activeYAxes, height, width, isInteracting]);

  const xAxesLayout = useMemo((): XAxisLayout[] => {
    const activeDsIds = new Set(series.map(s => s.sourceId));
    const dsByX: DatasetsByAxisId = {};
    datasets.forEach(d => { if (activeDsIds.has(d.id)) { const xId = d.xAxisId || 'axis-1'; if (!dsByX[xId]) dsByX[xId] = []; dsByX[xId].push(d); } });

    const lockedCurrent = lockedXSteps.current;

    return activeXAxesUsed.map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date';
      const dss = dsByX[axis.id] || [];
      const title = Array.from(new Set(dss.map((d: Dataset) => d.xAxisColumn))).join(' / ');
      const color = themeColors.labelColor;
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      if (!isDate) {
        const locked = lockedCurrent[axis.id]?.step;
        const step = (isInteracting && locked) ? locked : calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
        lockedCurrent[axis.id] = { step };
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedCurrent[axis.id]?.timeStep;
        const ts = (isInteracting && lockedTs) ? lockedTs : getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
        lockedCurrent[axis.id] = { timeStep: ts };
        return { id: axis.id, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets, themeColors.labelColor, isInteracting]);

  const gridXViewports = useMemo(() => activeXAxesUsed.map(axis => ({ id: axis.id, xMin: axis.min, xMax: axis.max })), [activeXAxesUsed]);
  const gridYViewports = useMemo(() => activeYAxesLayout.map(axis => ({ id: axis.id, xMin: xAxes[0]?.min ?? 0, xMax: xAxes[0]?.max ?? 1, yMin: axis.min, yMax: axis.max })), [activeYAxesLayout, xAxes]);

  return (
    <main className="plot-area" ref={containerRef}
      onMouseDown={(e) => handleMouseDown(e, 'all')}
      onTouchStart={(e) => handleTouchStart(e, 'all')}
      onWheel={(e) => handleWheel(e, 'all')}
      style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : (isShiftPressed ? 'ew-resize' : 'crosshair')), backgroundColor: themeColors.plotBg, overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}
    >
      {datasets.length === 0 && <div className="chart-no-data">No data</div>}
      <BenchmarkOverlay />
      <GridLines ref={gridLinesRef} xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} gridColor={themeColors.gridColor} xViewports={gridXViewports} yViewports={gridYViewports} />
      <div className="chart-webgl-layer">
        <ErrorBoundary level="component">
          <WebGLRenderer ref={webglRef} key={themeName} datasets={datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} isInteracting={isInteracting} highlightedSeriesId={highlightedSeriesId} />
        </ErrorBoundary>
      </div>
      <AxesLayer ref={axesLayerRef} xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} series={series} axisLayout={axisLayout} allXAxes={xAxes} xAxesMetrics={xAxesMetrics} axisColor={themeColors.axisColor} zeroLineColor={themeColors.zeroLineColor} labelColor={themeColors.labelColor} secLabelBg={themeColors.secLabelBg} leftOffsets={leftOffsets} rightOffsets={rightOffsets} />
      {xAxesMetrics.map(m => {
        const bY = padding.bottom - m.cumulativeOffset - m.height;
        return <div key={`wheel-x-${m.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { xAxisId: m.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { xAxisId: m.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { xAxisId: m.id }); }} onDoubleClick={e => { e.stopPropagation(); handleAutoScaleX(m.id); }} style={{ position: 'absolute', bottom: bY, left: padding.left, right: padding.right, height: m.height, cursor: 'ew-resize', zIndex: 20 }} />;
      })}
      {activeYAxes.map(a => {
        const isL = a.position === 'left', am = axisLayout[a.id] || { total: 40 };
        const xP = isL ? padding.left - (leftOffsets[a.id] ?? 0) - am.total : width - padding.right + (rightOffsets[a.id] ?? 0);
        return <div key={`wheel-${a.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { yAxisId: a.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { yAxisId: a.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { yAxisId: a.id }); }} onDoubleClick={e => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); handleAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined); }} style={{ position: 'absolute', left: xP, top: padding.top, width: am.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={isInteracting} xAxes={xAxes} yAxes={activeYAxes} datasets={datasets} series={series} tooltipColor={themeColors.tooltipColor} snapLineColor={themeColors.snapLineColor} tooltipDividerColor={themeColors.tooltipDividerColor} tooltipSubColor={themeColors.tooltipSubColor} />
      {zoomBoxState && <svg width="100%" height="100%" className="chart-abs-fill" style={{ zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
      {series.length > 0 && legendVisible && <ChartLegend series={series} onToggleVisibility={(id, hidden) => useGraphStore.getState().updateSeriesVisibility(id, hidden)} onHighlight={(id) => useGraphStore.getState().setHighlightedSeries(id)} />}
      {datasets.length > 0 && (
        <div className="chart-fit-btns" style={{ bottom: padding.bottom + 8, right: padding.right + 8 }}>
          <button onClick={() => { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); }} title="Fit All (Double-click plot also works)" className="chart-fit-btn">Fit All</button>
        </div>
      )}
    </main>
  );
};

export default ChartContainer;
