import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';

const BASE_PADDING = { top: 20, right: 20, bottom: 50, left: 20 };

type PanTarget = 'all' | 'x' | { yAxisId: string };

const GridLines = React.memo(({ xTicks, yAxes, viewportX, width, height, padding, viewportRef }: any) => {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {xTicks.result.map((t: number) => {
        const { x } = worldToScreen(t, 0, viewportRef);
        return <line key={`gx-${t}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#f0f0f0" strokeWidth="1" />;
      })}
      {yAxes.map((axis: any) => {
        if (!axis.showGrid || height <= padding.top + padding.bottom) return null;
        const range = axis.max - axis.min;
        if (range <= 0) return null;
        const approxHeight = 20, maxTicks = Math.max(2, Math.floor((height - padding.top - padding.bottom) / (approxHeight + 10)));
        let step = range / maxTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
        const actualStep = finalStep * magnitude;
        if (actualStep <= 0) return null;
        const firstTick = Math.ceil(axis.min / actualStep) * actualStep, result = [];
        for (let t = firstTick; t <= axis.max; t += actualStep) {
          if (result.length > 100) break;
          result.push(t);
        }
        return result.map(t => {
          const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
          return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth="1" />;
        });
      })}
    </svg>
  );
});

const AxesLayer = React.memo(({ xTicks, yAxes, viewportX, width, height, padding, leftAxes, rightAxes, viewportRef, isXDate, formatDate, series, axisLayout }: any) => {
  const chartWidth = Math.max(0, width - padding.left - padding.right), chartHeight = Math.max(0, height - padding.top - padding.bottom);
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
          const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
          let xPos = 0;
          if (isLeft) {
            let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
            xPos = padding.left - offset - axisMetrics.total;
          } else {
            let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
            xPos = width - padding.right + offset;
          }
          const axisLineX = isLeft ? xPos + axisMetrics.total : xPos;
          const range = axis.max - axis.min;
          if (range <= 0 || chartHeight <= 0) return null;
          const step = range / Math.max(2, Math.floor(chartHeight / 30));
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
          const actualStep = finalStep * magnitude;
          if (actualStep <= 0) return null;
          const firstTick = Math.ceil(axis.min / actualStep) * actualStep, result = [];
          for (let t = firstTick; t <= axis.max; t += actualStep) {
            if (result.length > 100) break;
            result.push(t);
          }
          return (
            <g key={axis.id}>
              <line x1={axisLineX} y1={padding.top} x2={axisLineX} y2={height - padding.bottom} stroke="#333" strokeWidth="1" />
              {result.map(t => {
                const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
                const x1 = isLeft ? axisLineX - 5 : axisLineX;
                const x2 = isLeft ? axisLineX : axisLineX + 5;
                return <line key={`yt-${axis.id}-${t}`} x1={x1} y1={y} x2={x2} y2={y} stroke="#333" strokeWidth="1" />;
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
          const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
          const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
          let xPos = 0;
          if (isLeft) {
            let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
            xPos = padding.left - offset - axisMetrics.total;
          } else {
            let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
            xPos = width - padding.right + offset;
          }
          const range = axis.max - axis.min;
          if (range <= 0 || chartHeight <= 0) return null;
          const step = range / Math.max(2, Math.floor(chartHeight / 30));
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
          const actualStep = finalStep * magnitude;
          if (actualStep <= 0) return null;
          const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1))), firstTick = Math.ceil(axis.min / actualStep) * actualStep, result = [];
          for (let t = firstTick; t <= axis.max; t += actualStep) {
            if (result.length > 100) break;
            result.push(t);
          }
          const axisSeries = series.filter((s: any) => s.yAxisId === axis.id), title = axisSeries.map((s: any) => s.name || s.yColumn).join(' / ');
          const spineX = isLeft ? xPos + axisMetrics.total : xPos;
          const labelX = isLeft ? spineX - 7 - axisMetrics.label : spineX + 7;
          const titleX = isLeft ? xPos + 7.5 : xPos + axisMetrics.total - 7.5;
          return (
            <React.Fragment key={axis.id}>
              {result.map(t => {
                const { y } = worldToScreen(0, t, { ...viewportX, xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding });
                return <div key={`yl-${axis.id}-${t}`} style={{ position: 'absolute', left: labelX, top: y, transform: 'translateY(-50%)', fontSize: '9px', color: '#333', width: axisMetrics.label, textAlign: isLeft ? 'right' : 'left' }}>{t.toFixed(precision)}</div>;
              })}
              <div style={{ position: 'absolute', top: padding.top + chartHeight / 2, left: titleX, transform: `translate(-50%, -50%) rotate(${isLeft ? -90 : 90}deg)`, fontSize: '10px', fontWeight: 'bold', color: axisSeries[0]?.lineColor || '#333', padding: '2px 4px', borderRadius: '2px', whiteSpace: 'nowrap', textAlign: 'center', maxWidth: chartHeight, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
});

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, yAxes, viewportX, xMode, formatDate }: any) => {
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const handleMove = (e: MouseEvent) => {
      if (isPanning) { setPos(null); return; }
      const rect = el.getBoundingClientRect(); const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) { setPos({ x, y }); } else { setPos(null); }
    };
    const handleLeave = () => setPos(null);
    window.addEventListener('mousemove', handleMove); el.addEventListener('mouseleave', handleLeave);
    return () => { window.removeEventListener('mousemove', handleMove); el.removeEventListener('mouseleave', handleLeave); };
  }, [containerRef, padding, width, height, isPanning]);
  if (!pos) return null;
  
  const vp = { xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };
  const worldPos = screenToWorld(pos.x, pos.y, vp);
  
  const xValue = xMode === 'date' 
    ? new Date(worldPos.x * 1000).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
    : worldPos.x.toFixed(6);
    
  const yValues = yAxes.map((axis: any, idx: number) => {
    const axisVp = { ...vp, yMin: axis.min, yMax: axis.max };
    const w = screenToWorld(pos.x, pos.y, axisVp);
    return { id: axis.id, label: `y${idx + 1}`, value: w.y.toFixed(4) };
  });
  
  const isTooltipOnRight = pos.x < width / 2;
  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
        <line x1={pos.x} y1={padding.top} x2={pos.x} y2={height - padding.bottom} stroke="#ccc" strokeWidth="1" strokeDasharray="2 2" />
        <line x1={padding.left} y1={pos.y} x2={width - padding.right} y2={pos.y} stroke="#ccc" strokeWidth="1" strokeDasharray="2 2" />
      </svg>
      <div style={{ position: 'absolute', left: isTooltipOnRight ? pos.x + 15 : 'auto', right: isTooltipOnRight ? 'auto' : (width - pos.x) + 15, top: pos.y + 15, backgroundColor: 'rgba(255, 255, 255, 0.85)', color: '#333', padding: '6px 10px', borderRadius: '4px', fontSize: '10px', fontFamily: 'monospace', pointerEvents: 'none', zIndex: 100, boxShadow: '0 2px 8px rgba(0,0,0,0.1)', backdropFilter: 'blur(4px)', border: '1px solid rgba(0,0,0,0.05)', whiteSpace: 'pre', lineHeight: '1.2' }}>
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.05)', marginBottom: '4px', paddingBottom: '2px', fontWeight: 'bold' }}>X: {xValue}</div>
        {yValues.map((y: any) => (<div key={y.id}>{y.label}: {y.value}</div>))}
      </div>
    </>
  );
});

const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { datasets, series, yAxes, axisTitles, setAxisTitles, viewportX, setViewportX, updateYAxis, xMode, isLoaded } = useGraphStore();
  
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [editingXTitle, setEditingXTitle] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const pressedKeys = useRef<Set<string>>(new Set());
  
  // Persistent targets for animation - initialized from store values to restore view status
  const targetX = useRef({ min: viewportX.min, max: viewportX.max });
  const targetYs = useRef<Record<string, { min: number, max: number }>>({});
  const wasEmptyRef = useRef(true);
  const isAnimating = useRef(false);

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    
    let rafId: number;
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
    
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = 0.4;
      const keys = pressedKeys.current;
      let needsNextFrame = false;
      
      // Keyboard Zoom
      if (keys.has('+') || keys.has('=') || keys.has('-') || keys.has('_')) {
        const isCtrl = keys.has('Control');
        const zoomFactor = (keys.has('+') || keys.has('=')) ? 0.85 : 1.15;
        const xRange = targetX.current.max - targetX.current.min;
        const newXRange = xRange * zoomFactor;
        targetX.current = { min: targetX.current.min + (xRange - newXRange) / 2, max: targetX.current.max - (xRange - newXRange) / 2 };
        if (!isCtrl) {
          state.yAxes.forEach(axis => {
            const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
            const yRange = t.max - t.min;
            const newYRange = yRange * zoomFactor;
            targetYs.current[axis.id] = { min: t.min + (yRange - newYRange) / 2, max: t.max - (yRange - newYRange) / 2 };
          });
        }
        needsNextFrame = true;
      }
      
      // Viewport X animation
      const xRange = Math.abs(state.viewportX.max - state.viewportX.min);
      const xEps = xRange * 0.0001 || 0.0001;
      const nextXMin = lerp(state.viewportX.min, targetX.current.min, factor);
      const nextXMax = lerp(state.viewportX.max, targetX.current.max, factor);
      
      if (Math.abs(nextXMin - state.viewportX.min) > xEps || Math.abs(nextXMax - state.viewportX.max) > xEps) {
        state.setViewportX({ min: nextXMin, max: nextXMax });
        needsNextFrame = true;
      } else if (state.viewportX.min !== targetX.current.min || state.viewportX.max !== targetX.current.max) {
        state.setViewportX({ min: targetX.current.min, max: targetX.current.max });
      }
      
      // Y Axes animations
      state.yAxes.forEach(axis => {
        const target = targetYs.current[axis.id];
        if (!target) return;
        const yRange = Math.abs(axis.max - axis.min);
        const yEps = yRange * 0.0001 || 0.0001;
        const nextYMin = lerp(axis.min, target.min, factor);
        const nextYMax = lerp(axis.max, target.max, factor);
        
        if (Math.abs(nextYMin - axis.min) > yEps || Math.abs(nextYMax - axis.max) > yEps) {
          state.updateYAxis(axis.id, { min: nextYMin, max: nextYMax });
          needsNextFrame = true;
        } else if (axis.min !== target.min || axis.max !== target.max) {
          state.updateYAxis(axis.id, { min: target.min, max: target.max });
        }
      });

      if (needsNextFrame) {
        rafId = requestAnimationFrame(loop);
      } else {
        isAnimating.current = false;
      }
    };
    
    rafId = requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      targetX.current = { min: viewportX.min, max: viewportX.max };
      yAxes.forEach(axis => {
        targetYs.current[axis.id] = { min: axis.min, max: axis.max };
      });
      startAnimation();
    }
  }, [isLoaded]); // Only on initial load to restore status

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const axisLayout = useMemo(() => {
    const layout: Record<string, { total: number, label: number }> = {};
    activeYAxes.forEach(axis => {
      const range = axis.max - axis.min;
      const step = range / Math.max(2, Math.floor(500 / 30));
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
      const actualStep = finalStep * magnitude;
      const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
      const widestValChars = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
      const labelWidth = widestValChars * 6;
      layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
    });
    return layout;
  }, [activeYAxes]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  const padding = useMemo(() => {
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    return { ...BASE_PADDING, left: BASE_PADDING.left + leftSum, right: BASE_PADDING.right + rightSum };
  }, [leftAxes, rightAxes, axisLayout]);

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);

  useEffect(() => {
    if (!isLoaded) return;
    
    if (series.length === 0) {
      wasEmptyRef.current = true;
      return;
    }

    if (wasEmptyRef.current && datasets.length > 0) {
      wasEmptyRef.current = false;
      // If we have saved viewport values that aren't the default 0-100, don't auto-scale
      if (viewportX.min === 0 && viewportX.max === 100) {
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
          startAnimation();
        }
        
        activeYAxes.forEach(axis => {
          const axisSeries = series.filter(s => s.yAxisId === axis.id);
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
            startAnimation();
          }
        });
      }
    }
  }, [series, datasets, isLoaded, activeYAxes, startAnimation]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) { setWidth(entry.contentRect.width); setHeight(entry.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleWheel = (e: React.WheelEvent, target: 'all' | 'x' | { yAxisId: string }) => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    
    if (target === 'all' || target === 'x') {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : width / 2;
      const vp = { xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };
      const worldMouse = screenToWorld(mouseX, 0, vp);
      
      const currentX = targetX.current;
      const xRange = currentX.max - currentX.min;
      const newXRange = xRange * zoomFactor;
      
      const weight = (mouseX - padding.left) / chartWidth;
      targetX.current = { 
        min: worldMouse.x - weight * newXRange, 
        max: worldMouse.x + (1 - weight) * newXRange 
      };
    }
    if (target === 'all' || typeof target === 'object') {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseY = rect ? e.clientY - rect.top : height / 2;
      const axesToZoom = target === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (target as any).yAxisId)!];
      
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const axisVp = { xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding };
        const worldMouse = screenToWorld(0, mouseY, axisVp);
        
        const currentTarget = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
        const yRange = currentTarget.max - currentTarget.min;
        const newYRange = yRange * zoomFactor;
        
        const weight = (height - padding.bottom - mouseY) / chartHeight;
        targetYs.current[axis.id] = { 
          min: worldMouse.y - weight * newYRange, 
          max: worldMouse.y + (1 - weight) * newYRange 
        };
      });
    }
    startAnimation();
  };

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number, isCtrl?: boolean) => {
    const axisSeries = series.filter(s => s.yAxisId === axisId);
    if (axisSeries.length === 0) return;
    const state = useGraphStore.getState();
    let yMin = Infinity, yMax = -Infinity;
    axisSeries.forEach(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.indexOf(s.xColumn), yIdx = ds.columns.indexOf(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;
      const xData = ds.data[xIdx], yData = ds.data[yIdx];
      for (let i = 0; i < ds.rowCount; i++) {
        const x = xData[i];
        if (x >= state.viewportX.min && x <= state.viewportX.max) { const y = yData[i]; if (y < yMin) yMin = y; if (y > yMax) yMax = y; }
      }
    });
    if (yMin !== Infinity) {
      let nextMin = yMin, nextMax = yMax;
      if (isCtrl && mouseY !== undefined) {
        const chartCenterY = padding.top + chartHeight / 2;
        if (mouseY < chartCenterY) { nextMin = 2 * yMin - yMax; nextMax = yMax; } else { nextMin = yMin; nextMax = 2 * yMax - yMin; }
      } else {
        const range = yMax - yMin || 1, pad = (range / 0.9 - range) / 2;
        nextMin = yMin - pad; nextMax = yMax + pad;
      }
      targetYs.current[axisId] = { min: nextMin, max: nextMax };
      startAnimation();
    }
  }, [series, datasets, padding.top, chartHeight, startAnimation]);

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
      startAnimation();
    }
  }, [series, datasets, startAnimation]);

  const handleMouseDown = (e: React.MouseEvent, target: PanTarget = 'all') => {
    if (e.ctrlKey && target === 'all' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const initialBox = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = initialBox; setZoomBoxState(initialBox);
      }
    } else { setPanTarget(target); lastMousePos.current = { x: e.clientX, y: e.clientY }; }
  };

  const handleMouseMoveRaw = useCallback((e: MouseEvent) => {
    if (zoomBoxStartRef.current && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      let x = e.clientX - rect.left, y = e.clientY - rect.top;
      x = Math.max(padding.left, Math.min(width - padding.right, x));
      y = Math.max(padding.top, Math.min(height - padding.bottom, y));
      const newBox = { ...zoomBoxStartRef.current, endX: x, endY: y };
      zoomBoxStartRef.current = newBox; setZoomBoxState(newBox);
      return;
    }
    if (!panTarget || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x, dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    
    const state = useGraphStore.getState();
    const xRange = state.viewportX.max - state.viewportX.min;
    const xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
    
    if (panTarget === 'all' || panTarget === 'x') {
      const nextX = { min: state.viewportX.min - xMove, max: state.viewportX.max - xMove };
      state.setViewportX(nextX); 
      targetX.current = nextX;
    }
    
    const axesToPan = panTarget === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (panTarget as any).yAxisId)!];
    axesToPan.forEach(axis => {
      if (!axis) return;
      const yRange = axis.max - axis.min, yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
      const nextY = { min: axis.min + yMove, max: axis.max + yMove };
      state.updateYAxis(axis.id, nextY); 
      targetYs.current[axis.id] = nextY;
    });
  }, [panTarget, activeYAxes, chartWidth, chartHeight]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        zoomBoxStartRef.current = null; setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX), maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY), maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          const state = useGraphStore.getState();
          const vp = { ...state.viewportX, xMin: state.viewportX.min, xMax: state.viewportX.max, yMin: 0, yMax: 100, width, height, padding };
          const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp);
          targetX.current = { min: w1.x, max: w2.x };
          activeYAxes.forEach(axis => {
             const axisVp = { ...state.viewportX, xMin: state.viewportX.min, xMax: state.viewportX.max, yMin: axis.min, yMax: axis.max, width, height, padding };
             const a1 = screenToWorld(minX, maxY, axisVp), a2 = screenToWorld(maxX, minY, axisVp);
             targetYs.current[axis.id] = { min: a1.y, max: a2.y };  
          });
          startAnimation();
        }
      }
      setPanTarget(null);
    };
    window.addEventListener('mousemove', handleMouseMoveRaw); window.addEventListener('mouseup', handleMouseUp);
    return () => { window.removeEventListener('mousemove', handleMouseMoveRaw); window.removeEventListener('mouseup', handleMouseUp); };
  }, [handleMouseMoveRaw, activeYAxes, width, height, padding, startAnimation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) e.preventDefault();
      pressedKeys.current.add(e.key);
      
      const step = 0.15;
      if (e.key === 'ArrowLeft') {
        const range = targetX.current.max - targetX.current.min;
        targetX.current = { min: targetX.current.min - range * step, max: targetX.current.max - range * step };
        startAnimation();
      } else if (e.key === 'ArrowRight') {
        const range = targetX.current.max - targetX.current.min;
        targetX.current = { min: targetX.current.min + range * step, max: targetX.current.max + range * step };
        startAnimation();
      } else if (e.key === 'ArrowUp') {
        activeYAxes.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min;
          targetYs.current[axis.id] = { min: t.min + range * step, max: t.max + range * step };
        });
        startAnimation();
      } else if (e.key === 'ArrowDown') {
        activeYAxes.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min;
          targetYs.current[axis.id] = { min: t.min - range * step, max: t.max - range * step };
        });
        startAnimation();
      } else if (pressedKeys.current.has('+') || pressedKeys.current.has('-')) {
        startAnimation();
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(false); pressedKeys.current.delete(e.key); };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [activeYAxes, startAnimation]);

  const xTicks = useMemo(() => {
    const isXDate = xMode === 'date', range = viewportX.max - viewportX.min;
    if (range <= 0 || chartWidth <= 0) return { result: [], step: 1, precision: 0, isXDate };
    const maxTicks = Math.max(2, Math.floor(chartWidth / 60));
    let step = range / maxTicks;
    let precision = 0;
    if (!isXDate) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      let finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
      step = finalStep * magnitude;
      if (step <= 0) return { result: [], step: 1, precision: 0, isXDate };
      precision = Math.max(0, -Math.floor(Math.log10(step)));
    } else {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 432000, 604800, 1209600, 2592000];
      step = intervals.find(i => i > step) || intervals[intervals.length - 1];
    }
    const firstTick = Math.ceil(viewportX.min / step) * step;
    const result = [];
    for (let t = firstTick; t <= viewportX.max; t += step) {
      if (result.length > 100) break;
      result.push(t);
    }
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
      {series.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>No data</div>}
      <GridLines xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} viewportRef={viewportRef} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={datasets} series={series} yAxes={yAxes} viewportX={viewportX} width={width} height={height} padding={padding} />
      </div>
      <AxesLayer xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} leftAxes={leftAxes} rightAxes={rightAxes} viewportRef={viewportRef} isXDate={xTicks.isXDate} formatDate={formatDate} series={series} axisLayout={axisLayout} />
      <div 
        onWheel={(e) => { e.stopPropagation(); handleWheel(e, 'x'); }} 
        onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'x'); }} 
        onDoubleClick={(e) => { 
          e.stopPropagation(); 
          handleAutoScaleX(); 
        }} 
        style={{ position: 'absolute', bottom: 0, left: padding.left, right: padding.right, height: padding.bottom, cursor: 'ew-resize', zIndex: 20 }} 
      />
      {activeYAxes.map((axis) => {
        const isLeft = axis.position === 'left', sideIdx = isLeft ? leftAxes.indexOf(axis) : rightAxes.indexOf(axis);
        const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
        let xPos = 0;
        if (isLeft) {
          let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
          xPos = padding.left - offset - axisMetrics.total;
        } else {
          let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
          xPos = width - padding.right + offset;
        }
        return <div key={`wheel-${axis.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: axis.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: axis.id }); }} onDoubleClick={(e) => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); const mouseY = rect ? e.clientY - rect.top : undefined; handleAutoScaleY(axis.id, mouseY, e.ctrlKey); }} style={{ position: 'absolute', left: xPos, top: padding.top, width: axisMetrics.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} yAxes={activeYAxes} viewportX={viewportX} xMode={xMode} formatDate={formatDate} />
      {zoomBoxState && <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
      {editingXTitle ? (
        <input autoFocus defaultValue={axisTitles.x} onBlur={(e) => { setAxisTitles(e.target.value, axisTitles.y); setEditingXTitle(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { setAxisTitles(e.currentTarget.value, axisTitles.y); setEditingXTitle(false); } }} style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', zIndex: 30, textAlign: 'center', fontWeight: 'bold' }} />
      ) : (
        <div onDoubleClick={() => setEditingXTitle(true)} style={{ position: 'absolute', bottom: '5px', width: '100%', textAlign: 'center', pointerEvents: 'auto', cursor: 'text', fontWeight: 'bold', zIndex: 25 }}>{axisTitles.x}</div>
      )}
    </main>
  );
};

export default ChartContainer;
