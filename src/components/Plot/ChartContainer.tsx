/* eslint-disable react-hooks/refs */
// src/components/Plot/ChartContainer.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { THEMES } from '../../themes';
import { applyKeyboardZoom } from '../../utils/keyboard';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset, type XAxisConfig, type YAxisConfig } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels } from '../../utils/time';
import { calcNumericStep, calcNumericPrecision, calcNumericTicks, calcYAxisTicks, syncAxesWithTargets, type AxesFrame } from '../../utils/axisCalculations';
import { WebGLRenderer, type WebGLRendererHandle } from './WebGLRenderer';
import { ChartLegend } from './ChartLegend';
import { AxesLayer, type AxesLayerHandle } from './AxesLayer';
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
  // 1. Core Refs and State
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  
  const targetXAxes = useRef<Record<string, { min: number; max: number }>>({});
  const targetYs = useRef<Record<string, { min: number; max: number }>>({});
  const webglRef = useRef<WebGLRendererHandle | null>(null);
  const axesLayerRef = useRef<AxesLayerHandle | null>(null);
  const lockedXSteps = useRef<Record<string, { step?: number; timeStep?: ReturnType<typeof getTimeStep> }>>({});
  const lockedYSteps = useRef<Record<string, number>>({});
  const pressedKeysRef = useRef<Set<string>>(new Set());
  const panStateRef = useRef({ 
    active: false, startX: 0, startY: 0, currentX: 0, currentY: 0, target: null, startTargetX: {}, startTargetY: {} 
  });

  // 2. Store Data
  const series = useGraphStore(s => s.series);
  const xAxes = useGraphStore(s => s.xAxes);
  const yAxes = useGraphStore(s => s.yAxes);
  const isLoaded = useGraphStore(s => s.isLoaded);
  const datasets = useGraphStore(s => s.datasets);
  const highlightedSeriesId = useGraphStore(s => s.highlightedSeriesId);
  const legendVisible = useGraphStore(s => s.legendVisible);
  const [themeName] = useTheme();
  const themeColors = THEMES[themeName];

  // 3. Layout Memos
  const xAxesById = useMemo(() => { const m = new Map<string, XAxisConfig>(); xAxes.forEach(a => m.set(a.id, a)); return m; }, [xAxes]);
  const yAxesById = useMemo(() => { const m = new Map<string, YAxisConfig>(); yAxes.forEach(a => m.set(a.id, a)); return m; }, [yAxes]);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const activeXAxesUsed = useMemo(() => {
    const activeDatasetIds = new Set(series.map(s => s.sourceId));
    const axisToMinDsIdx = new Map<string, number>();
    datasets.forEach((d, dsIdx) => { 
      if (activeDatasetIds.has(d.id)) { 
        const xId = d.xAxisId || 'axis-1'; 
        if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) axisToMinDsIdx.set(xId, dsIdx); 
      } 
    });
    return xAxes.filter(a => axisToMinDsIdx.has(a.id)).sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);

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

  // 4. Callbacks for canvas rendering
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
      activeXAxesUsed.some(ax => ax.id === axis.id)
    ).map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date';
      const dss = dsByX[axis.id] || [];
      const title = Array.from(new Set(dss.map((d: Dataset) => d.xAxisColumn))).join(' / ');
      const color = themeColors.labelColor;
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
      if (!isDate) {
        const locked = lockedXSteps.current[axis.id]?.step;
        const step = locked ?? calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
        if (step <= 0) return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedXSteps.current[axis.id]?.timeStep;
        const ts = lockedTs ?? getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
        return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [series, datasets, themeColors.labelColor, chartWidth, activeXAxesUsed]);

  const computeYAxesLayout = useCallback((liveYAxes: YAxisConfig[]): YAxisLayout[] => {
    const usedYAxisIds = new Set(series.map(s => s.yAxisId));
    return liveYAxes.filter(a => usedYAxisIds.has(a.id)).map(axis => {
      const locked = lockedYSteps.current[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartHeight, locked);
      lockedYSteps.current[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [series, chartHeight]);

  const syncViewportRef = useRef<(force?: boolean) => void>(() => {});

  // 5. Hooks
  const { handleAutoScaleY, handleAutoScaleX } = useAutoScale({
    isLoaded, series, activeYAxes, activeXAxesUsed,
    padding, chartHeight, targetXAxes, targetYs, 
    syncViewport: (force) => syncViewportRef.current(force),
  });

  const {
    panTarget, isCtrlPressed, isShiftPressed, isInteracting, zoomBoxState,
    handleMouseDown, handleTouchStart, handleWheel,
  } = usePanZoom({
    containerRef, width, height, padding, chartWidth, chartHeight,
    activeXAxes: activeXAxesUsed, activeYAxes, xAxesById, yAxesById,
    targetXAxes, targetYs, 
    syncViewport: (force) => syncViewportRef.current(force),
    xAxesMetrics, axisLayout, leftAxes, rightAxes,
    handleAutoScaleX, handleAutoScaleY,
    pressedKeys: pressedKeysRef,
    // @ts-expect-error: panStateRef has additional internal properties used by usePanZoom
    panStateRef,
    onPanEnd: useCallback(() => {
      panStateRef.current.active = false;
      syncViewportRef.current(true);
    }, []),
  });

  const syncViewport = useCallback((forceStoreUpdate = false) => {
    const state = useGraphStore.getState();
    const kbZoom = applyKeyboardZoom(state, pressedKeysRef.current, targetXAxes.current, targetYs.current);
    
    const { xUpdates, yUpdates }: AxesFrame = syncAxesWithTargets(state, targetXAxes.current, targetYs.current);

    const hasUpdates = Object.keys(xUpdates).length > 0 || Object.keys(yUpdates).length > 0;
    if (hasUpdates) {
      const { liveX, liveY } = buildLiveAxes(xUpdates, yUpdates);
      const xLayout = computeXAxesLayout(liveX);
      const yLayout = computeYAxesLayout(liveY);

      webglRef.current?.redraw(liveX, liveY, xLayout, yLayout);
      axesLayerRef.current?.redraw(xLayout, yLayout);

      // Only sync back to store if not currently interacting (panning/zooming)
      if (forceStoreUpdate || (!panStateRef.current.active && !isInteracting)) {
        const currentX = state.xAxes;
        const currentY = state.yAxes;
        
        const filteredXUpdates: Record<string, { min: number; max: number }> = {};
        const filteredYUpdates: Record<string, { min: number; max: number }> = {};
        
        const EPSILON = 1e-10;
        Object.entries(xUpdates).forEach(([id, upd]) => {
          const axis = currentX.find(a => a.id === id);
          if (!axis || Math.abs(axis.min - upd.min) > EPSILON || Math.abs(axis.max - upd.max) > EPSILON) {
            filteredXUpdates[id] = upd;
          }
        });
        
        Object.entries(yUpdates).forEach(([id, upd]) => {
          const axis = currentY.find(a => a.id === id);
          if (!axis || Math.abs(axis.min - upd.min) > EPSILON || Math.abs(axis.max - upd.max) > EPSILON) {
            filteredYUpdates[id] = upd;
          }
        });

        if (Object.keys(filteredXUpdates).length > 0 || Object.keys(filteredYUpdates).length > 0) {
          state.batchUpdateAxes(filteredXUpdates, filteredYUpdates);
        }
      }
    }
    if (kbZoom) {
      requestAnimationFrame(() => syncViewportRef.current(false));
    }
  }, [buildLiveAxes, computeXAxesLayout, computeYAxesLayout, isInteracting, datasets]);

  syncViewportRef.current = syncViewport;

  // 6. Effects
  useEffect(() => {
    if (isLoaded) {
      const EPSILON = 1e-10;
      let changed = false;
      xAxes.forEach(axis => {
        const target = targetXAxes.current[axis.id];
        if (!target || Math.abs(target.min - axis.min) > EPSILON || Math.abs(target.max - axis.max) > EPSILON) {
          targetXAxes.current[axis.id] = { min: axis.min, max: axis.max };
          changed = true;
        }
      });
      yAxes.forEach(axis => {
        const target = targetYs.current[axis.id];
        if (!target || Math.abs(target.min - axis.min) > EPSILON || Math.abs(target.max - axis.max) > EPSILON) {
          targetYs.current[axis.id] = { min: axis.min, max: axis.max };
          changed = true;
        }
      });
      if (changed) syncViewportRef.current();
    }
  }, [isLoaded, xAxes, yAxes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries.length > 0) { const e = entries[entries.length - 1]; setWidth(e.contentRect.width); setHeight(e.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // 7. Memos for static rendering (JSX)
  const activeYAxesLayout = useMemo((): YAxisLayout[] => {
    const lockedCurrent = lockedYSteps.current;
    return activeYAxes.map(axis => {
      const locked = lockedCurrent[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartHeight, isInteracting ? locked : undefined);
      lockedCurrent[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [activeYAxes, chartHeight, isInteracting]);

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
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      if (!isDate) {
        const locked = lockedCurrent[axis.id]?.step;
        const step = (isInteracting && locked) ? locked : calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
        lockedCurrent[axis.id] = { step };
        if (step <= 0) return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedCurrent[axis.id]?.timeStep;
        const ts = (isInteracting && lockedTs) ? lockedTs : getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
        lockedCurrent[axis.id] = { timeStep: ts };
        return { id: axis.id, min: axis.min, max: axis.max, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets, themeColors.labelColor, isInteracting]);

  const gridXViewports = useMemo(() => activeXAxesUsed.map(axis => ({ id: axis.id, xMin: axis.min, xMax: axis.max })), [activeXAxesUsed]);
  const gridYViewports = useMemo(() => activeYAxesLayout.map(axis => ({ id: axis.id, xMin: xAxes[0]?.min ?? 0, xMax: xAxes[0]?.max ?? 1, yMin: axis.min, yMax: axis.max })), [activeYAxesLayout, xAxes]);

  // 8. Render
  return (
    <main className="plot-area" ref={containerRef}
      onMouseDown={(e) => handleMouseDown(e, 'all')}
      onTouchStart={(e) => handleTouchStart(e, 'all')}
      onWheel={(e) => handleWheel(e, 'all')}
      style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : (isShiftPressed ? 'ew-resize' : 'crosshair')), backgroundColor: themeColors.plotBg, overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}
    >
      {datasets.length === 0 && <div className="chart-no-data">No data</div>}
      <div className="chart-webgl-layer">
        <ErrorBoundary level="component">
          <WebGLRenderer 
            ref={webglRef} 
            key={themeName} 
            datasets={datasets} 
            series={series} 
            xAxes={xAxes} 
            yAxes={yAxes} 
            width={width} 
            height={height} 
            padding={padding} 
            isInteracting={isInteracting} 
            highlightedSeriesId={highlightedSeriesId} 
            xAxesLayout={xAxesLayout}
            yAxesLayout={activeYAxesLayout}
            xAxesMetrics={xAxesMetrics}
            themeColors={{
              axisColor: themeColors.axisColor,
              zeroLineColor: themeColors.zeroLineColor,
              gridColor: themeColors.gridColor
            }}
            leftOffsets={leftOffsets}
            rightOffsets={rightOffsets}
            axisLayout={axisLayout}
          />
        </ErrorBoundary>
      </div>
      <AxesLayer ref={axesLayerRef} xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} series={series} axisLayout={axisLayout} xAxesMetrics={xAxesMetrics} axisColor={themeColors.axisColor} zeroLineColor={themeColors.zeroLineColor} labelColor={themeColors.labelColor} secLabelBg={themeColors.secLabelBg} leftOffsets={leftOffsets} rightOffsets={rightOffsets} />
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
