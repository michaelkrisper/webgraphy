import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset } from '../../services/persistence';

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
        const step = range / maxTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
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
  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#333" />
          </marker>
        </defs>
        
        {/* Main Chart Border (no bottom) */}
        <path 
          d={`M${padding.left},${height - padding.bottom} V${padding.top} H${width - padding.right} V${height - padding.bottom}`} 
          fill="none" 
          stroke="#333" 
          strokeWidth="2" 
        />
        
        {/* Bottom X-Axis Spine with Arrow */}
        <line 
          x1={padding.left} 
          y1={height - padding.bottom} 
          x2={width - padding.right + 8} 
          y2={height - padding.bottom} 
          stroke="#333" 
          strokeWidth="2" 
          markerEnd="url(#arrow)" 
        />

        {/* Coordinate Axes at 0 - More visible but still distinct */}
        {viewportX.min <= 0 && viewportX.max >= 0 && (
          <line 
            x1={worldToScreen(0, 0, viewportRef).x} 
            y1={height - padding.bottom} 
            x2={worldToScreen(0, 0, viewportRef).x} 
            y2={padding.top - 8} 
            stroke="#666" 
            strokeWidth="1" 
            strokeDasharray="4 4"
            markerEnd="url(#arrow)" 
          />
        )}
        {yAxes.length > 0 && (() => {
          const mainAxis = yAxes[0];
          const axisVp = { ...viewportX, xMin: 0, xMax: 100, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
          if (mainAxis.min <= 0 && mainAxis.max >= 0) {
            return (
              <line 
                x1={padding.left} 
                y1={worldToScreen(0, 0, axisVp).y} 
                x2={width - padding.right + 8} 
                y2={worldToScreen(0, 0, axisVp).y} 
                stroke="#666" 
                strokeWidth="1" 
                strokeDasharray="4 4"
                markerEnd="url(#arrow)" 
              />
            );
          }
          return null;
        })()}

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
          const chartHeight = Math.max(0, height - padding.top - padding.bottom);
          if (range <= 0 || chartHeight <= 0) return null;
          const step = range / Math.max(2, Math.floor(chartHeight / 30));
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
          const actualStep = finalStep * magnitude;
          if (actualStep <= 0) return null;
          const firstTick = Math.ceil(axis.min / actualStep) * actualStep, result = [];
          for (let t = firstTick; t <= axis.max; t += actualStep) {
            if (result.length > 100) break;
            result.push(t);
          }
          return (
            <g key={axis.id}>
              {/* Spine with Arrow */}
              <line 
                x1={axisLineX} 
                y1={height - padding.bottom} 
                x2={axisLineX} 
                y2={padding.top - 8} 
                stroke="#333" 
                strokeWidth="1" 
                markerEnd="url(#arrow)"
              />
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
        {isXDate && xTicks.step < 86400 && (() => {
          const dayLabels = [];
          const startTimestamp = viewportX.min;
          const endTimestamp = viewportX.max;
          
          // Find all day transitions relevant to the current view
          // Start with the day containing the left edge
          const firstDate = new Date(startTimestamp * 1000);
          firstDate.setHours(0, 0, 0, 0);
          let currentMidnight = firstDate.getTime() / 1000;
          
          // We look at transitions from currentMidnight until we pass endTimestamp
          // Plus one extra to "push" the last visible one if needed
          while (currentMidnight <= endTimestamp) {
            const nextMidnight = currentMidnight + 86400;
            const { x: currentX } = worldToScreen(currentMidnight, 0, viewportRef);
            const { x: nextX } = worldToScreen(nextMidnight, 0, viewportRef);
            
            const labelWidth = 70; // Approximate width of "DD.MM.YYYY" label
            const paddingLeft = padding.left + 5;
            
            // This day's label should be at paddingLeft, UNLESS its midnight transition 
            // is already to the right of paddingLeft.
            // AND it should be pushed left by the next day's transition.
            let x = Math.max(currentX + 5, paddingLeft);
            
            // If the next midnight is coming, push this label out
            if (nextX < x + labelWidth) {
              x = nextX - labelWidth;
            }

            // Only render if some part of the label area is visible
            if (x + labelWidth > padding.left && x < width - padding.right) {
              dayLabels.push(
                <div key={`day-${currentMidnight}`} style={{ 
                  position: 'absolute', 
                  left: x, 
                  bottom: padding.bottom - 35, 
                  fontSize: '10px', 
                  fontWeight: 'bold', 
                  color: '#333',
                  backgroundColor: 'rgba(255,255,255,0.8)',
                  padding: '1px 4px',
                  borderRadius: '2px',
                  whiteSpace: 'nowrap',
                  borderLeft: currentX > padding.left ? '2px solid #333' : 'none',
                  zIndex: 10
                }}>
                  {new Date(currentMidnight * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                </div>
              );
            }
            currentMidnight = nextMidnight;
          }
          return dayLabels;
        })()}
        {xTicks.result.map((t: number) => {
          const { x } = worldToScreen(t, 0, viewportRef);
          if (x < padding.left || x > width - padding.right) return null;
          const label = isXDate ? formatDate(t, xTicks.step) : (Math.abs(t) < 1e-12 ? '0' : t.toFixed(xTicks.precision));
          return <div key={`xl-${t}`} style={{ position: 'absolute', left: x, bottom: padding.bottom - 20, transform: 'translateX(-50%)', fontSize: '9px', color: '#666' }}>{label}</div>;
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
          const chartHeight = Math.max(0, height - padding.top - padding.bottom);
          if (range <= 0 || chartHeight <= 0) return null;
          const step = range / Math.max(2, Math.floor(chartHeight / 30));
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
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
                const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(precision);
                return <div key={`yl-${axis.id}-${t}`} style={{ position: 'absolute', left: labelX, top: y, transform: 'translateY(-50%)', fontSize: '9px', color: '#333', width: axisMetrics.label, textAlign: isLeft ? 'right' : 'left' }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', top: padding.top + chartHeight / 2, left: titleX, transform: `translate(-50%, -50%) rotate(${isLeft ? -90 : 90}deg)`, fontSize: '12px', fontWeight: 'bold', color: axisSeries[0]?.lineColor || '#333', padding: '2px 4px', borderRadius: '2px', whiteSpace: 'nowrap', textAlign: 'center', maxWidth: chartHeight, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
});

const SNAP_PX = 30; // pixel radius for snapping to a point

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, yAxes, viewportX, xMode, datasets, series }: any) => {
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const handleMove = (e: MouseEvent) => {
      if (isPanning) { setPos(null); return; }
      const rect = el.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        setPos({ x, y });
      } else {
        setPos(null);
      }
    };
    const handleLeave = () => setPos(null);
    window.addEventListener('mousemove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => { window.removeEventListener('mousemove', handleMove); el.removeEventListener('mouseleave', handleLeave); };
  }, [containerRef, padding, width, height, isPanning]);

  const snap = useMemo(() => {
    if (!pos || !datasets || !series || series.length === 0) return null;
    const vp = { xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };
    const mouseWorld = screenToWorld(pos.x, pos.y, vp);

    // Convert SNAP_PX radius to world-x distance
    const xWorldPerPx = (viewportX.max - viewportX.min) / Math.max(1, width - padding.left - padding.right);
    const xSnapWorld = SNAP_PX * xWorldPerPx;

    // Find the nearest X point across all series
    let bestDist = Infinity;
    let bestXWorld: number | null = null;

    series.forEach((s: any) => {
      const ds = datasets.find((d: any) => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.findIndex((c: string) => c === s.xColumn || c.endsWith(`: ${s.xColumn}`));
      if (xIdx === -1) return;
      const xCol = ds.data[xIdx];
      if (!xCol || !xCol.levels || !xCol.levels[0]) return;
      const xData = xCol.levels[0];
      const refX = xCol.refPoint;

      // Binary search for the closest point
      let lo = 0, hi = xData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xData[mid] + refX < mouseWorld.x) lo = mid + 1; else hi = mid;
      }
      for (const i of [lo - 1, lo, lo + 1]) {
        if (i < 0 || i >= xData.length) continue;
        const wx = xData[i] + refX;
        const d = Math.abs(wx - mouseWorld.x);
        if (d < bestDist) { bestDist = d; bestXWorld = wx; }
      }
    });

    if (bestXWorld === null || bestDist > xSnapWorld) return null;
    const finalBestXWorld = bestXWorld as number;

    // Pre-calculate axis titles to avoid O(N^2) filtering in the loop
    const seriesByAxis: Record<string, string[]> = {};
    series.forEach((sr: any) => {
      if (!seriesByAxis[sr.yAxisId]) seriesByAxis[sr.yAxisId] = [];
      seriesByAxis[sr.yAxisId].push(sr.name || sr.yColumn);
    });
    const axisTitleMap: Record<string, string> = {};
    yAxes.forEach((axis: any) => {
      if (seriesByAxis[axis.id]) {
        axisTitleMap[axis.id] = seriesByAxis[axis.id].join('/');
      }
    });

    // Collect all Y values from all series at this X
    const entries: { label: string, value: number, color: string }[] = [];
    series.forEach((s: any) => {
      const ds = datasets.find((d: any) => d.id === s.sourceId);
      if (!ds) return;
      const xIdx = ds.columns.findIndex((c: string) => c === s.xColumn || c.endsWith(`: ${s.xColumn}`));
      const yIdx = ds.columns.findIndex((c: string) => c === s.yColumn || c.endsWith(`: ${s.yColumn}`));
      if (xIdx === -1 || yIdx === -1) return;
      const xCol = ds.data[xIdx], yCol = ds.data[yIdx];
      if (!xCol?.levels?.[0] || !yCol?.levels?.[0]) return;
      const xData = xCol.levels[0], yData = yCol.levels[0];
      const refX = xCol.refPoint, refY = yCol.refPoint;

      // Find closest index to bestXWorld
      let lo = 0, hi = xData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xData[mid] + refX < finalBestXWorld) lo = mid + 1; else hi = mid;
      }
      let bestI = lo;
      if (lo > 0 && Math.abs(xData[lo-1]+refX-finalBestXWorld) < Math.abs(xData[lo]+refX-finalBestXWorld)) bestI = lo-1;

      const yVal = yData[bestI] + refY;
      const axisTitle = axisTitleMap[s.yAxisId] || '';
      const label = s.name || s.yColumn;
      const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;
      entries.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333' });
    });

    // Screen position of the snapped point (use first series to get Y screen pos for crosshair)
    const snapScreenX = worldToScreen(finalBestXWorld, 0, vp).x;

    return { xWorld: finalBestXWorld, snapScreenX, entries };
  }, [pos, datasets, series, yAxes, viewportX, width, height, padding]);

  if (!pos) return null;
  if (!snap) return null; // Only show when near a point

  const { xWorld, snapScreenX, entries } = snap;
  const maxExpectedHeight = 30 + entries.length * 18; 
  const isTooltipOnRight = pos.x + 320 + 20 < width; 
  const isTooltipBelow = pos.y + maxExpectedHeight + 20 < height;

  const xLabel = xMode === 'date'
    ? new Date(xWorld * 1000).toLocaleString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })
    : parseFloat(xWorld.toPrecision(7)).toString();

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
        <line x1={snapScreenX} y1={padding.top} x2={snapScreenX} y2={height - padding.bottom} stroke="#aaa" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <div style={{
        position: 'absolute',
        left: isTooltipOnRight ? snapScreenX + 12 : 'auto',
        right: isTooltipOnRight ? 'auto' : (width - snapScreenX) + 12,
        top: isTooltipBelow ? pos.y + 15 : 'auto',
        bottom: isTooltipBelow ? 'auto' : (height - pos.y) + 15,
        backgroundColor: 'rgba(255,255,255,0.92)',
        color: '#333',
        padding: '6px 10px',
        borderRadius: '5px',
        fontSize: '10px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 100,
        boxShadow: '0 2px 10px rgba(0,0,0,0.12)',
        backdropFilter: 'blur(4px)',
        border: '1px solid rgba(0,0,0,0.08)',
        whiteSpace: 'pre',
        lineHeight: '1.5',
        maxWidth: 320
      }}>
        <div style={{ borderBottom: '1px solid rgba(0,0,0,0.08)', marginBottom: '4px', paddingBottom: '3px', fontWeight: 'bold', fontSize: '11px' }}>
          X: {xLabel}
        </div>
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(auto, 1fr) auto auto', columnGap: '0px', rowGap: '2px' }}>
            {entries.map((e: any, i: number) => {
              // Strip Float32 garbage using toPrecision(7) as Float32 supports ~7 significant digits
              const cleanValue = parseFloat(e.value.toPrecision(7));
              const valStr = cleanValue.toLocaleString('de-DE', { 
                minimumFractionDigits: 0, 
                maximumFractionDigits: 10
              });
              const idx = valStr.indexOf(',');
              const intPart = idx !== -1 ? valStr.substring(0, idx) : valStr;
              const decPart = idx !== -1 ? valStr.substring(idx) : '';

              return (
                <React.Fragment key={i}>
                  <div style={{ color: e.color, textAlign: 'right', paddingRight: '4px' }}>{e.label}:</div>
                  <div style={{ color: '#333', fontWeight: 'bold', textAlign: 'right' }}>{intPart}</div>
                  <div style={{ color: '#333', fontWeight: 'bold', textAlign: 'left' }}>{decPart}</div>
                </React.Fragment>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
});

const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { series, yAxes, viewportX, isLoaded, lastAppliedViewId } = useGraphStore();
  
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [editingXTitle, setEditingXTitle] = useState(false);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const hoveredAxisIdRef = useRef<string | null>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  
  const targetX = useRef({ min: viewportX.min, max: viewportX.max });
  const targetYs = useRef<Record<string, { min: number, max: number }>>({});
  const wasEmptyRef = useRef(true);
  const isAnimating = useRef(false);

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = 0.4;
      const keys = pressedKeys.current;
      let needsNextFrame = false;
      if (keys.has('+') || keys.has('=') || keys.has('-') || keys.has('_')) {
        const isCtrl = keys.has('Control'), zoomFactor = (keys.has('+') || keys.has('=')) ? 0.85 : 1.15;
        const xRange = targetX.current.max - targetX.current.min, newXRange = xRange * zoomFactor;
        targetX.current = { min: targetX.current.min + (xRange - newXRange) / 2, max: targetX.current.max - (xRange - newXRange) / 2 };
        if (!isCtrl) {
          state.yAxes.forEach(axis => {
            const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
            const yRange = t.max - t.min, newYRange = yRange * zoomFactor;
            targetYs.current[axis.id] = { min: t.min + (yRange - newYRange) / 2, max: t.max - (yRange - newYRange) / 2 };
          });
        }
        needsNextFrame = true;
      }
      const xRange = Math.abs(state.viewportX.max - state.viewportX.min), xEps = xRange * 0.0001 || 0.0001;
      const nextXMin = lerp(state.viewportX.min, targetX.current.min, factor), nextXMax = lerp(state.viewportX.max, targetX.current.max, factor);
      if (Math.abs(nextXMin - state.viewportX.min) > xEps || Math.abs(nextXMax - state.viewportX.max) > xEps) {
        state.setViewportX({ min: nextXMin, max: nextXMax }); needsNextFrame = true;
      } else if (state.viewportX.min !== targetX.current.min || state.viewportX.max !== targetX.current.max) {
        state.setViewportX({ min: targetX.current.min, max: targetX.current.max });
      }
      state.yAxes.forEach(axis => {
        const target = targetYs.current[axis.id]; if (!target) return;
        const yRange = Math.abs(axis.max - axis.min), yEps = yRange * 0.0001 || 0.0001;
        const nextYMin = lerp(axis.min, target.min, factor), nextYMax = lerp(axis.max, target.max, factor);
        if (Math.abs(nextYMin - axis.min) > yEps || Math.abs(nextYMax - axis.max) > yEps) {
          state.updateYAxis(axis.id, { min: nextYMin, max: nextYMax }); needsNextFrame = true;
        } else if (axis.min !== target.min || axis.max !== target.max) {
          state.updateYAxis(axis.id, { min: target.min, max: target.max });
        }
      });
      if (needsNextFrame) requestAnimationFrame(loop); else isAnimating.current = false;
    };
    requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (isLoaded) {
      targetX.current = { min: viewportX.min, max: viewportX.max };
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded]);

  // Handle View Snapshots Lerp
  useEffect(() => {
    if (!lastAppliedViewId) return;
    const view = useGraphStore.getState().views.find(v => v.id === lastAppliedViewId.id);
    if (!view) return;
    targetX.current = view.viewportX;
    view.yAxes.forEach(axis => {
      targetYs.current[axis.id] = { min: axis.min, max: axis.max };
    });
    startAnimation();
  }, [lastAppliedViewId, startAnimation]);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const axisLayout = useMemo(() => {
    const layout: Record<string, { total: number, label: number }> = {};
    activeYAxes.forEach(axis => {
      const range = axis.max - axis.min, approxHeight = 20, maxTicks = Math.max(2, Math.floor(height / (approxHeight + 10)));
      const step = range / maxTicks;
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
      const actualStep = finalStep * magnitude, precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
      const widestValChars = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
      const labelWidth = widestValChars * 6;
      layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
    });
    return layout;
  }, [activeYAxes, height]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);
  const padding = useMemo(() => {
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    return { ...BASE_PADDING, left: BASE_PADDING.left + leftSum, right: BASE_PADDING.right + rightSum };
  }, [leftAxes, rightAxes, axisLayout]);

  const chartWidth = Math.max(0, width - padding.left - padding.right), chartHeight = Math.max(0, height - padding.top - padding.bottom);

  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    if (state.series.length === 0 && state.datasets.length === 0) { wasEmptyRef.current = true; return; }

    // AGGRESSIVE AUTO-SCALE: If current viewport is way off data bounds, reset it.
    let shouldReset = wasEmptyRef.current;
    if (!shouldReset && state.datasets.length > 0) {
       // Check if ANY dataset is visible in current X range
       let anyDataVisible = false;
       state.datasets.forEach(ds => {
         // Use fuzzy matching for X column
         const xIdx = ds.columns.findIndex(c => c === state.globalXColumn || c.endsWith(`: ${state.globalXColumn}`));
         const xCol = ds.data[xIdx === -1 ? 0 : xIdx];
         
         if (xCol && xCol.bounds) {
           const overlap = Math.max(0, Math.min(state.viewportX.max, xCol.bounds.max) - Math.max(state.viewportX.min, xCol.bounds.min));
           if (overlap > 0 || (state.viewportX.min >= xCol.bounds.min && state.viewportX.max <= xCol.bounds.max)) {
             anyDataVisible = true;
           }
         }
       });
       
       if (!anyDataVisible) {
         shouldReset = true;
       }
    }

    if (shouldReset && state.datasets.length > 0) {
      wasEmptyRef.current = false;
      let xMin = Infinity, xMax = -Infinity;
      
      // Calculate global X bounds from all datasets
      state.datasets.forEach(ds => {
        const xIdx = ds.columns.findIndex(c => c === state.globalXColumn || c.endsWith(`: ${state.globalXColumn}`));
        if (xIdx !== -1) {
          const col = ds.data[xIdx];
          if (col.bounds.min < xMin) xMin = col.bounds.min;
          if (col.bounds.max > xMax) xMax = col.bounds.max;
        } else {
          // Fallback to searching for "time" or index 0 if globalXColumn not found in this dataset
          ds.data.forEach((col, idx) => {
            if (idx === 0 || ds.columns[idx].toLowerCase().includes('time')) {
              if (col.bounds.min < xMin) xMin = col.bounds.min;
              if (col.bounds.max > xMax) xMax = col.bounds.max;
            }
          });
        }
      });
      
      if (xMin !== Infinity) {
        const range = xMax - xMin || 1;
        const pad = range * 0.05; // 5% margin
        const nextX = { min: xMin - pad, max: xMax + pad };
        targetX.current = nextX;
        state.setViewportX(nextX);
        startAnimation();
      }
      
      const datasetsById = new Map<string, Dataset>();
      state.datasets.forEach(d => datasetsById.set(d.id, d));

      activeYAxes.forEach(axis => {
        const axisSeries = state.series.filter(s => s.yAxisId === axis.id);
        if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => {
          const ds = datasetsById.get(s.sourceId); if (!ds) return;
          const yCol = ds.data[ds.columns.indexOf(s.yColumn)]; if (!yCol || !yCol.bounds) return;
          if (yCol.bounds.min < yMin) yMin = yCol.bounds.min;
          if (yCol.bounds.max > yMax) yMax = yCol.bounds.max;
        });
        if (yMin !== Infinity) {
          const range = yMax - yMin || 1;
          const pad = range * 0.05; // 5% margin
          const nextY = { min: yMin - pad, max: yMax + pad };
          targetYs.current[axis.id] = nextY;
          state.updateYAxis(axis.id, nextY);
          startAnimation();
        }
      });
    }
  }, [isLoaded, startAnimation, series, yAxes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) { setWidth(entry.contentRect.width); setHeight(entry.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const handleWheel = (e: React.WheelEvent, target: PanTarget = 'all') => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    if (target === 'all' || target === 'x') {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : width / 2;
      const vp = { xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding };
      const worldMouse = screenToWorld(mouseX, 0, vp);
      const currentX = targetX.current, xRange = currentX.max - currentX.min, newXRange = xRange * zoomFactor;
      const weight = (mouseX - padding.left) / chartWidth;
      targetX.current = { min: worldMouse.x - weight * newXRange, max: worldMouse.x + (1 - weight) * newXRange };
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
        const yRange = currentTarget.max - currentTarget.min, newYRange = yRange * zoomFactor;
        const weight = (height - padding.bottom - mouseY) / chartHeight;
        targetYs.current[axis.id] = { min: worldMouse.y - weight * newYRange, max: worldMouse.y + (1 - weight) * newYRange };
      });
    }
    startAnimation();
  };

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number, isCtrl?: boolean) => {
    const state = useGraphStore.getState();
    const axisSeries = state.series.filter(s => s.yAxisId === axisId); if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;
    
    const datasetsById = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsById.set(d.id, d));

    axisSeries.forEach(s => {
      const ds = datasetsById.get(s.sourceId); if (!ds) return;
      
      const findColumn = (name: string) => {
        const idx = ds.columns.indexOf(name);
        if (idx !== -1) return idx;
        return ds.columns.findIndex((c: string) => c.endsWith(`: ${name}`) || c === name);
      };

      const xIdx = findColumn(s.xColumn);
      const yIdx = findColumn(s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;

      const colX = ds.data[xIdx];
      const colY = ds.data[yIdx];
      if (!colX || !colY || !colX.levels[0] || !colY.levels[0]) return;

      const xData = colX.levels[0];
      const yData = colY.levels[0];
      const refX = colX.refPoint;
      const refY = colY.refPoint;
      
      // Binary search for visible range indices
      let startIdx = 0;
      let endIdx = xData.length - 1;
      
      // Find first index where xData[i] + refX >= viewportX.min
      let low = 0, high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + refX >= viewportX.min) { startIdx = mid; high = mid - 1; }
        else { low = mid + 1; }
      }
      
      // Find last index where xData[i] + refX <= viewportX.max
      low = 0; high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + refX <= viewportX.max) { endIdx = mid; low = mid + 1; }
        else { high = mid - 1; }
      }

      // Scan Y values in visible range
      for (let i = startIdx; i <= endIdx; i++) {
        const val = yData[i] + refY;
        if (val < yMin) yMin = val;
        if (val > yMax) yMax = val;
      }
    });

    if (yMin !== Infinity) {
      let nextMin = yMin, nextMax = yMax;
      const range = yMax - yMin || 1;
      const pad = range * 0.05; // 5% margin
      
      if (isCtrl && mouseY !== undefined) {
        const chartCenterY = padding.top + chartHeight / 2;
        if (mouseY < chartCenterY) { 
          // TOP half click -> Show TOP half of data (extend min downwards)
          nextMin = yMin - (yMax - yMin) - pad; 
          nextMax = yMax + pad; 
        } else { 
          // BOTTOM half click -> Show BOTTOM half of data (extend max upwards)
          nextMin = yMin - pad; 
          nextMax = yMax + (yMax - yMin) + pad; 
        }
      } else {
        nextMin = yMin - pad; 
        nextMax = yMax + pad;
      }
      targetYs.current[axisId] = { min: nextMin, max: nextMax }; startAnimation();
    }
  }, [viewportX, padding.top, chartHeight, startAnimation]);

  const prevSeriesLenRef = useRef(series.length);
  useEffect(() => {
    if (isLoaded && series.length > prevSeriesLenRef.current) {
      const addedSeries = series[series.length - 1];
      if (addedSeries) {
        handleAutoScaleY(addedSeries.yAxisId);
      }
    }
    prevSeriesLenRef.current = series.length;
  }, [series, isLoaded, handleAutoScaleY]);

  const handleAutoScaleX = useCallback(() => {
    const state = useGraphStore.getState();
    if (state.datasets.length === 0) return;
    let xMin = Infinity, xMax = -Infinity;
    state.datasets.forEach(ds => {
      const xIdx = ds.columns.findIndex(c => c === state.globalXColumn || c.endsWith(`: ${state.globalXColumn}`));
      if (xIdx !== -1) {
        const col = ds.data[xIdx];
        if (col.bounds.min < xMin) xMin = col.bounds.min;
        if (col.bounds.max > xMax) xMax = col.bounds.max;
      } else {
        ds.data.forEach((col, idx) => {
          if (idx === 0 || ds.columns[idx].toLowerCase().includes('time')) {
            if (col.bounds.min < xMin) xMin = col.bounds.min;
            if (col.bounds.max > xMax) xMax = col.bounds.max;
          }
        });
      }
    });
    if (xMin !== Infinity) { 
      const pad = (xMax - xMin || 1) * 0.05; // 5% margin
      targetX.current = { min: xMin - pad, max: xMax + pad }; startAnimation();
    }
  }, [startAnimation]);

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
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Detect Hovered Axis
    let foundHovered = null;
    leftAxes.forEach((axis, sideIdx) => {
      let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[leftAxes[i].id]?.total || 40;
      const axisMetrics = axisLayout[axis.id] || { total: 40 };
      const leftBound = padding.left - offset - axisMetrics.total;
      const rightBound = padding.left - offset;
      if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
    });
    rightAxes.forEach((axis, sideIdx) => {
      let offset = 0; for(let i=0; i<sideIdx; i++) offset += axisLayout[rightAxes[i].id]?.total || 40;
      const axisMetrics = axisLayout[axis.id] || { total: 40 };
      const leftBound = width - padding.right + offset;
      const rightBound = width - padding.right + offset + axisMetrics.total;
      if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
    });
    hoveredAxisIdRef.current = foundHovered;

    if (zoomBoxStartRef.current && containerRef.current) {
      const mx = Math.max(padding.left, Math.min(width - padding.right, mouseX));
      const my = Math.max(padding.top, Math.min(height - padding.bottom, mouseY));
      zoomBoxStartRef.current.endX = mx;
      zoomBoxStartRef.current.endY = my;
      setZoomBoxState({ ...zoomBoxStartRef.current });
      return;
    }
    if (!panTarget || !lastMousePos.current) return;
    const dx = e.clientX - lastMousePos.current.x, dy = e.clientY - lastMousePos.current.y;
    lastMousePos.current = { x: e.clientX, y: e.clientY };
    const state = useGraphStore.getState();
    const xRange = state.viewportX.max - state.viewportX.min, xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
    if (panTarget === 'all' || panTarget === 'x') {
      const nextX = { min: state.viewportX.min - xMove, max: state.viewportX.max - xMove };
      state.setViewportX(nextX); targetX.current = nextX;
    }
    const axesToPan = panTarget === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (panTarget as any).yAxisId)!];
    const SNAP_THRESHOLD = 15;
    const snapTargets = [padding.top, padding.top + chartHeight / 2, height - padding.bottom];

    axesToPan.forEach(axis => {
      if (!axis) return;
      const yRange = axis.max - axis.min;
      const yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
      let nextMin = axis.min + yMove;
      let nextMax = axis.max + yMove;

      // Snapping Logic
      if (chartHeight > 0) {
        // Find screen pixel position of world 0 in the NEW range
        const nextYRange = nextMax - nextMin;
        const screenYZero = padding.top + (1 - (0 - nextMin) / nextYRange) * chartHeight;
        
        let bestTarget = null;
        let bestDist = SNAP_THRESHOLD;
        
        for (const target of snapTargets) {
          const d = Math.abs(screenYZero - target);
          if (d < bestDist) {
            bestDist = d;
            bestTarget = target;
          }
        }
        
        if (bestTarget !== null) {
          // Snap world 0 to bestTarget
          // (bestTarget - padding.top) / chartHeight = 1 + nextMin / nextYRange
          // nextMin / nextYRange = (bestTarget - padding.top) / chartHeight - 1
          // -> nextMin = nextYRange * ((bestTarget - padding.top) / chartHeight - 1)
          const ratio = (bestTarget - padding.top) / chartHeight - 1;
          nextMin = nextYRange * ratio;
          nextMax = nextMin + nextYRange;
        }
      }

      const nextY = { min: nextMin, max: nextMax };
      state.updateYAxis(axis.id, nextY); 
      targetYs.current[axis.id] = nextY;
    });
  }, [panTarget, activeYAxes, chartWidth, chartHeight, padding, width, height]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current; zoomBoxStartRef.current = null; setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX), maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY), maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          const state = useGraphStore.getState();
          const vp = { xMin: state.viewportX.min, xMax: state.viewportX.max, yMin: 0, yMax: 100, width, height, padding };
          const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp);
          targetX.current = { min: w1.x, max: w2.x };
          activeYAxes.forEach(axis => {
             const axisVp = { xMin: state.viewportX.min, xMax: state.viewportX.max, yMin: axis.min, yMax: axis.max, width, height, padding };
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
        targetX.current = { min: targetX.current.min - range * step, max: targetX.current.max - range * step }; startAnimation();
      } else if (e.key === 'ArrowRight') {
        const range = targetX.current.max - targetX.current.min;
        targetX.current = { min: targetX.current.min + range * step, max: targetX.current.max + range * step }; startAnimation();
      } else if (e.key === 'ArrowUp') {
        const axesToMove = hoveredAxisIdRef.current ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
        axesToMove.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min; targetYs.current[axis.id] = { min: t.min + range * step, max: t.max + range * step };
        }); startAnimation();
      } else if (e.key === 'ArrowDown') {
        const axesToMove = hoveredAxisIdRef.current ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
        axesToMove.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min; targetYs.current[axis.id] = { min: t.min - range * step, max: t.max - range * step };
        }); startAnimation();
      } else if (pressedKeys.current.has('+') || pressedKeys.current.has('-')) startAnimation();
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(false); pressedKeys.current.delete(e.key); };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [activeYAxes, startAnimation]);

  const xTicks = useMemo(() => {
    const isXDate = useGraphStore.getState().xMode === 'date', range = viewportX.max - viewportX.min;
    if (range <= 0 || chartWidth <= 0) return { result: [], step: 1, precision: 0, isXDate };
    const maxTicks = Math.max(2, Math.floor(chartWidth / 60));
    let step = range / maxTicks;
    let precision = 0;
    if (!isXDate) {
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const normalizedStep = step / magnitude;
      const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
      step = finalStep * magnitude;
      if (step <= 0) return { result: [], step: 1, precision: 0, isXDate };
      precision = Math.max(0, -Math.floor(Math.log10(step)));
    } else {
      const intervals = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600, 900, 1800, 3600, 7200, 10800, 21600, 43200, 86400, 172800, 259200, 432000, 604800, 1209600, 2592000];
      step = intervals.find(i => i > step) || intervals[intervals.length - 1];
    }
    const firstTick = Math.ceil(viewportX.min / step) * step, result = [];
    for (let t = firstTick; t <= viewportX.max; t += step) { if (result.length > 100) break; result.push(t); }
    return { result, step, precision, isXDate };
  }, [viewportX.min, viewportX.max, chartWidth]);

  const viewportRef = useMemo(() => ({ xMin: viewportX.min, xMax: viewportX.max, yMin: 0, yMax: 100, width, height, padding }), [viewportX, width, height, padding]);
  const formatDate = useCallback((val: number, step: number) => {
    const d = new Date(val * 1000);
    if (step >= 86400) return d.getDate() + '.' + (d.getMonth()+1) + '.';
    if (step >= 3600) return d.getHours() + ':00';
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  }, []);

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : 'crosshair'), backgroundColor: '#fff', overflow: 'hidden' }}>
      {useGraphStore.getState().datasets.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>No data</div>}
      <GridLines xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} viewportRef={viewportRef} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={useGraphStore.getState().datasets} series={series} yAxes={yAxes} viewportX={viewportX} width={width} height={height} padding={padding} />
      </div>
      <AxesLayer xTicks={xTicks} yAxes={activeYAxes} viewportX={viewportX} width={width} height={height} padding={padding} leftAxes={leftAxes} rightAxes={rightAxes} viewportRef={viewportRef} isXDate={xTicks.isXDate} formatDate={formatDate} series={series} axisLayout={axisLayout} />
      <div onWheel={(e) => { e.stopPropagation(); handleWheel(e, 'x'); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, 'x'); }} onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleX(); }} style={{ position: 'absolute', bottom: 0, left: padding.left, right: padding.right, height: padding.bottom, cursor: 'ew-resize', zIndex: 20 }} />
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
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} yAxes={activeYAxes} viewportX={viewportX} xMode={useGraphStore.getState().xMode} formatDate={formatDate} datasets={useGraphStore.getState().datasets} series={series} />
      {zoomBoxState && <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
      {editingXTitle ? (
        <input autoFocus name="x-axis-title" autoComplete="off" defaultValue={useGraphStore.getState().axisTitles.x} onBlur={(e) => { useGraphStore.getState().setAxisTitles(e.target.value, useGraphStore.getState().axisTitles.y); setEditingXTitle(false); }} onKeyDown={(e) => { if (e.key === 'Enter') { useGraphStore.getState().setAxisTitles(e.currentTarget.value, useGraphStore.getState().axisTitles.y); setEditingXTitle(false); } }} style={{ position: 'absolute', bottom: '5px', left: '50%', transform: 'translateX(-50%)', zIndex: 30, textAlign: 'center', fontWeight: 'bold' }} />
      ) : (
        <div onClick={() => setEditingXTitle(true)} style={{ position: 'absolute', bottom: '5px', width: '100%', textAlign: 'center', pointerEvents: 'auto', cursor: 'text', fontWeight: 'bold', zIndex: 25 }}>{useGraphStore.getState().axisTitles.x}</div>
      )}
    </main>
  );
};

export default ChartContainer;
