import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { applyKeyboardZoom, animateXAxes, animateYAxes } from '../../utils/animation';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { WebGLRenderer } from './WebGLRenderer';
import { useGraphStore } from '../../store/useGraphStore';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels, formatFullDate, type TimeTick, type SecondaryLabel } from '../../utils/time';
import { getColumnIndex } from '../../utils/columns';

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };
const BASE_PADDING_MOBILE = { top: 10, right: 10, bottom: 40, left: 10 };

type XTicks =
  | { result: number[]; step: number; precision: number; isXDate: false; secondaryLabels?: undefined }
  | { result: TimeTick[]; isXDate: true; secondaryLabels: SecondaryLabel[]; step?: undefined; precision?: undefined }

interface XAxisLayout {
  id: string;
  ticks: XTicks;
  title: string;
  color: string;
}

interface YAxisLayout extends YAxisConfig {
  ticks: number[];
  precision: number;
  actualStep: number;
}


interface GridLinesProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisLayout[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
}

interface XAxisMetrics {
  id: string;
  height: number;
  labelBottom: number;
  secLabelBottom: number;
  titleBottom: number;
  cumulativeOffset: number;
}

interface AxesLayerProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisLayout[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  leftAxes: YAxisLayout[];
  rightAxes: YAxisLayout[];
  series: SeriesConfig[];
  axisLayout: Record<string, { total: number; label: number }>;
  allXAxes: XAxisConfig[];
  xAxesMetrics: XAxisMetrics[];
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

const getXAxisMetrics = (isMobile: boolean, xMode: 'date' | 'numeric') => {
  if (xMode === 'date') {
    return {
      height: isMobile ? 50 : 60,
      labelBottom: isMobile ? 18 : 22,
      secLabelBottom: isMobile ? 32 : 38,
      titleBottom: isMobile ? 44 : 52
    };
  }
  return {
    height: isMobile ? 40 : 40,
    labelBottom: isMobile ? 18 : 18,
    secLabelBottom: 0,
    titleBottom: isMobile ? 32 : 32
  };
};

const GridLines = React.memo(({ xAxes, yAxes, width, height, padding }: GridLinesProps) => {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {xAxes.length > 0 && (() => {
        const axis = xAxes[0];
        const state = useGraphStore.getState();
        const conf = state.xAxes.find(a => a.id === axis.id);
        if (!conf) return null;
        const vp = { xMin: conf.min, xMax: conf.max, yMin: 0, yMax: 100, width, height, padding };
        return axis.ticks.result.map((t: number | TimeTick) => {
          const timestamp = typeof t === 'number' ? t : t.timestamp;
          const { x } = worldToScreen(timestamp, 0, vp);
          if (x < padding.left || x > width - padding.right) return null;
          return <line key={`gx-${timestamp}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke="#f1f5f9" strokeWidth="1" />;
        });
      })()}
      {yAxes.map((axis) => {
        if (!axis.showGrid || height <= padding.top + padding.bottom) return null;
        const mainXConf = useGraphStore.getState().xAxes[0];
        return axis.ticks.map(t => {
          const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
          if (y < padding.top || y > height - padding.bottom) return null;
          return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke="#f1f5f9" strokeWidth="1" />;
        });
      })}
    </svg>
  );
});

const AxesLayer = React.memo(({ xAxes, yAxes, width, height, padding, leftAxes, rightAxes, series, axisLayout, allXAxes, xAxesMetrics }: AxesLayerProps) => {
  const isMobile = width < 768 || height < 500;

  // ⚡ Bolt Optimization: Hoist invariant variable lookups out of inner map loops
  const mainXConf = useMemo(() => allXAxes.find(a => a.id === (xAxes[0]?.id || 'axis-1'))!, [allXAxes, xAxes]);

  const allXAxesById = useMemo(() => {
    const map = new Map<string, typeof allXAxes[0]>();
    allXAxes.forEach(a => map.set(a.id, a));
    return map;
  }, [allXAxes]);

  const seriesByYAxisId = useMemo(() => {
    const grouped: Record<string, SeriesConfig[]> = {};
    for (let i = 0; i < series.length; i++) {
      const s = series[i];
      if (!grouped[s.yAxisId]) grouped[s.yAxisId] = [];
      grouped[s.yAxisId].push(s);
    }
    return grouped;
  }, [series]);

  // ⚡ Bolt Optimization: Pre-calculate cumulative offsets to avoid O(N^2) loops inside mapping
  const { leftOffsets, rightOffsets } = useMemo(() => {
    const leftOffsets: Record<string, number> = {};
    let currentLeftOffset = 0;
    for (let i = 0; i < leftAxes.length; i++) {
      leftOffsets[leftAxes[i].id] = currentLeftOffset;
      currentLeftOffset += axisLayout[leftAxes[i].id]?.total || 40;
    }
    const rightOffsets: Record<string, number> = {};
    let currentRightOffset = 0;
    for (let i = 0; i < rightAxes.length; i++) {
      rightOffsets[rightAxes[i].id] = currentRightOffset;
      currentRightOffset += axisLayout[rightAxes[i].id]?.total || 40;
    }
    return { leftOffsets, rightOffsets };
  }, [leftAxes, rightAxes, axisLayout]);

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#475569" />
          </marker>
        </defs>
        
        {/* Main Chart Border (no bottom) */}
        <path 
          d={`M${padding.left},${height - padding.bottom} V${padding.top} H${width - padding.right} V${height - padding.bottom}`} 
          fill="none" 
          stroke="#475569"
          strokeWidth="2" 
        />
        
        {xAxes.map((axis, idx) => {
          const axisConf = mainXConf.id === axis.id ? mainXConf : allXAxesById.get(axis.id)!;
          const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
          const metrics = xAxesMetrics[idx];
          const y = height - padding.bottom + metrics.cumulativeOffset;

          return (
            <g key={`x-axis-spine-${axis.id}`}>
              {/* Spine */}
              <line
                x1={padding.left}
                y1={y}
                x2={width - padding.right + 8}
                y2={y}
                stroke="#475569"
                strokeWidth="1"
                markerEnd="url(#arrow)"
              />

              {/* Ticks */}
              {axis.ticks.result.map((t: number | TimeTick) => {
                const { x } = worldToScreen(typeof t === 'number' ? t : t.timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                return <line key={`xt-${axis.id}-${typeof t === 'number' ? t : t.timestamp}`} x1={x} y1={y} x2={x} y2={y + 6} stroke="#475569" strokeWidth="1" />;
              })}

              {/* 0 line if visible */}
              {axisConf.min <= 0 && axisConf.max >= 0 && idx === 0 && (
                <line
                  x1={worldToScreen(0, 0, vp).x}
                  y1={height - padding.bottom}
                  x2={worldToScreen(0, 0, vp).x}
                  y2={padding.top - 8}
                  stroke="#94a3b8"
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
          const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
          if (mainAxis.min <= 0 && mainAxis.max >= 0) {
            return (
              <line 
                x1={padding.left} 
                y1={worldToScreen(mainXConf.min, 0, axisVp).y}
                x2={width - padding.right + 8} 
                y2={worldToScreen(mainXConf.min, 0, axisVp).y}
                stroke="#94a3b8"
                strokeWidth="1" 
                strokeDasharray="4 4"
                markerEnd="url(#arrow)" 
              />
            );
          }
          return null;
        })()}
        {yAxes.map((axis) => {
          const isLeft = axis.position === 'left';
          const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
          let xPos = 0;
          if (isLeft) {
            const offset = leftOffsets[axis.id] ?? 0;
            xPos = padding.left - offset - axisMetrics.total;
          } else {
            const offset = rightOffsets[axis.id] ?? 0;
            xPos = width - padding.right + offset;
          }
          const axisLineX = isLeft ? xPos + axisMetrics.total : xPos;
          const range = axis.max - axis.min;
          const chartHeight = Math.max(0, height - padding.top - padding.bottom);
          if (range <= 0 || chartHeight <= 0) return null;

          return (
            <g key={axis.id}>
              {/* Spine with Arrow */}
              <line 
                x1={axisLineX} 
                y1={height - padding.bottom} 
                x2={axisLineX} 
                y2={padding.top - 8} 
                stroke="#475569"
                strokeWidth="1" 
                markerEnd="url(#arrow)"
              />
              {axis.ticks.map(t => {
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
                if (y < padding.top || y > height - padding.bottom) return null;
                const x1 = isLeft ? axisLineX - 5 : axisLineX;
                const x2 = isLeft ? axisLineX : axisLineX + 5;
                return <line key={`yt-${axis.id}-${t}`} x1={x1} y1={y} x2={x2} y2={y} stroke="#475569" strokeWidth="1" />;
              })}
            </g>
          );
        })}
      </svg>
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 7 }}>
        {xAxes.map((axis, axisIdx) => {
          const axisConf = mainXConf.id === axis.id ? mainXConf : allXAxesById.get(axis.id)!;
          const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
          const metrics = xAxesMetrics[axisIdx];
          const baseY = padding.bottom - metrics.cumulativeOffset;
          
          return (
            <React.Fragment key={`x-labels-${axis.id}`}>
              {axis.ticks.secondaryLabels && axis.ticks.secondaryLabels.map((sl: SecondaryLabel, idx: number) => {
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
                      bottom: baseY - metrics.secLabelBottom,
                      fontSize: isMobile ? '10px' : '10px',
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
              {axis.ticks.result.map((t: number | TimeTick) => {
                const timestamp = typeof t === 'number' ? t : t.timestamp;
                const { x } = worldToScreen(timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : t.label;
                return <div key={`xl-${axis.id}-${timestamp}`} style={{ position: 'absolute', left: x, bottom: baseY - metrics.labelBottom, transform: 'translateX(-50%)', fontSize: isMobile ? '10px' : '9px', color: axis.color }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', bottom: baseY - metrics.titleBottom, left: padding.left + (width - padding.left - padding.right) / 2, transform: 'translateX(-50%)', fontSize: isMobile ? '10px' : '10px', fontWeight: 'bold', color: axis.color, whiteSpace: 'nowrap', maxWidth: width - padding.left - padding.right, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {axis.title}
              </div>
            </React.Fragment>
          );
        })}
        {yAxes.map((axis) => {
          const isLeft = axis.position === 'left';
          const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
          let xPos = 0;
          if (isLeft) {
            const offset = leftOffsets[axis.id] ?? 0;
            xPos = padding.left - offset - axisMetrics.total;
          } else {
            const offset = rightOffsets[axis.id] ?? 0;
            xPos = width - padding.right + offset;
          }
          const range = axis.max - axis.min;
          const chartHeight = Math.max(0, height - padding.top - padding.bottom);
          if (range <= 0 || chartHeight <= 0) return null;

          const axisSeries = seriesByYAxisId[axis.id] || [], title = axisSeries.map((s: SeriesConfig) => s.name || s.yColumn).join(' / ');
          const spineX = isLeft ? xPos + axisMetrics.total : xPos;
          const labelX = isLeft ? spineX - 7 - axisMetrics.label : spineX + 7;
          const titleX = isLeft ? xPos + 7.5 : xPos + axisMetrics.total - 7.5;

          return (
            <React.Fragment key={axis.id}>
              {axis.ticks.map(t => {
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
                if (y < padding.top || y > height - padding.bottom) return null;
                const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.precision);
                return <div key={`yl-${axis.id}-${t}`} style={{ position: 'absolute', left: labelX, top: y, transform: 'translateY(-50%)', fontSize: isMobile ? '10px' : '9px', color: '#475569', width: axisMetrics.label, textAlign: isLeft ? 'right' : 'left' }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', top: padding.top + chartHeight / 2, left: titleX, transform: `translate(-50%, -50%) rotate(${isLeft ? -90 : 90}deg)`, fontSize: isMobile ? '14px' : '12px', fontWeight: 'bold', color: axisSeries[0]?.lineColor || '#475569', padding: '2px 4px', borderRadius: '2px', whiteSpace: 'nowrap', textAlign: 'center', maxWidth: chartHeight, overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
});

const SNAP_PX = 30; // pixel radius for snapping to a point

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, xAxes, yAxes, datasets, series }: CrosshairProps) => {
  const isMobile = width < 768 || height < 500;
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null);
  useEffect(() => {
    const el = containerRef.current; if (!el) return;
    const handleMove = (e: MouseEvent | TouchEvent) => {
      if (isPanning) { setPos(null); return; }
      const rect = el.getBoundingClientRect();
      let clientX, clientY;
      if ('touches' in e) {
        if (e.touches.length !== 1) { setPos(null); return; }
        clientX = e.touches[0].clientX;
        clientY = e.touches[0].clientY;
      } else {
        clientX = e.clientX;
        clientY = e.clientY;
      }
      const x = clientX - rect.left, y = clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        setPos({ x, y });
      } else {
        setPos(null);
      }
    };
    const handleLeave = () => setPos(null);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchstart', handleMove);
    window.addEventListener('touchmove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('touchstart', handleMove);
      window.removeEventListener('touchmove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [containerRef, padding, width, height, isPanning]);

  // ⚡ Bolt Optimization: Pre-calculate series metadata to avoid O(N) array/string operations inside the high-frequency mouse move `snap` calculation
  const seriesMetadata = useMemo(() => {
    const datasetsById = new Map<string, Dataset>();
    datasets.forEach(d => datasetsById.set(d.id, d));

    const yAxesById = new Map<string, YAxisConfig>();
    yAxes.forEach(a => yAxesById.set(a.id, a));

    const xAxesById = new Map<string, XAxisConfig>();
    xAxes.forEach(a => xAxesById.set(a.id, a));

    return series.map(s => {
      const ds = datasetsById.get(s.sourceId);
      const axis = yAxesById.get(s.yAxisId);
      const xAxis = xAxesById.get(ds?.xAxisId || 'axis-1');
      if (!ds || !axis || !xAxis) return null;

      const xIdx = getColumnIndex(ds, ds.xAxisColumn);
      const yIdx = getColumnIndex(ds, s.yColumn);

      if (xIdx === -1 || yIdx === -1) return null;

      const xCol = ds.data[xIdx];
      const yCol = ds.data[yIdx];

      if (!xCol?.data || !yCol?.data) return null;

      return { series: s, ds, axis, xAxis, xIdx, yIdx, xCol, yCol };
    }).filter(Boolean) as { series: SeriesConfig, ds: Dataset, axis: YAxisConfig, xAxis: XAxisConfig, xIdx: number, yIdx: number, xCol: { data: Float32Array, refPoint: number, bounds: {min: number, max: number} }, yCol: { data: Float32Array, refPoint: number, bounds: {min: number, max: number} } }[];
  }, [datasets, series, yAxes, xAxes]);

  // ⚡ Bolt Optimization: Extract static crosshair layout dependencies out of the high-frequency mouse loop
  const snapMetadata = useMemo(() => {
    if (seriesMetadata.length === 0) return null;

    const firstDataset = datasets.find(d => series.some(s => s.sourceId === d.id));
    const firstUsedXAxisId = firstDataset?.xAxisId || 'axis-1';
    const xAxisConf = xAxes.find(a => a.id === firstUsedXAxisId);

    if (!xAxisConf) return null;

    const seriesByAxis: Record<string, string[]> = {};
    seriesMetadata.forEach(({ series: sr }) => {
      if (!seriesByAxis[sr.yAxisId]) seriesByAxis[sr.yAxisId] = [];
      seriesByAxis[sr.yAxisId].push(sr.name || sr.yColumn);
    });

    const axisTitleMap: Record<string, string> = {};
    yAxes.forEach((axis: YAxisConfig) => {
      if (seriesByAxis[axis.id]) {
        axisTitleMap[axis.id] = seriesByAxis[axis.id].join('/');
      }
    });

    return { xAxisConf, axisTitleMap };
  }, [datasets, series, xAxes, yAxes, seriesMetadata]);

  const snap = useMemo(() => {
    if (!pos || !snapMetadata || seriesMetadata.length === 0) return null;

    const { xAxisConf, axisTitleMap } = snapMetadata;

    // Convert SNAP_PX radius to world-x distance
    const xWorldPerPx = (xAxisConf.max - xAxisConf.min) / Math.max(1, width - padding.left - padding.right);
    const xSnapWorld = SNAP_PX * xWorldPerPx;

    // Find the nearest X point across all series
    let bestDist = Infinity;
    let bestXWorld: number | null = null;
    let bestSeriesXConf: XAxisConfig | null = null;

    // Cache the closest index for each dataset to avoid repeating binary search for multiple series on the same dataset
    const closestIdxByDataset = new Map<string, number>();

    seriesMetadata.forEach(({ ds, xAxis, xCol }) => {
      let cachedIdx = closestIdxByDataset.get(ds.id);

      const xData = xCol.data;
      const refX = xCol.refPoint;

      if (cachedIdx === undefined) {
        const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
        const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);

        // Binary search for the closest point
        let lo = 0, hi = xData.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1; else hi = mid;
        }

        let bestI = lo;
        if (lo > 0 && Math.abs(xData[lo-1]+refX-sMouseWorld.x) < Math.abs(xData[lo]+refX-sMouseWorld.x)) bestI = lo-1;
        cachedIdx = bestI;
        closestIdxByDataset.set(ds.id, cachedIdx);
      }

      const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
      const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);

      for (const i of [cachedIdx - 1, cachedIdx, cachedIdx + 1]) {
        if (i < 0 || i >= xData.length) continue;
        const wx = xData[i] + refX;
        const d = Math.abs(wx - sMouseWorld.x);

        if (d < bestDist) {
          bestDist = d;
          bestXWorld = wx;
          bestSeriesXConf = xAxis;
        }
      }
    });

    if (bestXWorld === null || !bestSeriesXConf || bestDist > xSnapWorld) return null;
    const finalBestXWorld = bestXWorld as number;
    const finalXConf = bestSeriesXConf as XAxisConfig;

    // Collect all Y values from all series at this X, grouped by X-label and X-axis name
    const entriesMap = new Map<string, { xLabel: string, xAxisName: string, items: { label: string, value: number, color: string, xVal: number, isXDate: boolean }[] }>();
    seriesMetadata.forEach(({ series: s, ds, axis, xAxis, xCol, yCol }) => {
      const xData = xCol.data, yData = yCol.data;
      const refX = xCol.refPoint, refY = yCol.refPoint;

      // Reuse the cached index from the first pass instead of repeating the binary search!
      const bestI = closestIdxByDataset.get(ds.id) as number;

      const yVal = yData[bestI] + refY;
      const xVal = xData[bestI] + refX;
      const axisTitle = axisTitleMap[axis.id] || '';
      const label = s.name || s.yColumn;
      const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;

      const xLab = xAxis.xMode === 'date'
        ? formatFullDate(xVal)
        : parseFloat(xVal.toPrecision(7)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 10 });

      const xAxisName = xAxis.name || `X-Axis ${ds.xAxisId}`;
      const groupKey = `${xLab}|${xAxisName}`;
      let group = entriesMap.get(groupKey);
      if (!group) {
        group = { xLabel: xLab, xAxisName, items: [] };
        entriesMap.set(groupKey, group);
      }
      group.items.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333', xVal, isXDate: xAxis.xMode === 'date' });
    });
    const entries = Array.from(entriesMap.values());

    // Screen position of the snapped point
    const snapScreenX = worldToScreen(finalBestXWorld, 0, { xMin: finalXConf.min, xMax: finalXConf.max, yMin: 0, yMax: 100, width, height, padding }).x;

    return { snapScreenX, entries };
  }, [pos, seriesMetadata, width, height, padding, snapMetadata]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (!snap) return;
        const text = snap.entries.map(g => {
          const itemsText = g.items.map(i => `${i.label}: ${i.value.toLocaleString('de-DE')}`).join('\n');
          return `${g.xAxisName}: ${g.xLabel}\n${itemsText}`;
        }).join('\n\n');
        navigator.clipboard.writeText(text);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snap]);

  if (!pos) return null;
  if (!snap) return null; // Only show when near a point

  const { snapScreenX, entries } = snap;
  const totalItems = entries.reduce((sum, g) => sum + g.items.length, 0);
  const maxExpectedHeight = 30 + entries.length * 18 + totalItems * 24;
  const isTooltipOnRight = pos.x + 360 + 20 < width;
  const isTooltipBelow = pos.y + maxExpectedHeight + 20 < height;

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
        <line x1={snapScreenX} y1={padding.top} x2={snapScreenX} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />
      </svg>
      <div style={{
        position: 'absolute',
        left: isTooltipOnRight ? snapScreenX + 12 : 'auto',
        right: isTooltipOnRight ? 'auto' : (width - snapScreenX) + 12,
        top: isTooltipBelow ? pos.y + 15 : 'auto',
        bottom: isTooltipBelow ? 'auto' : (height - pos.y) + 15,
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        color: '#1e293b',
        padding: isMobile ? '12px 16px' : '8px 12px',
        borderRadius: '8px',
        fontSize: isMobile ? '12px' : '10px',
        fontFamily: 'monospace',
        pointerEvents: 'none',
        zIndex: 100,
        boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
        backdropFilter: 'blur(4px)',
        border: '1px solid #e2e8f0',
        whiteSpace: 'pre',
        lineHeight: '1.2',
        maxWidth: 360,
        userSelect: 'none'
      }}>
        {entries.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: 'auto auto 1fr auto auto', columnGap: '0px', rowGap: '4px' }}>
            {entries.map((group, groupIdx) => (
              <React.Fragment key={`group-${groupIdx}`}>
                <div style={{ color: '#666', gridColumn: '1 / span 5', fontSize: isMobile ? '11px' : '9px', borderTop: groupIdx > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none', paddingTop: groupIdx > 0 ? '4px' : 0, marginTop: groupIdx > 0 ? '4px' : 0 }}>
                  <span style={{ fontWeight: 'bold', color: '#1e293b', fontSize: isMobile ? '12px' : '10px' }}>{group.xLabel}</span>
                  <span style={{ marginLeft: '8px', opacity: 0.8 }}>({group.xAxisName})</span>
                </div>
                {group.items.map((item, itemIdx) => {
                  const formatVal = (val: number) => {
                    const clean = parseFloat(val.toPrecision(7));
                    const s = clean.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 10 });
                    const decimalSeparator = (1.1).toLocaleString(undefined).substring(1, 2);
                    const sepIdx = s.indexOf(decimalSeparator);
                    return {
                      int: sepIdx !== -1 ? s.substring(0, sepIdx) : s,
                      dec: sepIdx !== -1 ? s.substring(sepIdx) : ''
                    };
                  };

                  const yParts = formatVal(item.value);

                  return (
                    <React.Fragment key={`item-${groupIdx}-${itemIdx}`}>
                      <div style={{ color: item.color, textAlign: 'left', paddingRight: '12px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', gridColumn: '1 / span 3' }}>{item.label}:</div>
                      <div style={{ color: '#333', fontWeight: 'bold', textAlign: 'right' }}>{yParts.int}</div>
                      <div style={{ color: '#333', fontWeight: 'bold', textAlign: 'left' }}>{yParts.dec}</div>
                    </React.Fragment>
                  );
                })}
              </React.Fragment>
            ))}
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
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const lastTouchPos = useRef<{ x: number, y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastTouchTime = useRef<number>(0);
  const lastMousePos = useRef<{ x: number, y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);
  const hoveredAxisIdRef = useRef<string | null>(null);
  const hoveredXAxisIdRef = useRef<string | null>(null);
  const pressedKeys = useRef<Set<string>>(new Set());
  
  const targetXAxes = useRef<Record<string, { min: number, max: number }>>({});
  const targetYs = useRef<Record<string, { min: number, max: number }>>({});
  const wasEmptyRef = useRef(true);
  const isAnimating = useRef(false);
  const isPanningRef = useRef(false);

  const lockedXSteps = useRef<Record<string, { step?: number; timeStep?: ReturnType<typeof getTimeStep> }>>({});
  const lockedYSteps = useRef<Record<string, number>>({});

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = isPanningRef.current ? 1 : 0.4;
      const keys = pressedKeys.current;

      let needsNextFrame = applyKeyboardZoom(state, keys, targetXAxes.current, targetYs.current);

      if (animateXAxes(state, targetXAxes.current, factor)) {
        needsNextFrame = true;
      }
      if (animateYAxes(state, targetYs.current, factor)) {
        needsNextFrame = true;
      }

      if (needsNextFrame) {
        requestAnimationFrame(loop);
      } else {
        isAnimating.current = false;
      }
    };
    requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (isLoaded && !isAnimating.current) {
      // If datasets are already present from persistence, don't auto-scale on load
      if (useGraphStore.getState().datasets.length > 0) wasEmptyRef.current = false;
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded, xAxes, yAxes, startAnimation]);

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

  const activeYAxesLayout = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    const isInteracting = isPanningRef.current || isAnimating.current;

    return yAxes.filter(a => usedIds.has(a.id)).map(axis => {
      const range = axis.max - axis.min;
      const chartHeight = Math.max(0, height - (width < 768 || height < 500 ? 40 : 60) - 20); // rough est
      let actualStep: number;

      if (isInteracting && lockedYSteps.current[axis.id]) {
        actualStep = lockedYSteps.current[axis.id];
      } else {
        const step = range / Math.max(2, Math.floor(chartHeight / 30));
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
        actualStep = finalStep * magnitude;
        lockedYSteps.current[axis.id] = actualStep;
      }

      if (actualStep <= 0) return { ...axis, ticks: [], precision: 0, actualStep: 1 };
      const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
      const firstTick = Math.ceil((axis.min - actualStep) / actualStep) * actualStep;
      const ticks = [];
      for (let t = firstTick; t <= axis.max + actualStep; t += actualStep) {
        if (ticks.length > 200) break;
        ticks.push(t);
      }
      return { ...axis, ticks, precision, actualStep };
    });
  }, [yAxes, series, height, width]);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const lastAxisLayout = useRef<Record<string, { total: number, label: number }>>({});
  const axisLayout = useMemo(() => {
    const isInteracting = isPanningRef.current || isAnimating.current;
    if (isInteracting && Object.keys(lastAxisLayout.current).length > 0) {
      return lastAxisLayout.current;
    }

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
    lastAxisLayout.current = layout;
    return layout;
  }, [activeYAxes, height]);


  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  // ⚡ Bolt Optimization: Pre-calculate cumulative offsets to avoid O(N^2) loops inside mapping
  const { leftOffsets, rightOffsets } = useMemo(() => {
    const leftOffsets: Record<string, number> = {};
    let currentLeftOffset = 0;
    for (let i = 0; i < leftAxes.length; i++) {
      leftOffsets[leftAxes[i].id] = currentLeftOffset;
      currentLeftOffset += axisLayout[leftAxes[i].id]?.total || 40;
    }
    const rightOffsets: Record<string, number> = {};
    let currentRightOffset = 0;
    for (let i = 0; i < rightAxes.length; i++) {
      rightOffsets[rightAxes[i].id] = currentRightOffset;
      currentRightOffset += axisLayout[rightAxes[i].id]?.total || 40;
    }
    return { leftOffsets, rightOffsets };
  }, [leftAxes, rightAxes, axisLayout]);

  const activeXAxesUsed = useMemo(() => {
    // Mapping: which datasets use which X axes?
    // This is a bit complex. The prompt says "the order of data sources ... should define the order in which the x-axes are drawn".
    // Let's find unique xAxisIds and associate each with the minimum dataset index that uses it.
    const axisToMinDsIdx = new Map<string, number>();
    datasets.forEach((d, dsIdx) => {
      // Only include datasets that have at least one series
      if (!series.some(s => s.sourceId === d.id)) return;

      const xId = d.xAxisId || 'axis-1';
      if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) {
        axisToMinDsIdx.set(xId, dsIdx);
      }
    });

    return xAxes
      .filter(a => axisToMinDsIdx.has(a.id))
      .sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);

  const isMobile = width < 768 || height < 500;

  const xAxesMetrics = useMemo(() => {
    let currentOffset = 0;
    return activeXAxesUsed.map((axis) => {
      const baseMetrics = getXAxisMetrics(isMobile, axis.xMode);
      const metrics = {
        ...baseMetrics,
        id: axis.id,
        cumulativeOffset: currentOffset
      };
      currentOffset += baseMetrics.height;
      return metrics;
    });
  }, [activeXAxesUsed, isMobile]);

  const padding = useMemo(() => {
    const base = isMobile ? BASE_PADDING_MOBILE : BASE_PADDING_DESKTOP;
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);

    let bottom = base.bottom;
    if (xAxesMetrics.length > 0) {
      bottom = xAxesMetrics.reduce((sum, m) => sum + m.height, 0);
    }

    return { ...base, left: base.left + leftSum, right: base.right + rightSum, bottom };
  }, [leftAxes, rightAxes, axisLayout, xAxesMetrics, isMobile]);

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

    // Create a map for quick dataset lookups
    const datasetsById = new Map<string, Dataset>();
    if (state.datasets.length > 0) {
      state.datasets.forEach(d => datasetsById.set(d.id, d));
    }

    if (!shouldReset && state.datasets.length > 0) {
       // Check if ANY dataset is visible in its assigned X range
       let anyDataVisible = false;
       const xAxesById = new Map<string, (typeof state.xAxes)[0]>();
       state.xAxes.forEach(a => xAxesById.set(a.id, a));

       state.series.forEach(s => {
         const ds = datasetsById.get(s.sourceId);
         const xAxis = xAxesById.get(ds?.xAxisId || 'axis-1');
         if (!ds || !xAxis) return;

         const xIdx = getColumnIndex(ds, ds.xAxisColumn);
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
        const ds = datasetsById.get(s.sourceId);
        if (!ds) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn);
        const col = ds.data[xIdx];
        if (!col || !col.bounds) return;
        const xId = ds.xAxisId || 'axis-1';
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

      const seriesByYAxisIdLocal = new Map<string, typeof state.series>();
      state.series.forEach(s => {
        if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []);
        seriesByYAxisIdLocal.get(s.yAxisId)!.push(s);
      });
      activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || [];
        if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => {
          const ds = datasetsById.get(s.sourceId); if (!ds) return;
          const yIdx = getColumnIndex(ds, s.yColumn);
          const yCol = ds.data[yIdx]; if (!yCol || !yCol.bounds) return;
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
  }, [isLoaded, startAnimation, series, yAxes, activeYAxes]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) { setWidth(entry.contentRect.width); setHeight(entry.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const performZoom = useCallback((zoomFactor: number, mouseX: number, mouseY: number, target: PanTarget = 'all', shiftKey: boolean = false) => {
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axesToZoom = (target === 'all' || shiftKey) ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (target as { xAxisId: string }).xAxisId)!];

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
    if ((target === 'all' && !shiftKey) || (typeof target === 'object' && 'yAxisId' in target)) {
      const axesToZoom = target === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (target as { yAxisId: string }).yAxisId)!];
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
  }, [activeXAxesUsed, activeYAxes, width, height, padding, chartWidth, chartHeight, startAnimation]);

  const handleWheel = (e: React.WheelEvent, target: PanTarget = 'all') => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = containerRef.current?.getBoundingClientRect();
    const mouseX = rect ? e.clientX - rect.left : width / 2;
    const mouseY = rect ? e.clientY - rect.top : height / 2;
    performZoom(zoomFactor, mouseX, mouseY, target, e.shiftKey);
  };

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
    const state = useGraphStore.getState();
    const axisSeries = [];
    for(let i=0; i<state.series.length; i++) {
      if (state.series[i].yAxisId === axisId) axisSeries.push(state.series[i]);
    }
    if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;
    
    // Create a dictionary for quick dataset lookups by id to avoid O(N^2)
    const datasetsById = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsById.set(d.id, d));
    const xAxesById = new Map<string, (typeof state.xAxes)[0]>();
    state.xAxes.forEach(a => xAxesById.set(a.id, a));

    axisSeries.forEach(s => {
      const ds = datasetsById.get(s.sourceId); if (!ds) return;
      const xAxis = xAxesById.get(ds.xAxisId || 'axis-1');
      if (!xAxis) return;
      
      const xIdx = getColumnIndex(ds, ds.xAxisColumn);
      const yIdx = getColumnIndex(ds, s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;

      const colX = ds.data[xIdx];
      const colY = ds.data[yIdx];
      if (!colX || !colY || !colX.data || !colY.data) return;

      const xData = colX.data;
      const yData = colY.data;
      const refX = colX.refPoint;
      const refY = colY.refPoint;
      
      // Binary search for visible range indices
      let startIdx = -1;
      let endIdx = -1;
      
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
      if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
        const CHUNK_SIZE = 512;
        const chunkMin = colY.chunkMin;
        const chunkMax = colY.chunkMax;

        if (chunkMin && chunkMax && (endIdx - startIdx) > CHUNK_SIZE) {
          const startChunk = Math.floor(startIdx / CHUNK_SIZE);
          const endChunk = Math.floor(endIdx / CHUNK_SIZE);

          if (startChunk === endChunk) {
            for (let i = startIdx; i <= endIdx; i++) {
              const val = yData[i] + refY;
              if (val < yMin) yMin = val;
              if (val > yMax) yMax = val;
            }
          } else {
            const firstChunkEnd = (startChunk + 1) * CHUNK_SIZE;
            for (let i = startIdx; i < firstChunkEnd; i++) {
              const val = yData[i] + refY;
              if (val < yMin) yMin = val;
              if (val > yMax) yMax = val;
            }
            for (let c = startChunk + 1; c < endChunk; c++) {
              const cMin = chunkMin[c] + refY;
              const cMax = chunkMax[c] + refY;
              if (cMin < yMin) yMin = cMin;
              if (cMax > yMax) yMax = cMax;
            }
            const lastChunkStart = endChunk * CHUNK_SIZE;
            for (let i = lastChunkStart; i <= endIdx; i++) {
              const val = yData[i] + refY;
              if (val < yMin) yMin = val;
              if (val > yMax) yMax = val;
            }
          }
        } else {
          for (let i = startIdx; i <= endIdx; i++) {
            const val = yData[i] + refY;
            if (val < yMin) yMin = val;
            if (val > yMax) yMax = val;
          }
        }
      }
    });

    if (yMin !== Infinity) {
      let nextMin = yMin, nextMax = yMax;
      const range = yMax - yMin || 1;
      const pad = range * 0.05; // 5% margin
      
      if (mouseY !== undefined) {
        if (mouseY < padding.top + chartHeight / 3) {
          // UPPER third click -> Show data in UPPER half of screen (extend min downwards)
          nextMin = yMin - range - 3 * pad;
          nextMax = yMax + pad; 
        } else if (mouseY > padding.top + 2 * chartHeight / 3) {
          // LOWER third click -> Show data in LOWER half of screen (extend max upwards)
          nextMin = yMin - pad; 
          nextMax = yMax + range + 3 * pad;
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
  }, [padding.top, chartHeight, startAnimation]);

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

    // Use a Set to quickly identify datasets that have at least one active series
    const activeDatasetIds = new Set<string>();
    state.series.forEach(s => activeDatasetIds.add(s.sourceId));

    const axesToScale = xAxisId ? [xAxisId] : activeXAxesUsed.map(a => a.id);

    axesToScale.forEach(id => {
      const activeDatasetsUsingAxis = state.datasets.filter(d =>
        (d.xAxisId || 'axis-1') === id && activeDatasetIds.has(d.id)
      );
      if (activeDatasetsUsingAxis.length === 0) return;

      let xMin = Infinity, xMax = -Infinity;
      activeDatasetsUsingAxis.forEach(ds => {
        const xIdx = getColumnIndex(ds, ds.xAxisColumn);
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

  const getHoveredYAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
    let foundHovered = null;
    let leftOffset = 0;
    for (let i = 0; i < leftAxes.length; i++) {
      const axis = leftAxes[i];
      const axisMetrics = axisLayout[axis.id] || { total: 40 };
      const leftBound = padding.left - leftOffset - axisMetrics.total;
      const rightBound = padding.left - leftOffset;
      if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
      leftOffset += axisMetrics.total;
    }

    let rightOffset = 0;
    for (let i = 0; i < rightAxes.length; i++) {
      const axis = rightAxes[i];
      const axisMetrics = axisLayout[axis.id] || { total: 40 };
      const leftBound = width - padding.right + rightOffset;
      const rightBound = width - padding.right + rightOffset + axisMetrics.total;
      if (mouseX >= leftBound && mouseX <= rightBound) foundHovered = axis.id;
      rightOffset += axisMetrics.total;
    }
    return foundHovered;
  }, [leftAxes, rightAxes, axisLayout, padding, width, height]);

  const getHoveredXAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseX < padding.left || mouseX > width - padding.right) return null;
    let foundHovered = null;
    xAxesMetrics.forEach((metrics) => {
      const baseY = height - padding.bottom + metrics.cumulativeOffset;
      if (mouseY >= baseY && mouseY <= baseY + metrics.height) {
        foundHovered = metrics.id;
      }
    });
    return foundHovered;
  }, [xAxesMetrics, padding, width, height]);

  const performPan = useCallback((dx: number, dy: number, target: PanTarget = 'all', shiftKey: boolean = false) => {
    const state = useGraphStore.getState();

    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axesToPan = (target === 'all' || shiftKey) ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (target as { xAxisId: string }).xAxisId)!];
      axesToPan.forEach(axis => {
        if (!axis) return;
        const xRange = axis.max - axis.min, xMove = chartWidth > 0 ? (dx / chartWidth) * xRange : 0;
        const nextX = { min: axis.min - xMove, max: axis.max - xMove };
        state.updateXAxis(axis.id, nextX); targetXAxes.current[axis.id] = nextX;
      });
    }

    const draggedAxisId = typeof target === 'object' && 'yAxisId' in target ? target.yAxisId : null;
    const axesToPan = (target === 'all' && !shiftKey) ? activeYAxes : (draggedAxisId ? [activeYAxes.find(a => a.id === draggedAxisId)!] : []);

    axesToPan.forEach(axis => {
      if (!axis) return;
      const curAxis = state.yAxes.find(a => a.id === axis.id)!;
      const yRange = curAxis.max - curAxis.min;
      const yMove = chartHeight > 0 ? (dy / chartHeight) * yRange : 0;
      const nextMin = curAxis.min + yMove;
      const nextMax = curAxis.max + yMove;

      const nextY = { min: nextMin, max: nextMax };
      state.updateYAxis(axis.id, nextY);
      targetYs.current[axis.id] = nextY;
    });
  }, [activeXAxesUsed, activeYAxes, chartWidth, chartHeight]);

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

  const handleTouchStart = (e: React.TouchEvent, target: PanTarget = 'all') => {
    const now = Date.now();
    const isDoubleTap = now - lastTouchTime.current < 300;
    lastTouchTime.current = now;

    if (e.touches.length === 1) {
      const touch = e.touches[0];
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const y = touch.clientY - rect.top;

      if (isDoubleTap) {
        if (target === 'all') {
          handleAutoScaleX();
          activeYAxes.forEach(a => handleAutoScaleY(a.id));
        } else if (typeof target === 'object') {
          if ('xAxisId' in target) handleAutoScaleX(target.xAxisId);
          else if ('yAxisId' in target) handleAutoScaleY(target.yAxisId, y);
        }
        return;
      }

      isPanningRef.current = true;
      setPanTarget(target);
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
    } else if (e.touches.length === 2) {
      isPanningRef.current = false;
      setPanTarget(prev => (prev && prev !== 'all') ? prev : target);
      const t1 = e.touches[0], t2 = e.touches[1];
      lastPinchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  };

  const handleTouchMoveRaw = useCallback((e: TouchEvent) => {
    if (!containerRef.current) return;

    if (e.touches.length === 1 && panTarget && lastTouchPos.current) {
      if (e.cancelable) e.preventDefault();
      const touch = e.touches[0];
      const dx = touch.clientX - lastTouchPos.current.x;
      const dy = touch.clientY - lastTouchPos.current.y;
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
      performPan(dx, dy, panTarget, e.shiftKey);
    } else if (e.touches.length === 2 && lastPinchDist.current) {
      if (e.cancelable) e.preventDefault();
      const rect = containerRef.current.getBoundingClientRect();
      const t1 = e.touches[0], t2 = e.touches[1];
      const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
      if (dist === 0) return;
      const zoomFactor = lastPinchDist.current / dist;
      lastPinchDist.current = dist;

      const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
      const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;
      performZoom(zoomFactor, centerX, centerY, panTarget || 'all', e.shiftKey);
    }
  }, [panTarget, performPan, performZoom]);

  const handleMouseMoveRaw = useCallback((e: MouseEvent) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // Detect Hovered Axis
    hoveredAxisIdRef.current = getHoveredYAxis(mouseX, mouseY);
    hoveredXAxisIdRef.current = getHoveredXAxis(mouseX, mouseY);

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
    performPan(dx, dy, panTarget, e.shiftKey);
  }, [panTarget, padding, width, height, getHoveredYAxis, getHoveredXAxis, performPan]);

  const handleTouchEnd = useCallback((e: TouchEvent) => {
    if (e.touches.length === 0) {
      isPanningRef.current = false;
      setPanTarget(null);
      lastTouchPos.current = null;
      lastPinchDist.current = null;
    } else if (e.touches.length === 1) {
      // Transition from pinch to pan
      const touch = e.touches[0];
      lastTouchPos.current = { x: touch.clientX, y: touch.clientY };
      isPanningRef.current = true;
      lastPinchDist.current = null;
    }
  }, []);

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
          if (!isShiftPressed) {
            activeYAxes.forEach(axis => {
               const mainXConf = activeXAxesUsed[0] || xAxes[0];
               const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding };
               const a1 = screenToWorld(minX, maxY, axisVp), a2 = screenToWorld(maxX, minY, axisVp);
               targetYs.current[axis.id] = { min: a1.y, max: a2.y };
            });
          }
          startAnimation();
        }
      }
      isPanningRef.current = false;
      setPanTarget(null);
    };

    window.addEventListener('mousemove', handleMouseMoveRaw);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMoveRaw, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
    return () => {
      window.removeEventListener('mousemove', handleMouseMoveRaw);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('touchmove', handleTouchMoveRaw);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [handleMouseMoveRaw, handleTouchMoveRaw, handleTouchEnd, activeXAxesUsed, activeYAxes, width, height, padding, startAnimation, isShiftPressed, xAxes]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(true);
      if (e.key === 'Shift') setIsShiftPressed(true);
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.ctrlKey && (e.key === '+' || e.key === '-' || e.key === '=' || e.key === '_')) e.preventDefault();
      pressedKeys.current.add(e.key);
      const step = 0.15;
      if (e.key === 'ArrowLeft') {
        const onXAxis = !!hoveredXAxisIdRef.current;
        const axesToMove = (onXAxis && !e.shiftKey) ? activeXAxesUsed.filter(a => a.id === hoveredXAxisIdRef.current) : activeXAxesUsed;
        axesToMove.forEach(axis => {
          const t = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
          const range = t.max - t.min;
          targetXAxes.current[axis.id] = { min: t.min - range * step, max: t.max - range * step };
        });
        startAnimation();
      } else if (e.key === 'ArrowRight') {
        const onXAxis = !!hoveredXAxisIdRef.current;
        const axesToMove = (onXAxis && !e.shiftKey) ? activeXAxesUsed.filter(a => a.id === hoveredXAxisIdRef.current) : activeXAxesUsed;
        axesToMove.forEach(axis => {
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
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(false);
      if (e.key === 'Shift') setIsShiftPressed(false);
      pressedKeys.current.delete(e.key);
    };
    window.addEventListener('keydown', handleKeyDown); window.addEventListener('keyup', handleKeyUp);
    return () => { window.removeEventListener('keydown', handleKeyDown); window.removeEventListener('keyup', handleKeyUp); };
  }, [activeYAxes, activeXAxesUsed, startAnimation]);

  const xAxesLayout = useMemo(() => {
    const activeDatasetIds = new Set(series.map(s => s.sourceId));
    const datasetsByXAxis: Record<string, Dataset[]> = {};
    const datasetToXAxis: Record<string, string> = {};

    for(let i = 0; i < datasets.length; i++) {
      const d = datasets[i];
      if (activeDatasetIds.has(d.id)) {
        const axisId = d.xAxisId || 'axis-1';
        datasetToXAxis[d.id] = axisId;
        if (!datasetsByXAxis[axisId]) datasetsByXAxis[axisId] = [];
        datasetsByXAxis[axisId].push(d);
      }
    }

    const seriesByXAxis: Record<string, SeriesConfig[]> = {};
    for(let i = 0; i < series.length; i++) {
      const s = series[i];
      const axisId = datasetToXAxis[s.sourceId];
      if (axisId) {
        if (!seriesByXAxis[axisId]) seriesByXAxis[axisId] = [];
        seriesByXAxis[axisId].push(s);
      }
    }

    return activeXAxesUsed.map(axis => {
      const range = axis.max - axis.min;
      const isXDate = axis.xMode === 'date';
      const datasetsForThisAxis = datasetsByXAxis[axis.id] || [];
      const seriesForThisAxis = seriesByXAxis[axis.id] || [];
      const title = Array.from(new Set(datasetsForThisAxis.map(d => d.xAxisColumn))).join(' / ');
      const color = seriesForThisAxis[0]?.lineColor || '#475569';

      if (range <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      const isInteracting = isPanningRef.current || isAnimating.current;

      if (!isXDate) {
        let actualStep: number;
        if (isInteracting && lockedXSteps.current[axis.id]?.step) {
          actualStep = lockedXSteps.current[axis.id].step!;
        } else {
          const maxTicks = Math.max(2, Math.floor(chartWidth / 60));
          const step = range / maxTicks;
          const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
          const normalizedStep = step / magnitude;
          const finalStep = normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10;
          actualStep = finalStep * magnitude;
          lockedXSteps.current[axis.id] = { step: actualStep };
        }

        if (actualStep <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = Math.max(0, -Math.floor(Math.log10(actualStep)));
        const firstTick = Math.ceil((axis.min - actualStep) / actualStep) * actualStep;
        const result: number[] = [];
        for (let t = firstTick; t <= axis.max + actualStep; t += actualStep) {
          if (result.length > 200) break;
          result.push(t);
        }
        return { id: axis.id, ticks: { result, step: actualStep, precision, isXDate: false as const }, title, color };
      } else {
        let timeStep;
        if (isInteracting && lockedXSteps.current[axis.id]?.timeStep) {
          timeStep = lockedXSteps.current[axis.id].timeStep!;
        } else {
          timeStep = getTimeStep(range, Math.max(2, Math.floor(chartWidth / 80)));
          lockedXSteps.current[axis.id] = { timeStep };
        }
        const ticks = generateTimeTicks(axis.min, axis.max, timeStep);
        const secondaryLabels = generateSecondaryLabels(axis.min, axis.max, timeStep);
        return { id: axis.id, ticks: { result: ticks, isXDate: true as const, secondaryLabels }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets]);

  const leftAxesLayout = useMemo(() => activeYAxesLayout.filter(a => a.position === 'left'), [activeYAxesLayout]);
  const rightAxesLayout = useMemo(() => activeYAxesLayout.filter(a => a.position === 'right'), [activeYAxesLayout]);

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onTouchStart={(e) => handleTouchStart(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : (isShiftPressed ? 'ew-resize' : 'crosshair')), backgroundColor: '#fff', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      {useGraphStore.getState().datasets.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>No data</div>}
      <GridLines xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}>
        <WebGLRenderer datasets={useGraphStore.getState().datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} isInteracting={isPanningRef.current || isAnimating.current} />
      </div>
      <AxesLayer xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} leftAxes={leftAxesLayout} rightAxes={rightAxesLayout} series={series} axisLayout={axisLayout} allXAxes={xAxes} xAxesMetrics={xAxesMetrics} />

      {xAxesMetrics.map((metrics) => {
        const baseY = padding.bottom - metrics.cumulativeOffset - metrics.height;
        return <div key={`wheel-x-${metrics.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { xAxisId: metrics.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { xAxisId: metrics.id }); }} onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, { xAxisId: metrics.id }); }} onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleX(metrics.id); }} style={{ position: 'absolute', bottom: baseY, left: padding.left, right: padding.right, height: metrics.height, cursor: 'ew-resize', zIndex: 20 }} />;
      })}

      {activeYAxes.map((axis) => {
        const isLeft = axis.position === 'left';
        const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
        let xPos = 0;
        if (isLeft) {
          const offset = leftOffsets[axis.id] ?? 0;
          xPos = padding.left - offset - axisMetrics.total;
        } else {
          const offset = rightOffsets[axis.id] ?? 0;
          xPos = width - padding.right + offset;
        }
        return <div key={`wheel-${axis.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: axis.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: axis.id }); }} onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, { yAxisId: axis.id }); }} onDoubleClick={(e) => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); const mouseY = rect ? e.clientY - rect.top : undefined; handleAutoScaleY(axis.id, mouseY); }} style={{ position: 'absolute', left: xPos, top: padding.top, width: axisMetrics.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} xAxes={xAxes} yAxes={activeYAxes} datasets={useGraphStore.getState().datasets} series={series} />
      {zoomBoxState && <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
    </main>
  );
};

export default ChartContainer;
