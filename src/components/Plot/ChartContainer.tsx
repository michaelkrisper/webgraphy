import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels, formatFullDate, type TimeTick, type SecondaryLabel } from '../../utils/time';

const BASE_PADDING = { top: 20, right: 20, bottom: 30, left: 20 };

type XTicks =
  | { result: number[]; step: number; precision: number; isXDate: false; secondaryLabels?: undefined }
  | { result: TimeTick[]; isXDate: true; secondaryLabels: SecondaryLabel[]; step?: undefined; precision?: undefined }

interface XAxisLayout {
  id: string;
  ticks: XTicks;
  title: string;
  color: string;
}


interface GridLinesProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisConfig[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

interface AxesLayerProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisConfig[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  leftAxes: YAxisConfig[];
  rightAxes: YAxisConfig[];
  series: SeriesConfig[];
  axisLayout: Record<string, { total: number; label: number }>;
  allXAxes: XAxisConfig[];
}

interface CrosshairProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
  padding: { top: number; right: number; bottom: number; left: number };
  width: number;
  height: number;
  isPanning: boolean;
  xAxes: XAxisConfig[];
  yAxes: YAxisConfig[];
  datasets: Dataset[];
  series: SeriesConfig[];
}

type PanTarget = 'all' | { xAxisId: string } | { yAxisId: string };

const GridLines = React.memo(({ xAxes, yAxes, width, height, padding }: GridLinesProps) => {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {xAxes.length > 0 && (() => {
        const axis = xAxes[0];
        const state = useGraphStore.getState();
        const conf = state.xAxes.find(a => a.id === axis.id);
        if (!conf) return null;
        const vp = { xMin: conf.min, xMax: conf.max, yMin: 0, yMax: 100, width, height, padding };
        return axis.ticks.result.map((t: any) => {
          const timestamp = typeof t === 'number' ? t : t.timestamp;
          const { x } = worldToScreen(timestamp, 0, vp);
          return <line key={`gx-${timestamp}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#f0f0f0" strokeWidth="1" />;
        });
      })()}
      {yAxes.map((axis: YAxisConfig) => {
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
        const mainXConf = useGraphStore.getState().xAxes[0];
        return result.map(t => {
          const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
          return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f0f0f0" strokeWidth="1" />;
        });
      })}
    </svg>
  );
});

const AxesLayer = React.memo(({ xAxes, yAxes, width, height, padding, leftAxes, rightAxes, series, axisLayout, allXAxes }: AxesLayerProps) => {
  const seriesByYAxisId = useMemo(() => {
    const grouped: Record<string, SeriesConfig[]> = {};
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (!grouped[s.yAxisId]) grouped[s.yAxisId] = [];
      grouped[s.yAxisId].push(s);
    }
    return grouped;
  }, [series]);
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
        
        {xAxes.map((axis, idx) => {
          const axisConf = allXAxes.find(a => a.id === axis.id)!;
          const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
          const y = height - padding.bottom + idx * 40;

          return (
            <g key={`x-axis-spine-${axis.id}`}>
              {/* Spine */}
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right + 8}
                y2={y}
                stroke="#333"
                strokeWidth="1"
                markerEnd="url(#arrow)"
              />

              {/* Ticks */}
              {axis.ticks.result.map((t: any) => {
                const { x } = worldToScreen(typeof t === 'number' ? t : t.timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                return <line key={`xt-${axis.id}-${typeof t === 'number' ? t : t.timestamp}`} x1={x} y1={y} x2={x} y2={y + 6} stroke="#333" strokeWidth="1" />;
              })}

              {/* 0 line if visible */}
              {axisConf.min <= 0 && axisConf.max >= 0 && idx === 0 && (
                <line
                  x1={worldToScreen(0, 0, vp).x}
                  y1={height - padding.bottom}
                  x2={worldToScreen(0, 0, vp).x}
                  y2={padding.top - 8}
                  stroke="#666"
                  strokeWidth="1"
                  strokeDasharray="4 4"
                  markerEnd="url(#arrow)"
                />
              )}
            </g>
          );
        })}

        {yAxes.length > 0 && (() => {
          const mainAxis = yAxes[0];
          const mainXConf = allXAxes.find(a => a.id === (xAxes[0]?.id || 'axis-1'))!;
          const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
          if (mainAxis.min <= 0 && mainAxis.max >= 0) {
            return (
              <line 
                x1={padding.left} 
                y1={worldToScreen(mainXConf.min, 0, axisVp).y}
                x2={width - padding.right + 8} 
                y2={worldToScreen(mainXConf.min, 0, axisVp).y}
                stroke="#666" 
                strokeWidth="1" 
                strokeDasharray="4 4"
                markerEnd="url(#arrow)" 
              />
            );
          }
          return null;
        })()}
        {yAxes.map((axis: YAxisConfig) => {
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
                const mainXConf = allXAxes.find(a => a.id === (xAxes[0]?.id || 'axis-1'))!;
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
                const x1 = isLeft ? axisLineX - 5 : axisLineX;
                const x2 = isLeft ? axisLineX : axisLineX + 5;
                return <line key={`yt-${axis.id}-${t}`} x1={x1} y1={y} x2={x2} y2={y} stroke="#333" strokeWidth="1" />;
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
        {xAxes.map((axis, axisIdx) => {
          const axisConf = allXAxes.find(a => a.id === axis.id)!;
          const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
          const baseY = padding.bottom - axisIdx * 40;
          
          return (
            <React.Fragment key={`x-labels-${axis.id}`}>
              {axis.ticks.secondaryLabels && axis.ticks.secondaryLabels.map((sl: any, idx: number) => {
                const nextSl = axis.ticks.secondaryLabels![idx + 1];
                const { x: currentX } = worldToScreen(sl.timestamp, 0, vp);
                const { x: nextX } = nextSl ? worldToScreen(nextSl.timestamp, 0, vp) : { x: width - padding.right + 200 };

                const labelWidth = sl.label.length * 7;
                const paddingLeft = padding.left + 5;

                let x = Math.max(currentX + 5, paddingLeft);
                if (nextX < x + labelWidth + 10) {
                  x = nextX - labelWidth - 10;
                }

                if (x + labelWidth > padding.left && x < width - padding.right) {
                  return (
                    <div key={`sl-${axis.id}-${sl.timestamp}`} style={{
                      position: 'absolute',
                      left: x,
                      bottom: baseY - 35,
                      fontSize: '10px',
                      fontWeight: 'bold',
                      color: axis.color,
                      backgroundColor: 'rgba(255,255,255,0.8)',
                      padding: '1px 4px',
                      borderRadius: '2px',
                      whiteSpace: 'nowrap',
                      borderLeft: currentX > padding.left ? `2px solid ${axis.color}` : 'none',
                      zIndex: 10
                    }}>
                      {sl.label}
                    </div>
                  );
                }
                return null;
              })}
              {axis.ticks.result.map((t: any) => {
                const timestamp = typeof t === 'number' ? t : t.timestamp;
                const { x } = worldToScreen(timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : t.label;
                return <div key={`xl-${axis.id}-${timestamp}`} style={{ position: 'absolute', left: x, bottom: baseY - 20, transform: 'translateX(-50%)', fontSize: '9px', color: axis.color }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', bottom: baseY - 8, left: padding.left + (width - padding.left - padding.right) / 2, transform: 'translateX(-50%)', fontSize: '10px', fontWeight: 'bold', color: axis.color, whiteSpace: 'nowrap', maxWidth: width - padding.left - padding.right, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {axis.title}
              </div>
            </React.Fragment>
          );
        })}
        {yAxes.map((axis: YAxisConfig) => {
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
          const axisSeries = seriesByYAxisId[axis.id] || [], title = axisSeries.map((s: SeriesConfig) => s.name || s.yColumn).join(' / ');
          const spineX = isLeft ? xPos + axisMetrics.total : xPos;
          const labelX = isLeft ? spineX - 7 - axisMetrics.label : spineX + 7;
          const titleX = isLeft ? xPos + 7.5 : xPos + axisMetrics.total - 7.5;

          const mainXConf = allXAxes.find(a => a.id === (xAxes[0]?.id || 'axis-1'))!;

          return (
            <React.Fragment key={axis.id}>
              {result.map(t => {
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
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

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, xAxes, yAxes, datasets, series }: CrosshairProps) => {
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

  // ⚡ Bolt Optimization: Pre-calculate series metadata to avoid O(N) array/string operations inside the high-frequency mouse move `snap` calculation
  const seriesMetadata = useMemo(() => {
    return series.map(s => {
      const ds = datasets.find(d => d.id === s.sourceId);
      const axis = yAxes.find(a => a.id === s.yAxisId);
      if (!ds || !axis) return null;

      const findColumn = (name: string) => {
        const idx = ds.columns.indexOf(name);
        if (idx !== -1) return idx;
        return ds.columns.findIndex(c => c.endsWith(`: ${name}`) || c === name);
      };

      const xIdx = findColumn(s.xColumn);
      const yIdx = findColumn(s.yColumn);

      if (xIdx === -1 || yIdx === -1) return null;

      const xCol = ds.data[xIdx];
      const yCol = ds.data[yIdx];

      if (!xCol?.data || !yCol?.data) return null;

      return { series: s, ds, axis, xIdx, yIdx, xCol, yCol };
    }).filter(Boolean) as { series: SeriesConfig, ds: Dataset, axis: YAxisConfig, xIdx: number, yIdx: number, xCol: { data: Float32Array, refPoint: number, bounds: {min: number, max: number} }, yCol: { data: Float32Array, refPoint: number, bounds: {min: number, max: number} } }[];
  }, [datasets, series, yAxes]);

  const snap = useMemo(() => {
    if (!pos || seriesMetadata.length === 0) return null;

    // Use first used X-axis for mouse interaction base
    const firstUsedXAxisId = series[0]?.xAxisId || 'axis-1';
    const xAxisConf = xAxes.find(a => a.id === firstUsedXAxisId);
    if (!xAxisConf) return null;

    // Convert SNAP_PX radius to world-x distance
    const xWorldPerPx = (xAxisConf.max - xAxisConf.min) / Math.max(1, width - padding.left - padding.right);
    const xSnapWorld = SNAP_PX * xWorldPerPx;

    // Find the nearest X point across all series
    let bestDist = Infinity;
    let bestXWorld: number | null = null;
    let bestSeriesXConf: XAxisConfig | null = null;

    seriesMetadata.forEach(({ series: s, xCol }) => {
      const sXConf = xAxes.find(a => a.id === s.xAxisId);
      if (!sXConf) return;

      const xData = xCol.data;
      const refX = xCol.refPoint;

      const sVp = { xMin: sXConf.min, xMax: sXConf.max, yMin: 0, yMax: 100, width, height, padding };
      const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);

      // Binary search for the closest point
      let lo = 0, hi = xData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1; else hi = mid;
      }
      for (const i of [lo - 1, lo, lo + 1]) {
        if (i < 0 || i >= xData.length) continue;
        const wx = xData[i] + refX;
        const d = Math.abs(wx - sMouseWorld.x);
        if (d < bestDist) {
          bestDist = d;
          bestXWorld = wx;
          bestSeriesXConf = sXConf;
        }
      }
    });

    if (bestXWorld === null || !bestSeriesXConf || bestDist > xSnapWorld) return null;
    const finalBestXWorld = bestXWorld as number;
    const finalXConf = bestSeriesXConf as XAxisConfig;

    // Pre-calculate axis titles to avoid O(N^2) filtering in the loop
    const seriesByAxis: Record<string, string[]> = {};
    seriesMetadata.forEach(({ series: sr }) => {
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
    const entries: { label: string, value: number, color: string, xLabel: string }[] = [];
    seriesMetadata.forEach(({ series: s, axis, xCol, yCol }) => {
      const sXConf = xAxes.find(a => a.id === s.xAxisId);
      if (!sXConf) return;

      const xData = xCol.data, yData = yCol.data;
      const refX = xCol.refPoint, refY = yCol.refPoint;

      // Find closest index to its own X world pos matching the mouse screen pos
      const sVp = { xMin: sXConf.min, xMax: sXConf.max, yMin: 0, yMax: 100, width, height, padding };
      const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);

      let lo = 0, hi = xData.length - 1;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1; else hi = mid;
      }
      let bestI = lo;
      if (lo > 0 && Math.abs(xData[lo-1]+refX-sMouseWorld.x) < Math.abs(xData[lo]+refX-sMouseWorld.x)) bestI = lo-1;

      const yVal = yData[bestI] + refY;
      const xVal = xData[bestI] + refX;
      const axisTitle = axisTitleMap[axis.id] || '';
      const label = s.name || s.yColumn;
      const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;

      const xLab = sXConf.xMode === 'date'
        ? formatFullDate(xVal)
        : parseFloat(xVal.toPrecision(7)).toString();

      entries.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333', xLabel: xLab });
    });

    // Screen position of the snapped point
    const snapScreenX = worldToScreen(finalBestXWorld, 0, { xMin: finalXConf.min, xMax: finalXConf.max, yMin: 0, yMax: 100, width, height, padding }).x;

    return { snapScreenX, entries };
  }, [pos, seriesMetadata, yAxes, xAxes, width, height, padding]);

  if (!pos) return null;
  if (!snap) return null; // Only show when near a point

  const { snapScreenX, entries } = snap;
  const maxExpectedHeight = 30 + entries.length * 24;
  const isTooltipOnRight = pos.x + 320 + 20 < width; 
  const isTooltipBelow = pos.y + maxExpectedHeight + 20 < height;

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
        lineHeight: '1.2',
        maxWidth: 320
      }}>
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto minmax(auto, 1fr) auto auto', columnGap: '4px', rowGap: '4px' }}>
            {entries.map((e, i: number) => {
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
                  <div style={{ color: e.color, textAlign: 'right', gridColumn: '1 / span 4', fontSize: '8px', borderBottom: '1px solid rgba(0,0,0,0.04)' }}>X: {e.xLabel}</div>
                  <div style={{ color: e.color, textAlign: 'right' }}>{e.label}:</div>
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
  const { series, xAxes, yAxes, isLoaded, lastAppliedViewId, datasets } = useGraphStore();
  
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const hoveredAxisIdRef = useRef<string | null>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  
  const targetXAxes = useRef<Record<string, { min: number, max: number }>>({});
  const targetYs = useRef<Record<string, { min: number, max: number }>>({});
  const wasEmptyRef = useRef(true);
  const isAnimating = useRef(false);
  const isPanningRef = useRef(false);

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = isPanningRef.current ? 1 : 0.4;
      const keys = pressedKeys.current;
      let needsNextFrame = false;
      if (keys.has('+') || keys.has('=') || keys.has('-') || keys.has('_')) {
        const isCtrl = keys.has('Control'), zoomFactor = (keys.has('+') || keys.has('=')) ? 0.85 : 1.15;
        state.xAxes.forEach(axis => {
          const t = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
          const xRange = t.max - t.min, newXRange = xRange * zoomFactor;
          targetXAxes.current[axis.id] = { min: t.min + (xRange - newXRange) / 2, max: t.max - (xRange - newXRange) / 2 };
        });
        if (!isCtrl) {
          state.yAxes.forEach(axis => {
            const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
            const yRange = t.max - t.min, newYRange = yRange * zoomFactor;
            targetYs.current[axis.id] = { min: t.min + (yRange - newYRange) / 2, max: t.max - (yRange - newYRange) / 2 };
          });
        }
        needsNextFrame = true;
      }
      state.xAxes.forEach(axis => {
        const target = targetXAxes.current[axis.id]; if (!target) return;
        const xRange = Math.abs(axis.max - axis.min), xEps = xRange * 0.0001 || 0.0001;
        const nextXMin = lerp(axis.min, target.min, factor), nextXMax = lerp(axis.max, target.max, factor);
        if (Math.abs(nextXMin - axis.min) > xEps || Math.abs(nextXMax - axis.max) > xEps) {
          state.updateXAxis(axis.id, { min: nextXMin, max: nextXMax }); needsNextFrame = true;
        } else if (axis.min !== target.min || axis.max !== target.max) {
          state.updateXAxis(axis.id, { min: target.min, max: target.max });
        }
      });
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
      // If datasets are already present from persistence, don't auto-scale on load
      if (useGraphStore.getState().datasets.length > 0) wasEmptyRef.current = false;
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded]);

  // Handle View Snapshots Lerp
  useEffect(() => {
    if (!lastAppliedViewId) return;
    const view = useGraphStore.getState().views.find(v => v.id === lastAppliedViewId.id);
    if (!view) return;
    view.xAxes.forEach(axis => {
      targetXAxes.current[axis.id] = { min: axis.min, max: axis.max };
    });
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

  const activeXAxesUsed = useMemo(() => {
    // Mapping: which datasets use which X axes?
    // This is a bit complex. The prompt says "the order of data sources ... should define the order in which the x-axes are drawn".
    // Let's find unique xAxisIds and associate each with the minimum dataset index that uses it.
    const axisToMinDsIdx = new Map<string, number>();
    series.forEach(s => {
      const dsIdx = datasets.findIndex(d => d.id === s.sourceId);
      const xId = s.xAxisId || 'axis-1';
      if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) {
        axisToMinDsIdx.set(xId, dsIdx);
      }
    });

    return xAxes
      .filter(a => axisToMinDsIdx.has(a.id))
      .sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);
  const padding = useMemo(() => {
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const bottomExtra = Math.max(0, (activeXAxesUsed.length - 1) * 40);
    return { ...BASE_PADDING, left: BASE_PADDING.left + leftSum, right: BASE_PADDING.right + rightSum, bottom: BASE_PADDING.bottom + bottomExtra };
  }, [leftAxes, rightAxes, axisLayout, activeXAxesUsed]);

  const chartWidth = Math.max(0, width - padding.left - padding.right), chartHeight = Math.max(0, height - padding.top - padding.bottom);

  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    if (state.series.length === 0 && state.datasets.length === 0) {
      wasEmptyRef.current = true;
      return;
    }

    // Check if we should skip the initial auto-scale because we loaded state
    const firstX = state.xAxes[0];
    const isDefaultViewport = firstX.min === 0 && firstX.max === 100;
    if (wasEmptyRef.current && !isDefaultViewport) {
       wasEmptyRef.current = false;
    }

    // AGGRESSIVE AUTO-SCALE: If current viewport is way off data bounds, reset it.
    let shouldReset = wasEmptyRef.current;
    if (!shouldReset && state.datasets.length > 0) {
       // Check if ANY dataset is visible in its assigned X range
       let anyDataVisible = false;
       state.series.forEach(s => {
         const ds = state.datasets.find(d => d.id === s.sourceId);
         const xAxis = state.xAxes.find(a => a.id === (s.xAxisId || 'axis-1'));
         if (!ds || !xAxis) return;

         const xIdx = ds.columns.indexOf(s.xColumn);
         const xCol = ds.data[xIdx];
         
         if (xCol && xCol.bounds) {
           const overlap = Math.max(0, Math.min(xAxis.max, xCol.bounds.max) - Math.max(xAxis.min, xCol.bounds.min));
           if (overlap > 0 || (xAxis.min >= xCol.bounds.min && xAxis.max <= xCol.bounds.max)) {
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
      
      const xBounds = new Map<string, { min: number, max: number }>();
      state.series.forEach(s => {
        const ds = state.datasets.find(d => d.id === s.sourceId);
        if (!ds) return;
        const xIdx = ds.columns.indexOf(s.xColumn);
        const col = ds.data[xIdx];
        if (!col || !col.bounds) return;
        const xId = s.xAxisId || 'axis-1';
        const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity };
        xBounds.set(xId, { min: Math.min(cur.min, col.bounds.min), max: Math.max(cur.max, col.bounds.max) });
      });

      xBounds.forEach((bounds, id) => {
        if (bounds.min !== Infinity) {
          const range = bounds.max - bounds.min || 1;
          const pad = range * 0.05;
          const nextX = { min: bounds.min - pad, max: bounds.max + pad };
          targetXAxes.current[id] = nextX;
          state.updateXAxis(id, nextX);
        }
      });
      startAnimation();
      
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
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseX = rect ? e.clientX - rect.left : width / 2;
      const axesToZoom = target === 'all' ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (target as {xAxisId: string}).xAxisId)!];

      axesToZoom.forEach(axis => {
        if (!axis) return;
        const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
        const worldMouse = screenToWorld(mouseX, 0, vp);
        const currentX = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
        const xRange = currentX.max - currentX.min, newXRange = xRange * zoomFactor;
        const weight = (mouseX - padding.left) / chartWidth;
        targetXAxes.current[axis.id] = { min: worldMouse.x - weight * newXRange, max: worldMouse.x + (1 - weight) * newXRange };
      });
    }
    if (target === 'all' || typeof target === 'object') {
      const rect = containerRef.current?.getBoundingClientRect();
      const mouseY = rect ? e.clientY - rect.top : height / 2;
      const axesToZoom = target === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (target as {yAxisId: string}).yAxisId)!];
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

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
    const state = useGraphStore.getState();
    const axisSeries = state.series.filter(s => s.yAxisId === axisId); if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;
    
    const datasetsById = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsById.set(d.id, d));

    axisSeries.forEach(s => {
      const ds = datasetsById.get(s.sourceId); if (!ds) return;
      const xAxis = state.xAxes.find(a => a.id === (s.xAxisId || 'axis-1'));
      if (!xAxis) return;
      
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
      if (!colX || !colY || !colX.data || !colY.data) return;

      const xData = colX.data;
      const yData = colY.data;
      const refX = colX.refPoint;
      const refY = colY.refPoint;
      
      // Binary search for visible range indices
      let startIdx = 0;
      let endIdx = xData.length - 1;
      
      // Find first index where xData[i] + refX >= xAxis.min
      let low = 0, high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + refX >= xAxis.min) { startIdx = mid; high = mid - 1; }
        else { low = mid + 1; }
      }
      
      // Find last index where xData[i] + refX <= xAxis.max
      low = 0; high = xData.length - 1;
      while (low <= high) {
        const mid = (low + high) >>> 1;
        if (xData[mid] + refX <= xAxis.max) { endIdx = mid; low = mid + 1; }
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
      
      if (mouseY !== undefined) {
        if (mouseY < padding.top + chartHeight / 3) {
          // UPPER third click -> Show data in UPPER half of screen (extend min downwards)
          nextMin = yMin - range - pad;
          nextMax = yMax + pad; 
        } else if (mouseY > padding.top + 2 * chartHeight / 3) {
          // LOWER third click -> Show data in LOWER half of screen (extend max upwards)
          nextMin = yMin - pad; 
          nextMax = yMax + range + pad;
        } else {
          // MIDDLE third click -> Full scale
          nextMin = yMin - pad;
          nextMax = yMax + pad;
        }
      } else {
        nextMin = yMin - pad; 
        nextMax = yMax + pad;
      }
      targetYs.current[axisId] = { min: nextMin, max: nextMax }; startAnimation();
    }
  }, [xAxes, padding.top, chartHeight, startAnimation]);

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

  const handleAutoScaleX = useCallback((xAxisId?: string) => {
    const state = useGraphStore.getState();
    if (state.datasets.length === 0) return;

    const axesToScale = xAxisId ? [xAxisId] : activeXAxesUsed.map(a => a.id);

    axesToScale.forEach(id => {
      const axisSeries = state.series.filter(s => (s.xAxisId || 'axis-1') === id);
      if (axisSeries.length === 0) return;

      let xMin = Infinity, xMax = -Infinity;
      axisSeries.forEach(s => {
        const ds = state.datasets.find(d => d.id === s.sourceId);
        if (!ds) return;
        const xIdx = ds.columns.indexOf(s.xColumn);
        const col = ds.data[xIdx];
        if (col && col.bounds) {
          if (col.bounds.min < xMin) xMin = col.bounds.min;
          if (col.bounds.max > xMax) xMax = col.bounds.max;
        }
      });

      if (xMin !== Infinity) {
        const pad = (xMax - xMin || 1) * 0.05;
        targetXAxes.current[id] = { min: xMin - pad, max: xMax + pad };
      }
    });
    startAnimation();
  }, [startAnimation, activeXAxesUsed]);

  const handleMouseDown = (e: React.MouseEvent, target: PanTarget = 'all') => {
    if (e.ctrlKey && target === 'all' && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left, y = e.clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const initialBox = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = initialBox; setZoomBoxState(initialBox);
      }
    } else { isPanningRef.current = true; setPanTarget(target); lastMousePos.current = { x: e.clientX, y: e.clientY }; }
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

    if (panTarget === 'all' || (typeof panTarget === 'object' && 'xAxisId' in panTarget)) {
      const axesToPan = panTarget === 'all' ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (panTarget as {xAxisId: string}).xAxisId)!];
      axesToPan.forEach(axis => {
        if (!axis) return;
        const xRange = axis.max - axis.min, xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
        const nextX = { min: axis.min - xMove, max: axis.max - xMove };
        state.updateXAxis(axis.id, nextX); targetXAxes.current[axis.id] = nextX;
      });
    }
    const draggedAxisId = typeof panTarget === 'object' && 'yAxisId' in panTarget ? panTarget.yAxisId : null;
    const axesToPan = panTarget === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === draggedAxisId)!];
    const SNAP_THRESHOLD = 15;

    // Snap targets: screen-Y positions of y=0 on every OTHER visible axis
    const snapTargets: number[] = [];
    if (!e.altKey && draggedAxisId && chartHeight > 0) {
      state.yAxes.forEach(otherAxis => {
        if (otherAxis.id === draggedAxisId) return;
        if (otherAxis.min > 0 || otherAxis.max < 0) return; // 0 not in range
        const screenYZero = padding.top + (1 - (0 - otherAxis.min) / (otherAxis.max - otherAxis.min)) * chartHeight;
        snapTargets.push(screenYZero);
      });
    }

    axesToPan.forEach(axis => {
      if (!axis) return;
      const curAxis = state.yAxes.find(a => a.id === axis.id)!;
      const yRange = curAxis.max - curAxis.min;
      const yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
      let nextMin = curAxis.min + yMove;
      let nextMax = curAxis.max + yMove;

      // Snapping Logic - only when dragging a SINGLE axis and ALT is not held
      if (snapTargets.length > 0 && chartHeight > 0) {
        const nextYRange = nextMax - nextMin;
        const screenYZero = padding.top + (1 - (0 - nextMin) / nextYRange) * chartHeight;

        let bestTarget = null;
        let bestDist = SNAP_THRESHOLD;
        for (const target of snapTargets) {
          const d = Math.abs(screenYZero - target);
          if (d < bestDist) { bestDist = d; bestTarget = target; }
        }

        if (bestTarget !== null) {
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
          activeXAxesUsed.forEach(axis => {
            const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
            const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp);
            targetXAxes.current[axis.id] = { min: w1.x, max: w2.x };
          });
          activeYAxes.forEach(axis => {
             const mainXConf = activeXAxesUsed[0] || xAxes[0];
             const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding };
             const a1 = screenToWorld(minX, maxY, axisVp), a2 = screenToWorld(maxX, minY, axisVp);
             targetYs.current[axis.id] = { min: a1.y, max: a2.y };  
          });
          startAnimation();
        }
      }
      isPanningRef.current = false;
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
        activeXAxesUsed.forEach(axis => {
          const t = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min;
          targetXAxes.current[axis.id] = { min: t.min - range * step, max: t.max - range * step };
        });
        startAnimation();
      } else if (e.key === 'ArrowRight') {
        activeXAxesUsed.forEach(axis => {
          const t = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min;
          targetXAxes.current[axis.id] = { min: t.min + range * step, max: t.max + range * step };
        });
        startAnimation();
      } else if (e.key === 'ArrowUp') {
        const onAxis = !!hoveredAxisIdRef.current;
        const axesToMove = onAxis ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
        const dir = onAxis ? -1 : 1;
        axesToMove.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min; targetYs.current[axis.id] = { min: t.min + dir * range * step, max: t.max + dir * range * step };
        }); startAnimation();
      } else if (e.key === 'ArrowDown') {
        const onAxis = !!hoveredAxisIdRef.current;
        const axesToMove = onAxis ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
        const dir = onAxis ? -1 : 1;
        axesToMove.forEach(axis => {
          const t = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min; targetYs.current[axis.id] = { min: t.min - dir * range * step, max: t.max - dir * range * step };
        }); startAnimation();
      } else if (pressedKeys.current.has('+') || pressedKeys.current.has('-')) startAnimation();
    };
    const handleKeyUp = (e: KeyboardEvent) => { if (e.key === 'Control') setIsCtrlPressed(false); pressedKeys.current.delete(e.key); };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [activeYAxes, startAnimation]);

  const xAxesLayout = useMemo(() => {
    return activeXAxesUsed.map(axis => {
      const range = axis.max - axis.min;
      const isXDate = axis.xMode === 'date';
      const seriesForThisAxis = series.filter(s => (s.xAxisId || 'axis-1') === axis.id);
      const title = Array.from(new Set(seriesForThisAxis.map(s => s.xColumn))).join(' / ');
      const color = seriesForThisAxis[0]?.lineColor || '#333';

      if (range <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      if (!isXDate) {
        const maxTicks = Math.max(2, Math.floor(chartWidth / 60));
        let step = range / maxTicks;
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
        step = finalStep * magnitude;
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = Math.max(0, -Math.floor(Math.log10(step)));
        const firstTick = Math.ceil(axis.min / step) * step, result: number[] = [];
        for (let t = firstTick; t <= axis.max; t += step) { if (result.length > 100) break; result.push(t); }
        return { id: axis.id, ticks: { result, step, precision, isXDate: false as const }, title, color };
      } else {
        const timeStep = getTimeStep(range, Math.max(2, Math.floor(chartWidth / 80)));
        const ticks = generateTimeTicks(axis.min, axis.max, timeStep);
        const secondaryLabels = generateSecondaryLabels(axis.min, axis.max, timeStep);
        return { id: axis.id, ticks: { result: ticks, isXDate: true as const, secondaryLabels }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series]);

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : 'crosshair'), backgroundColor: '#fff', overflow: 'hidden' }}>
      {useGraphStore.getState().datasets.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>No data</div>}
      <GridLines xAxes={xAxesLayout} yAxes={activeYAxes} width={width} height={height} padding={padding} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={useGraphStore.getState().datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} />
      </div>
      <AxesLayer xAxes={xAxesLayout} yAxes={activeYAxes} width={width} height={height} padding={padding} leftAxes={leftAxes} rightAxes={rightAxes} series={series} axisLayout={axisLayout} allXAxes={xAxes} />

      {activeXAxesUsed.map((axis, idx) => {
        const baseY = idx * 40;
        return <div key={`wheel-x-${axis.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { xAxisId: axis.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { xAxisId: axis.id }); }} onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleX(axis.id); }} style={{ position: 'absolute', bottom: baseY, left: padding.left, right: padding.right, height: 40, cursor: 'ew-resize', zIndex: 20 }} />;
      })}

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
        return <div key={`wheel-${axis.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: axis.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: axis.id }); }} onDoubleClick={(e) => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); const mouseY = rect ? e.clientY - rect.top : undefined; handleAutoScaleY(axis.id, mouseY); }} style={{ position: 'absolute', left: xPos, top: padding.top, width: axisMetrics.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} xAxes={xAxes} yAxes={activeYAxes} datasets={useGraphStore.getState().datasets} series={series} />
      {zoomBoxState && <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
    </main>
  );
};

export default ChartContainer;
