import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';

const AXIS_WIDTH = 40;
const BASE_PADDING = { top: 20, right: 20, bottom: 50, left: 20 };

type PanTarget = 'all' | 'x' | { yAxisId: string };

/**
 * PlotArea Component (v3.1 - Stabilized Export & Ultra-Fast Smooth Transitions)
 * Core plotting logic and interaction handling.
 */
export const PlotArea: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { datasets, series, yAxes, axisTitles, setAxisTitles, viewportX, setViewportX, updateYAxis, globalXColumn, xMode, isLoaded } = useGraphStore();
  
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [editingXTitle, setEditingXTitle] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  
  const zoomBoxStartRef = useRef<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);

  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);

  // --- Target-based Smooth Interpolation ---
  const targetX = useRef({ min: viewportX.min, max: viewportX.max });
  const targetYs = useRef<Record<string, { min: number, max: number }>>({});

  // Animation Loop
  useEffect(() => {
    let rafId: number;
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
    
    const loop = () => {
      const factor = 0.55; // Ultra Fast damping

      // X Sync
      const nextMin = lerp(viewportX.min, targetX.current.min, factor);
      const nextMax = lerp(viewportX.max, targetX.current.max, factor);
      if (Math.abs(nextMin - viewportX.min) > 0.000001 * (viewportX.max - viewportX.min)) {
        setViewportX({ min: nextMin, max: nextMax });
      }

      // Y Sync
      yAxes.forEach(axis => {
        const target = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
        const nextYMin = lerp(axis.min, target.min, factor);
        const nextYMax = lerp(axis.max, target.max, factor);
        if (Math.abs(nextYMin - axis.min) > 0.000001 * (axis.max - axis.min)) {
          updateYAxis(axis.id, { min: nextYMin, max: nextYMax });
        }
      });

      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [viewportX, yAxes, setViewportX, updateYAxis]);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  const padding = useMemo(() => ({
    ...BASE_PADDING,
    left: BASE_PADDING.left + (leftAxes.length * AXIS_WIDTH),
    right: BASE_PADDING.right + (rightAxes.length * AXIS_WIDTH)
  }), [leftAxes.length, rightAxes.length]);

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);

  const isInitialMount = useRef(true);
  const prevGlobalX = useRef(globalXColumn);
  const prevXMode = useRef(xMode);
  const prevSeriesCount = useRef(series.length);

  // Auto-fit logic
  useEffect(() => {
    if (!isLoaded) return;
    const globalXChanged = globalXColumn !== prevGlobalX.current;
    const xModeChanged = xMode !== prevXMode.current;
    const seriesCountChanged = series.length !== prevSeriesCount.current;
    prevGlobalX.current = globalXColumn;
    prevXMode.current = xMode;
    prevSeriesCount.current = series.length;
    if (isInitialMount.current) { isInitialMount.current = false; return; }
    if (!globalXChanged && !xModeChanged && !seriesCountChanged) return;
    if (series.length === 0) {
      targetX.current = { min: 0, max: 1 };
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: 0, max: 1 }; });
      return;
    }
    if (datasets.length === 0) return;
    let xMin = Infinity, xMax = -Infinity;
    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.indexOf(s.xColumn);
      if (xIdx === -1) return;
      const xData = ds.data[xIdx];
      for (let i = 0; i < ds.rowCount; i++) {
        if (xData[i] < xMin) xMin = xData[i];
        if (xData[i] > xMax) xMax = xData[i];
      }
    });
    if (xMin !== Infinity) {
      const pad = (xMax - xMin || 1) * 0.05;
      targetX.current = { min: xMin - pad, max: xMax + pad };
    }
    activeYAxes.forEach(axis => {
      const axisSeries = series.filter(s => s.yAxisId === axis.id);
      if (axisSeries.length === 0) { targetYs.current[axis.id] = { min: 0, max: 1 }; return; }
      let yMin = Infinity, yMax = -Infinity;
      axisSeries.forEach(s => {
        const ds = datasets.find(d => d.id === s.sourceId);
        if (!ds) return;
        const yIdx = ds.columns.indexOf(s.yColumn);
        if (yIdx === -1) return;
        const yData = ds.data[yIdx];
        for (let i = 0; i < ds.rowCount; i++) {
          if (yData[i] < yMin) yMin = yData[i];
          if (yData[i] > yMax) yMax = yData[i];
        }
      });
      if (yMin !== Infinity) {
        const pad = (yMax - yMin || 1) * 0.1;
        targetYs.current[axis.id] = { min: yMin - pad, max: yMax + pad };
      }
    });
  }, [series, datasets, isLoaded, globalXColumn, xMode]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setWidth(entry.contentRect.width);
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleWheel = (e: React.WheelEvent, target: 'all' | 'x' | { yAxisId: string }) => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    if (target === 'all' || target === 'x') {
      const range = targetX.current.max - targetX.current.min;
      const newRange = range * zoomFactor;
      targetX.current = { min: targetX.current.min + (range - newRange) / 2, max: targetX.current.max - (range - newRange) / 2 };
    }
    if (target === 'all' || typeof target === 'object') {
      const axesToZoom = target === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (target as any).yAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const currentTarget = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
        const range = currentTarget.max - currentTarget.min;
        const newRange = range * zoomFactor;
        targetYs.current[axis.id] = { min: currentTarget.min + (range - newRange) / 2, max: currentTarget.max - (range - newRange) / 2 };
      });
    }
  };

  const handleAutoScaleY = useCallback((axisId: string) => {
    const axisSeries = series.filter(s => s.yAxisId === axisId);
    if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;
    axisSeries.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.indexOf(s.xColumn);
      const yIdx = ds.columns.indexOf(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;
      const xData = ds.data[xIdx];
      const yData = ds.data[yIdx];
      for (let i = 0; i < ds.rowCount; i++) {
        const x = xData[i];
        if (x >= viewportX.min && x <= viewportX.max) {
          const y = yData[i];
          if (y < yMin) yMin = y;
          if (y > yMax) yMax = y;
        }
      }
    });
    if (yMin !== Infinity) {
      const range = yMax - yMin || 1;
      const pad = (range / 0.9 - range) / 2;
      targetYs.current[axisId] = { min: yMin - pad, max: yMax + pad };
    }
  }, [series, datasets, viewportX]);

  const handleAutoScaleX = useCallback(() => {
    if (series.length === 0) return;
    let xMin = Infinity, xMax = -Infinity;
    series.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.indexOf(s.xColumn);
      if (xIdx === -1) return;
      const xData = ds.data[xIdx];
      for (let i = 0; i < ds.rowCount; i++) {
        if (xData[i] < xMin) xMin = xData[i];
        if (xData[i] > xMax) xMax = xData[i];
      }
    });
    if (xMin !== Infinity) {
      const pad = (xMax - xMin || 1) * 0.05;
      targetX.current = { min: xMin - pad, max: xMax + pad };
    }
  }, [series, datasets]);

  const handleMouseDown = (e: React.MouseEvent, target: PanTarget = 'all') => {
    if (e.ctrlKey && target === 'all' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const initialBox = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = initialBox;
        setZoomBoxState(initialBox);
      }
    } else {
      setPanTarget(target);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseMoveRaw = useCallback((e: MouseEvent) => {
    if (zoomBoxStartRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left;
      let y = e.clientY - rect.top;
      x = Math.max(padding.left, Math.min(width - padding.right, x));
      y = Math.max(padding.top, Math.min(height - padding.bottom, y));
      const newBox = { ...zoomBoxStartRef.current, endX: x, endY: y };
      zoomBoxStartRef.current = newBox;
      setZoomBoxState(newBox);
      return;
    }
    if (!panTarget || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    
    // Direct state updates for mouse panning (feels more precise)
    const xRange = viewportX.max - viewportX.min;
    const xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
    if (panTarget === 'all' || panTarget === 'x') {
      const nextX = { min: viewportX.min - xMove, max: viewportX.max - xMove };
      setViewportX(nextX);
      targetX.current = nextX;
    }
    const axesToPan = panTarget === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (panTarget as any).yAxisId)!];
    axesToPan.forEach(axis => {
      if (!axis) return;
      const yRange = axis.max - axis.min;
      const yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
      const nextY = { min: axis.min + yMove, max: axis.max + yMove };
      updateYAxis(axis.id, nextY);
      targetYs.current[axis.id] = nextY;
    });
  }, [panTarget, viewportX, activeYAxes, chartWidth, chartHeight, setViewportX, updateYAxis]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        zoomBoxStartRef.current = null;
        setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX);
        const maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY);
        const maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          const vp = { ...viewportX, xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };
          const w1 = screenToWorld(minX, maxY, vp);
          const w2 = screenToWorld(maxX, minY, vp);
          targetX.current = { min: w1.x, max: w2.x };
          activeYAxes.forEach(axis => {
             const axisVp = { ...viewportX, xMin: viewportX.min, xMax: viewportX.max, yMin: axis.min, yMax: axis.max, width, height, padding };
             const a1 = screenToWorld(minX, maxY, axisVp);
             const a2 = screenToWorld(maxX, minY, axisVp);
             targetYs.current[axis.id] = { min: a1.y, max: a2.y };
          });
        }
      }
      setPanTarget(null);
    };
    window.addEventListener('mousemove', handleMouseMoveRaw);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveRaw);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMoveRaw, viewportX, activeYAxes, width, height, padding]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      
      const step = 0.15; // 15% viewport shift
      if (e.key === 'ArrowLeft') {
        const range = targetX.current.max - targetX.current.min;
        targetX.current = { min: targetX.current.min - range * step, max: targetX.current.max - range * step };
      } else if (e.key === 'ArrowRight') {
        const range = targetX.current.max - targetX.current.min;
        targetX.current = { min: targetX.current.min + range * step, max: targetX.current.max + range * step };
      } else if (e.key === 'ArrowUp') {
        activeYAxes.forEach(axis => {
          const target = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = target.max - target.min;
          targetYs.current[axis.id] = { min: target.min + range * step, max: target.max + range * step };
        });
      } else if (e.key === 'ArrowDown') {
        activeYAxes.forEach(axis => {
          const target = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = target.max - target.min;
          targetYs.current[axis.id] = { min: target.min - range * step, max: target.max - range * step };
        });
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(false); };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [activeYAxes]);

  const xTicks = useMemo(() => {
    const isXDate = xMode === 'date';
    const range = viewportX.max - viewportX.min;
    const maxTicks = Math.max(2, Math.floor(chartWidth / 60));
    let step = range / maxTicks;
    let precision = 0;
    if (!isXDate) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
      step = finalStep * magnitude;
      precision = Math.max(0, -Math.floor(Math.log10(step)));
    } else {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 432000, 604800, 1209600, 2592000];
      step = intervals.find(i => i > step) || intervals[intervals.length - 1];
    }
    const firstTick = Math.ceil(viewportX.min / step) * step;
    const result = [];
    for (let t = firstTick; t <= viewportX.max; t += step) { result.push(t); }
    return { result, step, precision, isXDate };
  }, [viewportX.min, viewportX.max, chartWidth, xMode]);

  const viewportRef = useMemo(() => ({ ...viewportX, xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding }), [viewportX, width, height, padding]);

  const formatDate = useCallback((val: number, step: number) => {
    const d = new Date(val * 1000);
    if (step >= 86400) return d.getDate() + '.' + (d.getMonth()+1) + '.';
    if (step >= 3600) return d.getHours() + ':00';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }, []);

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : 'crosshair'), backgroundColor: '#fff', overflow: 'hidden' }}>
      
      {series.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>
          No data
        </div>
      )}

      <GridLines xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} viewportRef={viewportRef} />

      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={datasets} series={series} yAxes={yAxes} viewportX={viewportX} width={width} height={height} padding={padding} />
      </div>

      <AxesLayer xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} leftAxes={leftAxes} rightAxes={rightAxes} viewportRef={viewportRef} isXDate={xTicks.isXDate} formatDate={formatDate} series={series} />

      <div onWheel={(e) => { e.stopPropagation(); handleWheel(e, 'x'); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'x'); }} onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleX(); }} style={{ position: 'absolute', bottom: 0, left: padding.left, right: padding.right, height: padding.bottom, cursor: 'ew-resize', zIndex: 20 }} />
      {activeYAxes.map((axis) => {
        const isLeft = axis.position === 'left';
        const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
        const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
        return <div 
          key={`wheel-${axis.id}`} 
          onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: axis.id }); }} 
          onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: axis.id }); }} 
          onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleY(axis.id); }}
          style={{ position: 'absolute', left: xPos, top: padding.top, width: AXIS_WIDTH, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} 
        />;
      })}

      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} />

      {zoomBoxState && (
        <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}>
          <rect 
            x={Math.min(zoomBoxState.startX, zoomBoxState.endX)}
            y={Math.min(zoomBoxState.startY, zoomBoxState.endY)}
            width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)}
            height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)}
            fill="rgba(0, 123, 255, 0.2)"
            stroke="#007bff"
            strokeWidth="1"
          />
        </svg>
      )}

      {editingXTitle ? (
        <input
          autoFocus
          defaultValue={axisTitles.x}
          onBlur={(e) => { setAxisTitles(e.target.value, axisTitles.y); setEditingXTitle(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter') { setAxisTitles(e.currentTarget.value, axisTitles.y); setEditingXTitle(false); } }}
          style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', zIndex: 30, textAlign: 'center', fontWeight: 'bold' }}
        />
      ) : (
        <div 
          onDoubleClick={() => setEditingXTitle(true)}
          style={{ position: 'absolute', bottom: '5px', width: '100%', textAlign: 'center', pointerEvents: 'auto', cursor: 'text', fontWeight: 'bold', zIndex: 25 }}
        >
          {axisTitles.x}
        </div>
      )}
    </main>
  );
};

// Sub-components moved below main export for bundling stability
function GridLinesInternal({ xTicks, yAxes, viewportX, width, height, padding, viewportRef }: any) {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {xTicks.result.map((t: number) => {
        const { x } = worldToScreen(t, 0, viewportRef);
        return <line key={`gx-${t}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#f0f0f0" strokeWidth="1" />;
      })}
      {yAxes.map((axis: any) => {
        if (!axis.showGrid || height <= padding.top + padding.bottom) return null;
        const range = axis.max - axis.min;
        const approxHeight = 20;
        const maxTicks = Math.max(2, Math.floor((height - padding.top - padding.bottom) / (approxHeight + 10)));
        let step = range / maxTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        let finalStep = 1;
        if (normalizedStep < 1.5) finalStep = 1;
        else if (normalizedStep < 3) finalStep = 2;
        else if (normalizedStep < 7) finalStep = 5;
        else finalStep = 10;
        step = finalStep * magnitude;
        const firstTick = Math.ceil(axis.min / step) * step;
        const result = [];
        for (let t = firstTick; t <= axis.max; t += step) { result.push(t); }

        return result.map(t => {
          const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
          return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth="1" />;
        });
      })}
    </svg>
  );
}
const GridLines = React.memo(GridLinesInternal);

function AxesLayerInternal({ xTicks, yAxes, viewportX, width, height, padding, leftAxes, rightAxes, viewportRef, isXDate, formatDate, series }: any) {
  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        <rect x={padding.left} y={padding.top} width={chartWidth} height={chartHeight} fill="none" stroke="#333" strokeWidth="2" />
        {xTicks.result.map((t: number) => {
          const { x } = worldToScreen(t, 0, viewportRef);
          if (x < padding.left || x > width - padding.right) return null;
          return <line key={`xt-${t}`} x1={x} y1={height - padding.bottom} x2={x} y2={height - padding.bottom + 6} stroke="#333" strokeWidth="1" />;
        })}
        {yAxes.map((axis: any) => {
          const isLeft = axis.position === 'left';
          const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
          
          const range = axis.max - axis.min;
          const approxHeight = 20;
          const maxTicks = Math.max(2, Math.floor(chartHeight / (approxHeight + 10)));
          let step = range / maxTicks;
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          let finalStep = 1;
          if (normalizedStep < 1.5) finalStep = 1;
          else if (normalizedStep < 3) finalStep = 2;
          else if (normalizedStep < 7) finalStep = 5;
          else finalStep = 10;
          step = finalStep * magnitude;
          const firstTick = Math.ceil(axis.min / step) * step;
          const result = [];
          for (let t = firstTick; t <= axis.max; t += step) { result.push(t); }

          return (
            <g key={axis.id}>
              <line x1={xPos + (isLeft ? AXIS_WIDTH : 0)} y1={padding.top} x2={xPos + (isLeft ? AXIS_WIDTH : 0)} y2={height - padding.bottom} stroke="#333" strokeWidth="1" />
              {result.map(t => {
                const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
                return <line key={`yt-${axis.id}-${t}`} x1={xPos + (isLeft ? AXIS_WIDTH - 5 : 0)} y1={y} x2={xPos + (isLeft ? AXIS_WIDTH : 5)} y2={y} stroke="#333" strokeWidth="1" />;
              })}
            </g>
          );
        })}
      </svg>

      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
        {xTicks.result.map((t: number) => {
          const { x } = worldToScreen(t, 0, viewportRef);
          if (x < padding.left || x > width - padding.right) return null;
          return <div key={`xl-${t}`} style={{ position: 'absolute', left: x, bottom: padding.bottom - 20, transform: 'translateX(-50%)', fontSize: '9px', color: '#666' }}>{isXDate ? formatDate(t, xTicks.step) : t.toFixed(xTicks.precision)}</div>;
        })}
        {yAxes.map((axis: any) => {
          const isLeft = axis.position === 'left';
          const sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const xPos = isLeft ? (padding.left - (sideIdx + 1) * AXIS_WIDTH) : (width - padding.right + sideIdx * AXIS_WIDTH);
          
          const range = axis.max - axis.min;
          const approxHeight = 20;
          const maxTicks = Math.max(2, Math.floor(chartHeight / (approxHeight + 10)));
          let step = range / maxTicks;
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          let finalStep = 1;
          if (normalizedStep < 1.5) finalStep = 1;
          else if (normalizedStep < 3) finalStep = 2;
          else if (normalizedStep < 7) finalStep = 5;
          else finalStep = 10;
          step = finalStep * magnitude;
          const precision = Math.max(0, -Math.floor(Math.log10(step)));
          const firstTick = Math.ceil(axis.min / step) * step;
          const result = [];
          for (let t = firstTick; t <= axis.max; t += step) { result.push(t); }

          const axisSeries = series.filter((s: any) => s.yAxisId === axis.id);
          const title = axisSeries.map((s: any) => s.name || s.yColumn).join(' / ');

          return (
            <React.Fragment key={axis.id}>
              {result.map(t => {
                const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
                return <div key={`yl-${axis.id}-${t}`} style={{ 
                  position: 'absolute', 
                  left: isLeft ? xPos + 5 : xPos + 8, 
                  top: y, 
                  transform: 'translateY(-50%)', 
                  fontSize: '9px', 
                  color: '#333', 
                  width: AXIS_WIDTH - 13, 
                  textAlign: isLeft ? 'right' : 'left' 
                }}>{t.toFixed(precision)}</div>;
              })}
              <div style={{ 
                position: 'absolute', 
                top: padding.top + chartHeight / 2, 
                left: isLeft ? (xPos + 5) : (xPos + AXIS_WIDTH - 5), 
                transform: `translate(-50%, -50%) rotate(${isLeft ? -90 : 90}deg)`, 
                fontSize: '10px', 
                fontWeight: 'bold', 
                color: axisSeries[0]?.lineColor || '#333',
                backgroundColor: 'rgba(255, 255, 255, 0.8)',
                padding: '2px 4px',
                borderRadius: '2px',
                whiteSpace: 'nowrap',
                textAlign: 'center',
                maxWidth: chartHeight,
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}>
                {title}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
}
const AxesLayer = React.memo(AxesLayerInternal);

function CrosshairInternal({ containerRef, padding, width, height, isPanning }: any) {
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      if (isPanning) { setPos(null); return; }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        setPos({ x, y });
      } else { setPos(null); }
    };
    const handleLeave = () => setPos(null);
    window.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => { window.removeEventListener('mousemove', handleMove); el.removeEventListener('mouseleave', handleLeave); };
  }, [containerRef, padding, width, height, isPanning]);
  if (!pos) return null;
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
      <line x1={pos.x} y1={padding.top} x2={pos.x} y2={height - padding.bottom} stroke="#999" strokeWidth="1" strokeDasharray="4 4" />
      <line x1={padding.left} y1={pos.y} x2={width - padding.right} y2={pos.y} stroke="#999" strokeWidth="1" strokeDasharray="4 4" />
    </svg>
  );
}
const Crosshair = React.memo(CrosshairInternal);
