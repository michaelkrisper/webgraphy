// src/components/Plot/ChartContainer.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { THEMES } from '../../themes';
import { applyKeyboardZoom, animateXAxes, animateYAxes } from '../../utils/animation';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset, type XAxisConfig } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels } from '../../utils/time';
import { calcNumericStep, calcNumericPrecision, calcNumericTicks, calcYAxisTicks } from '../../utils/axisCalculations';
import { WebGLRenderer } from './WebGLRenderer';
import { ChartLegend } from './ChartLegend';
import { GridLines } from './GridLines';
import { AxesLayer } from './AxesLayer';
import { Crosshair } from './Crosshair';
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
  const isAnimating = useRef(false);
  const lockedXSteps = useRef<Record<string, { step?: number; timeStep?: ReturnType<typeof getTimeStep> }>>({});
  const lockedYSteps = useRef<Record<string, number>>({});

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = 0.4;
      let needsNextFrame = applyKeyboardZoom(state, pressedKeysRef.current, targetXAxes.current, targetYs.current);
      if (animateXAxes(state, targetXAxes.current, factor)) needsNextFrame = true;
      if (animateYAxes(state, targetYs.current, factor)) needsNextFrame = true;
      if (needsNextFrame) requestAnimationFrame(loop); else isAnimating.current = false;
    };
    requestAnimationFrame(loop);
  }, []);

  // pressedKeys ref forwarded from usePanZoom — initialized here so startAnimation can access it
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isLoaded && !isAnimating.current) {
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded, xAxes, yAxes, startAnimation]);

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

  const activeYAxesLayout = useMemo((): YAxisLayout[] => {
    const isMobile = width < 768 || height < 500;
    const chartH = Math.max(0, height - (isMobile ? 40 : 60) - 20);
    return activeYAxes.map(axis => {
      const locked = lockedYSteps.current[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartH, locked);
      lockedYSteps.current[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [activeYAxes, height, width]);

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
    let currentOffset = 0;
    return activeXAxesUsed.map(axis => {
      const base = getXAxisMetrics(isMobile, axis.xMode);
      const metrics = { ...base, id: axis.id, cumulativeOffset: currentOffset };
      currentOffset += base.height;
      return metrics;
    });
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

  const { handleAutoScaleY, handleAutoScaleX } = useAutoScale({
    isLoaded, series, yAxes, activeYAxes, activeXAxesUsed,
    padding, chartHeight, targetXAxes, targetYs, startAnimation, lastAppliedViewId,
  });

  const {
    panTarget, isCtrlPressed, isShiftPressed, zoomBoxState,
    isPanningRef, pressedKeys,
    handleMouseDown, handleTouchStart, handleWheel,
  } = usePanZoom({
    containerRef, width, height, padding, chartWidth, chartHeight,
    activeXAxes: activeXAxesUsed, activeYAxes, xAxesById, yAxesById,
    targetXAxes, targetYs, startAnimation,
    xAxesMetrics, axisLayout, leftAxes, rightAxes,
    handleAutoScaleX, handleAutoScaleY,
  });

  // Forward pressedKeys ref so startAnimation's applyKeyboardZoom can see it
  useEffect(() => { pressedKeysRef.current = pressedKeys.current; });

  const xAxesLayout = useMemo((): XAxisLayout[] => {
    const activeDsIds = new Set(series.map(s => s.sourceId));
    const dsByX: DatasetsByAxisId = {};
    datasets.forEach(d => { if (activeDsIds.has(d.id)) { const xId = d.xAxisId || 'axis-1'; if (!dsByX[xId]) dsByX[xId] = []; dsByX[xId].push(d); } });

    return activeXAxesUsed.map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date';
      const dss = dsByX[axis.id] || [];
      const title = Array.from(new Set(dss.map((d: Dataset) => d.xAxisColumn))).join(' / ');
      const color = themeColors.labelColor;
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      if (!isDate) {
        const locked = lockedXSteps.current[axis.id]?.step;
        const step = (isPanningRef.current && locked) ? locked : calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
        lockedXSteps.current[axis.id] = { step };
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedXSteps.current[axis.id]?.timeStep;
        const ts = (isPanningRef.current && lockedTs) ? lockedTs : getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
        lockedXSteps.current[axis.id] = { timeStep: ts };
        return { id: axis.id, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets, themeColors.labelColor, isPanningRef]);

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
      <GridLines xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} gridColor={themeColors.gridColor} xViewports={gridXViewports} yViewports={gridYViewports} />
      <div className="chart-webgl-layer">
        <ErrorBoundary level="component">
          <WebGLRenderer key={themeName} datasets={datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} isInteracting={isPanningRef.current || isAnimating.current} highlightedSeriesId={highlightedSeriesId} />
        </ErrorBoundary>
      </div>
      <AxesLayer xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} series={series} axisLayout={axisLayout} allXAxes={xAxes} xAxesMetrics={xAxesMetrics} axisColor={themeColors.axisColor} zeroLineColor={themeColors.zeroLineColor} labelColor={themeColors.labelColor} secLabelBg={themeColors.secLabelBg} leftOffsets={leftOffsets} rightOffsets={rightOffsets} />
      {xAxesMetrics.map(m => {
        const bY = padding.bottom - m.cumulativeOffset - m.height;
        return <div key={`wheel-x-${m.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { xAxisId: m.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { xAxisId: m.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { xAxisId: m.id }); }} onDoubleClick={e => { e.stopPropagation(); handleAutoScaleX(m.id); }} style={{ position: 'absolute', bottom: bY, left: padding.left, right: padding.right, height: m.height, cursor: 'ew-resize', zIndex: 20 }} />;
      })}
      {activeYAxes.map(a => {
        const isL = a.position === 'left', am = axisLayout[a.id] || { total: 40 };
        const xP = isL ? padding.left - (leftOffsets[a.id] ?? 0) - am.total : width - padding.right + (rightOffsets[a.id] ?? 0);
        return <div key={`wheel-${a.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { yAxisId: a.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { yAxisId: a.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { yAxisId: a.id }); }} onDoubleClick={e => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); handleAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined); }} style={{ position: 'absolute', left: xP, top: padding.top, width: am.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} xAxes={xAxes} yAxes={activeYAxes} datasets={datasets} series={series} tooltipColor={themeColors.tooltipColor} snapLineColor={themeColors.snapLineColor} tooltipDividerColor={themeColors.tooltipDividerColor} tooltipSubColor={themeColors.tooltipSubColor} />
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
