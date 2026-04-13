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
  measureRange: { startX: number, startY: number, endX: number, endY: number } | null;
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
              <line x1={padding.left} y1={y} x2={width - padding.right + 8} y2={y} stroke="#475569" strokeWidth="1" markerEnd="url(#arrow)" />
              {axis.ticks.result.map((t: number | TimeTick) => {
                const { x } = worldToScreen(typeof t === 'number' ? t : t.timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                return <line key={`xt-${axis.id}-${typeof t === 'number' ? t : t.timestamp}`} x1={x} y1={y} x2={x} y2={y + 6} stroke="#475569" strokeWidth="1" />;
              })}
              {axisConf.min <= 0 && axisConf.max >= 0 && idx === 0 && (
                <line x1={worldToScreen(0, 0, vp).x} y1={height - padding.bottom} x2={worldToScreen(0, 0, vp).x} y2={padding.top - 8} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              )}
            </g>
          );
        })}

        {yAxes.length > 0 && (() => {
          const mainAxis = yAxes[0];
          const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
          if (mainAxis.min <= 0 && mainAxis.max >= 0) {
            return (
              <line x1={padding.left} y1={worldToScreen(mainXConf.min, 0, axisVp).y} x2={width - padding.right + 8} y2={worldToScreen(mainXConf.min, 0, axisVp).y} stroke="#94a3b8" strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#arrow)" />
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
              <line x1={axisLineX} y1={height - padding.bottom} x2={axisLineX} y2={padding.top - 8} stroke="#475569" strokeWidth="1" markerEnd="url(#arrow)" />
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
                if (nextX < x + labelWidth + 10) x = nextX - labelWidth - 10;
                if (x + labelWidth > padding.left && x < width - padding.right) {
                  return (
                    <div key={`sl-${axis.id}-${sl.timestamp}`} style={{ position: 'absolute', left: x, bottom: baseY - metrics.secLabelBottom, fontSize: isMobile ? '10px' : '10px', fontWeight: 'bold', color: axis.color, backgroundColor: 'rgba(255,255,255,0.8)', padding: '1px 4px', borderRadius: '2px', whiteSpace: 'nowrap', borderLeft: currentX > padding.left ? `2px solid ${axis.color}` : 'none', zIndex: 10 }}>{sl.label}</div>
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
              <div style={{ position: 'absolute', bottom: baseY - metrics.titleBottom, left: padding.left + (width - padding.left - padding.right) / 2, transform: 'translateX(-50%)', fontSize: isMobile ? '10px' : '10px', fontWeight: 'bold', color: axis.color, whiteSpace: 'nowrap', maxWidth: width - padding.left - padding.right, overflow: 'hidden', textOverflow: 'ellipsis' }}>{axis.title}</div>
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

const SNAP_PX = 30;

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, xAxes, yAxes, datasets, series, measureRange }: CrosshairProps) => {
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
        clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
      } else { clientX = e.clientX; clientY = e.clientY; }
      const x = clientX - rect.left, y = clientY - rect.top;
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        setPos({ x, y });
      } else setPos(null);
    };
    const handleLeave = () => setPos(null);
    window.addEventListener('mousemove', handleMove); window.addEventListener('touchstart', handleMove); window.addEventListener('touchmove', handleMove);
    el.addEventListener('mouseleave', handleLeave);
    return () => {
      window.removeEventListener('mousemove', handleMove); window.removeEventListener('touchstart', handleMove); window.removeEventListener('touchmove', handleMove);
      el.removeEventListener('mouseleave', handleLeave);
    };
  }, [containerRef, padding, width, height, isPanning]);

  const seriesMetadata = useMemo(() => {
    const datasetsById = new Map<string, Dataset>(); datasets.forEach(d => datasetsById.set(d.id, d));
    const yAxesById = new Map<string, YAxisConfig>(); yAxes.forEach(a => yAxesById.set(a.id, a));
    const xAxesById = new Map<string, XAxisConfig>(); xAxes.forEach(a => xAxesById.set(a.id, a));
    return series.filter(s => !s.hidden).map(s => {
      const ds = datasetsById.get(s.sourceId); const axis = yAxesById.get(s.yAxisId); const xAxis = xAxesById.get(ds?.xAxisId || 'axis-1');
      if (!ds || !axis || !xAxis) return null;
      const xIdx = getColumnIndex(ds, ds.xAxisColumn); const yIdx = getColumnIndex(ds, s.yColumn);
      if (xIdx === -1 || yIdx === -1) return null;
      const xCol = ds.data[xIdx]; const yCol = ds.data[yIdx];
      if (!xCol?.data || !yCol?.data) return null;
      return { series: s, ds, axis, xAxis, xIdx, yIdx, xCol, yCol };
    }).filter(Boolean) as any[];
  }, [datasets, series, yAxes, xAxes]);

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
    yAxes.forEach((axis: YAxisConfig) => { if (seriesByAxis[axis.id]) axisTitleMap[axis.id] = seriesByAxis[axis.id].join('/'); });
    return { xAxisConf, axisTitleMap };
  }, [datasets, series, xAxes, yAxes, seriesMetadata]);

  const snap = useMemo(() => {
    if (!pos || !snapMetadata || seriesMetadata.length === 0) return null;
    const { xAxisConf, axisTitleMap } = snapMetadata;
    const xWorldPerPx = (xAxisConf.max - xAxisConf.min) / Math.max(1, width - padding.left - padding.right);
    const xSnapWorld = SNAP_PX * xWorldPerPx;
    let bestDist = Infinity; let bestXWorld: number | null = null; let bestSeriesXConf: XAxisConfig | null = null;
    const closestIdxByDataset = new Map<string, number>();
    seriesMetadata.forEach(({ ds, xAxis, xCol }) => {
      let cachedIdx = closestIdxByDataset.get(ds.id);
      const xData = xCol.data; const refX = xCol.refPoint;
      if (cachedIdx === undefined) {
        const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
        const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
        let lo = 0, hi = xData.length - 1;
        while (lo < hi) { const mid = (lo + hi) >>> 1; if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1; else hi = mid; }
        let bestI = lo;
        if (lo > 0 && Math.abs(xData[lo-1]+refX-sMouseWorld.x) < Math.abs(xData[lo]+refX-sMouseWorld.x)) bestI = lo-1;
        cachedIdx = bestI; closestIdxByDataset.set(ds.id, cachedIdx);
      }
      const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
      const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
      for (const i of [cachedIdx - 1, cachedIdx, cachedIdx + 1]) {
        if (i < 0 || i >= xData.length) continue;
        const wx = xData[i] + refX; const d = Math.abs(wx - sMouseWorld.x);
        if (d < bestDist) { bestDist = d; bestXWorld = wx; bestSeriesXConf = xAxis; }
      }
    });
    if (bestXWorld === null || !bestSeriesXConf || bestDist > xSnapWorld) return null;
    const finalBestXWorld = bestXWorld as number;
    const finalXConf = bestSeriesXConf as XAxisConfig;
    const entriesMap = new Map<string, { xLabel: string, xAxisName: string, items: { label: string, value: number, color: string, xVal: number, isXDate: boolean }[] }>();
    seriesMetadata.forEach(({ series: s, ds, axis, xAxis, xCol, yCol }) => {
      const xData = xCol.data, yData = yCol.data;
      const refX = xCol.refPoint, refY = yCol.refPoint;
      const bestI = closestIdxByDataset.get(ds.id) as number;
      const yVal = yData[bestI] + refY; const xVal = xData[bestI] + refX;
      const axisTitle = axisTitleMap[axis.id] || '';
      const label = s.name || s.yColumn;
      const displayLabel = axisTitle && axisTitle !== label ? `${label} [${axisTitle}]` : label;
      const xLab = xAxis.xMode === 'date' ? formatFullDate(xVal) : parseFloat(xVal.toPrecision(7)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 10 });
      const xAxisName = xAxis.name || `X-Axis ${ds.xAxisId}`;
      const groupKey = `${xLab}|${xAxisName}`;
      let group = entriesMap.get(groupKey);
      if (!group) { group = { xLabel: xLab, xAxisName, items: [] }; entriesMap.set(groupKey, group); }
      group.items.push({ label: displayLabel, value: yVal, color: s.lineColor || '#333', xVal, isXDate: xAxis.xMode === 'date' });
    });
    const entries = Array.from(entriesMap.values());
    const snapScreenX = worldToScreen(finalBestXWorld, 0, { xMin: finalXConf.min, xMax: finalXConf.max, yMin: 0, yMax: 100, width, height, padding }).x;
    return { snapScreenX, entries };
  }, [pos, seriesMetadata, width, height, padding, snapMetadata]);

  const measurement = useMemo(() => {
    if (!measureRange || !snapMetadata || seriesMetadata.length === 0) return null;
    const { xAxisConf } = snapMetadata;
    const vp = { xMin: xAxisConf.min, xMax: xAxisConf.max, yMin: 0, yMax: 100, width, height, padding };
    const w1 = screenToWorld(measureRange.startX, measureRange.startY, vp);
    const w2 = screenToWorld(measureRange.endX, measureRange.endY, vp);
    
    const dx = Math.abs(w2.x - w1.x);
    const dxFormatted = xAxisConf.xMode === 'date' ? `${(dx / 3600).toFixed(2)}h / ${(dx / 86400).toFixed(2)}d` : dx.toPrecision(5);
    
    return { dx: dxFormatted, startX: measureRange.startX, endX: measureRange.endX };
  }, [measureRange, snapMetadata, seriesMetadata, width, height, padding]);

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

  if (!pos && !measurement) return null;

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 15 }}>
        {snap && <line x1={snap.snapScreenX} y1={padding.top} x2={snap.snapScreenX} y2={height - padding.bottom} stroke="#cbd5e1" strokeWidth="1" strokeDasharray="3 3" />}
        {measurement && (
          <g>
            <rect x={Math.min(measurement.startX, measurement.endX)} y={padding.top} width={Math.abs(measurement.endX - measurement.startX)} height={height - padding.top - padding.bottom} fill="rgba(59, 130, 246, 0.1)" stroke="rgba(59, 130, 246, 0.3)" strokeWidth="1" />
            <line x1={measurement.startX} y1={padding.top} x2={measurement.startX} y2={height - padding.bottom} stroke="#3b82f6" strokeWidth="1" />
            <line x1={measurement.endX} y1={padding.top} x2={measurement.endX} y2={height - padding.bottom} stroke="#3b82f6" strokeWidth="1" />
          </g>
        )}
      </svg>
      {(snap || measurement) && (
        <div style={{
          position: 'absolute',
          left: (snap?.snapScreenX || pos?.x || 0) + 12,
          top: (pos?.y || 0) + 15,
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          color: '#1e293b', padding: '8px 12px', borderRadius: '8px', fontSize: '10px', fontFamily: 'monospace', pointerEvents: 'none', zIndex: 100, boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1)', border: '1px solid #e2e8f0', whiteSpace: 'pre', maxWidth: 360
        }}>
          {measurement && (
            <div style={{ marginBottom: '8px', paddingBottom: '8px', borderBottom: '1px solid #e2e8f0', color: '#2563eb', fontWeight: 'bold' }}>
              ΔX: {measurement.dx}
            </div>
          )}
          {snap?.entries.map((group, groupIdx) => (
            <React.Fragment key={`group-${groupIdx}`}>
              <div style={{ color: '#666', fontSize: '9px', borderTop: groupIdx > 0 ? '1px solid rgba(0,0,0,0.05)' : 'none', paddingTop: groupIdx > 0 ? '4px' : 0, marginTop: groupIdx > 0 ? '4px' : 0 }}>
                <span style={{ fontWeight: 'bold', color: '#1e293b', fontSize: '10px' }}>{group.xLabel}</span> ({group.xAxisName})
              </div>
              {group.items.map((item, itemIdx) => (
                <div key={`item-${groupIdx}-${itemIdx}`} style={{ color: item.color, display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                  <span>{item.label}:</span>
                  <span style={{ color: '#333', fontWeight: 'bold' }}>{item.value.toPrecision(7)}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
});


const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const { series, xAxes, yAxes, isLoaded, lastAppliedViewId, datasets, highlightedSeriesId } = useGraphStore();
  const datasetsById = useMemo(() => {
    const map = new Map<string, Dataset>();
    datasets.forEach(d => map.set(d.id, d));
    return map;
  }, [datasets]);
  const xAxesById = useMemo(() => {
    const map = new Map<string, typeof xAxes[0]>();
    xAxes.forEach(a => map.set(a.id, a));
    return map;
  }, [xAxes]);
  
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [measureRange, setMeasureRange] = useState<{ startX: number, startY: number, endX: number, endY: number } | null>(null);
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
      let needsNextFrame = applyKeyboardZoom(state, pressedKeys.current, targetXAxes.current, targetYs.current);
      if (animateXAxes(state, targetXAxes.current, factor)) needsNextFrame = true;
      if (animateYAxes(state, targetYs.current, factor)) needsNextFrame = true;
      if (needsNextFrame) requestAnimationFrame(loop); else isAnimating.current = false;
    };
    requestAnimationFrame(loop);
  }, []);

  useEffect(() => {
    if (isLoaded && !isAnimating.current) {
      if (useGraphStore.getState().datasets.length > 0) wasEmptyRef.current = false;
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded, xAxes, yAxes, startAnimation]);

  useEffect(() => {
    if (!lastAppliedViewId) return;
    const view = useGraphStore.getState().views.find(v => v.id === lastAppliedViewId.id);
    if (!view) return;
    view.xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
    view.yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
    startAnimation();
  }, [lastAppliedViewId, startAnimation]);

  const activeYAxesLayout = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    const isInteracting = isPanningRef.current || isAnimating.current;
    return yAxes.filter(a => usedIds.has(a.id)).map(axis => {
      const range = axis.max - axis.min;
      const chartHeight = Math.max(0, height - (width < 768 || height < 500 ? 40 : 60) - 20);
      let actualStep: number;
      if (isInteracting && lockedYSteps.current[axis.id]) actualStep = lockedYSteps.current[axis.id];
      else {
        const step = range / Math.max(2, Math.floor(chartHeight / 30));
        const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
        const normalizedStep = step / magnitude;
        actualStep = (normalizedStep < 1.5 ? 1 : normalizedStep < 3 ? 2 : normalizedStep < 7 ? 5 : 10) * magnitude;
        lockedYSteps.current[axis.id] = actualStep;
      }
      if (actualStep <= 0) return { ...axis, ticks: [], precision: 0, actualStep: 1 };
      const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
      const firstTick = Math.ceil((axis.min - actualStep) / actualStep) * actualStep;
      const ticks = []; for (let t = firstTick; t <= axis.max + actualStep; t += actualStep) { if (ticks.length > 200) break; ticks.push(t); }
      return { ...axis, ticks, precision, actualStep };
    });
  }, [yAxes, series, height, width]);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const axisLayout = useMemo(() => {
    const layout: Record<string, { total: number, label: number }> = {};
    activeYAxes.forEach(axis => {
      const range = axis.max - axis.min, maxTicks = Math.max(2, Math.floor(height / 30));
      const step = range / maxTicks;
      const magnitude = Math.pow(10, Math.floor(Math.log10(Math.abs(step) || 1)));
      const actualStep = (step / magnitude < 1.5 ? 1 : step / magnitude < 3 ? 2 : step / magnitude < 7 ? 5 : 10) * magnitude;
      const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));
      const widestValChars = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
      const labelWidth = widestValChars * 6; layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
    });
    return layout;
  }, [activeYAxes, height]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  const { leftOffsets, rightOffsets } = useMemo(() => {
    const leftOffsets: Record<string, number> = {}; let currentLeftOffset = 0;
    for (let i = 0; i < leftAxes.length; i++) { leftOffsets[leftAxes[i].id] = currentLeftOffset; currentLeftOffset += axisLayout[leftAxes[i].id]?.total || 40; }
    const rightOffsets: Record<string, number> = {}; let currentRightOffset = 0;
    for (let i = 0; i < rightAxes.length; i++) { rightOffsets[rightAxes[i].id] = currentRightOffset; currentRightOffset += axisLayout[rightAxes[i].id]?.total || 40; }
    return { leftOffsets, rightOffsets };
  }, [leftAxes, rightAxes, axisLayout]);

  const activeXAxesUsed = useMemo(() => {
    const axisToMinDsIdx = new Map<string, number>();
    datasets.forEach((d, dsIdx) => { if (series.some(s => s.sourceId === d.id)) { const xId = d.xAxisId || 'axis-1'; if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) axisToMinDsIdx.set(xId, dsIdx); } });
    return xAxes.filter(a => axisToMinDsIdx.has(a.id)).sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);

  const xAxesMetrics = useMemo(() => {
    let currentOffset = 0; const isMobile = width < 768 || height < 500;
    return activeXAxesUsed.map((axis) => { const baseMetrics = getXAxisMetrics(isMobile, axis.xMode); const metrics = { ...baseMetrics, id: axis.id, cumulativeOffset: currentOffset }; currentOffset += baseMetrics.height; return metrics; });
  }, [activeXAxesUsed, width, height]);

  const padding = useMemo(() => {
    const isMobile = width < 768 || height < 500; const base = isMobile ? BASE_PADDING_MOBILE : BASE_PADDING_DESKTOP;
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const bottom = xAxesMetrics.length > 0 ? xAxesMetrics.reduce((sum, m) => sum + m.height, 0) : base.bottom;
    return { ...base, left: base.left + leftSum, right: base.right + rightSum, bottom };
  }, [leftAxes, rightAxes, axisLayout, xAxesMetrics, width, height]);

  const chartWidth = Math.max(0, width - padding.left - padding.right), chartHeight = Math.max(0, height - padding.top - padding.bottom);

  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    if (state.series.length === 0 && state.datasets.length === 0) { wasEmptyRef.current = true; return; }
    if (wasEmptyRef.current && (state.xAxes[0].min !== 0 || state.xAxes[0].max !== 100)) wasEmptyRef.current = false;
    let shouldReset = wasEmptyRef.current;

    if (!shouldReset && state.datasets.length > 0) {
       let anyDataVisible = false;
       state.series.forEach(s => {
         const ds = datasetsById.get(s.sourceId), xAxis = xAxesById.get(ds?.xAxisId || 'axis-1'); if (!ds || !xAxis) return;
         const xIdx = getColumnIndex(ds, ds.xAxisColumn), xCol = ds.data[xIdx];
         if (xCol && xCol.bounds) { if (Math.max(0, Math.min(xAxis.max, xCol.bounds.max) - Math.max(xAxis.min, xCol.bounds.min)) > 0 || (xAxis.min >= xCol.bounds.min && xAxis.max <= xCol.bounds.max)) anyDataVisible = true; }
       });
       if (!anyDataVisible) shouldReset = true;
    }
    if (shouldReset && state.datasets.length > 0) {
      wasEmptyRef.current = false;
      const xBounds = new Map<string, { min: number, max: number }>();
      state.series.forEach(s => { const ds = datasetsById.get(s.sourceId); if (!ds) return; const xIdx = getColumnIndex(ds, ds.xAxisColumn); const col = ds.data[xIdx]; if (!col || !col.bounds) return; const xId = ds.xAxisId || 'axis-1'; const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity }; xBounds.set(xId, { min: Math.min(cur.min, col.bounds.min), max: Math.max(cur.max, col.bounds.max) }); });
      xBounds.forEach((bounds, id) => { if (bounds.min !== Infinity) { const pad = (bounds.max - bounds.min || 1) * 0.05; const nextX = { min: bounds.min - pad, max: bounds.max + pad }; targetXAxes.current[id] = nextX; state.updateXAxis(id, nextX); } });
      const seriesByYAxisIdLocal = new Map<string, typeof state.series>(); state.series.forEach(s => { if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []); seriesByYAxisIdLocal.get(s.yAxisId)!.push(s); });
      activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || []; if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => { const ds = datasetsById.get(s.sourceId); if (!ds) return; const yIdx = getColumnIndex(ds, s.yColumn), yCol = ds.data[yIdx]; if (!yCol || !yCol.bounds) return; if (yCol.bounds.min < yMin) yMin = yCol.bounds.min; if (yCol.bounds.max > yMax) yMax = yCol.bounds.max; });
        if (yMin !== Infinity) { const pad = (yMax - yMin || 1) * 0.05; const nextY = { min: yMin - pad, max: yMax + pad }; targetYs.current[axis.id] = nextY; state.updateYAxis(axis.id, nextY); }
      });
      startAnimation();
    }
  }, [isLoaded, startAnimation, series, yAxes, activeYAxes, datasets]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (entries.length > 0) {
        const entry = entries[entries.length - 1];
        setWidth(entry.contentRect.width);
        setHeight(entry.contentRect.height);
      }
    });
    observer.observe(containerRef.current); return () => observer.disconnect();
  }, []);

  const performZoom = useCallback((zoomFactor: number, mouseX: number, mouseY: number, target: PanTarget = 'all', shiftKey: boolean = false) => {
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axesToZoom = (target === 'all' || shiftKey) ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (target as { xAxisId: string }).xAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return; const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding }; const worldMouse = screenToWorld(mouseX, 0, vp);
        const currentX = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max }, newXRange = (currentX.max - currentX.min) * zoomFactor, weight = (mouseX - padding.left) / chartWidth;
        targetXAxes.current[axis.id] = { min: worldMouse.x - weight * newXRange, max: worldMouse.x + (1 - weight) * newXRange };
      });
    }
    if ((target === 'all' && !shiftKey) || (typeof target === 'object' && 'yAxisId' in target)) {
      const axesToZoom = target === 'all' ? activeYAxes : [activeYAxes.find(a => a.id === (target as { yAxisId: string }).yAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return; const axisVp = { xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding }; const worldMouse = screenToWorld(0, mouseY, axisVp);
        const currentTarget = targetYs.current[axis.id] || { min: axis.min, max: axis.max }, newYRange = (currentTarget.max - currentTarget.min) * zoomFactor, weight = (height - padding.bottom - mouseY) / chartHeight;
        targetYs.current[axis.id] = { min: worldMouse.y - weight * newYRange, max: worldMouse.y + (1 - weight) * newYRange };
      });
    }
    startAnimation();
  }, [activeXAxesUsed, activeYAxes, width, height, padding, chartWidth, chartHeight, startAnimation]);

  const handleWheel = (e: React.WheelEvent, target: PanTarget = 'all') => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9; const rect = containerRef.current?.getBoundingClientRect();
    performZoom(zoomFactor, rect ? e.clientX - rect.left : width / 2, rect ? e.clientY - rect.top : height / 2, target, e.shiftKey);
  };

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
    const state = useGraphStore.getState(); const axisSeries = state.series.filter(s => s.yAxisId === axisId); if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;

    axisSeries.forEach(s => {
      const ds = datasetsById.get(s.sourceId), xAxis = xAxesById.get(ds?.xAxisId || 'axis-1'); if (!ds || !xAxis) return;
      const xIdx = getColumnIndex(ds, ds.xAxisColumn), yIdx = getColumnIndex(ds, s.yColumn); if (xIdx === -1 || yIdx === -1) return;
      const colX = ds.data[xIdx], colY = ds.data[yIdx]; if (!colX?.data || !colY?.data) return;
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
        } else { for (let i = startIdx; i <= endIdx; i++) { const v = yData[i] + refY; if (v < yMin) yMin = v; if (v > yMax) yMax = v; } }
      }
    });
    if (yMin !== Infinity) {
      let nMin = yMin, nMax = yMax; const r = yMax - yMin || 1, p = r * 0.05;
      if (mouseY !== undefined) { if (mouseY < padding.top + chartHeight / 3) { nMin = yMin - r - 3 * p; nMax = yMax + p; } else if (mouseY > padding.top + 2 * chartHeight / 3) { nMin = yMin - p; nMax = yMax + r + 3 * p; } else { nMin = yMin - p; nMax = yMax + p; } }
      else { nMin = yMin - p; nMax = yMax + p; }
      targetYs.current[axisId] = { min: nMin, max: nMax }; startAnimation();
    }
  }, [padding.top, chartHeight, startAnimation]);

  const prevSeriesRef = useRef(series);
  useEffect(() => {
    if (!isLoaded) return;
    if (series.length > prevSeriesRef.current.length) {
      const added = series[series.length - 1]; if (added) handleAutoScaleY(added.yAxisId);
    } else {
      series.forEach((s, i) => {
        const prev = prevSeriesRef.current.find(ps => ps.id === s.id);
        if (prev && (prev.yColumn !== s.yColumn || prev.sourceId !== s.sourceId)) handleAutoScaleY(s.yAxisId);
      });
    }
    prevSeriesRef.current = series;
  }, [series, isLoaded, handleAutoScaleY]);

  const handleAutoScaleX = useCallback((xAxisId?: string) => {
    const state = useGraphStore.getState(); if (state.datasets.length === 0) return;
    const activeDatasetIds = new Set<string>(); state.series.forEach(s => activeDatasetIds.add(s.sourceId));
    const axesToScale = xAxisId ? [xAxisId] : activeXAxesUsed.map(a => a.id);
    axesToScale.forEach(id => {
      const activeDs = state.datasets.filter(d => (d.xAxisId || 'axis-1') === id && activeDatasetIds.has(d.id)); if (activeDs.length === 0) return;
      let xMin = Infinity, xMax = -Infinity;
      activeDs.forEach(ds => { const xIdx = getColumnIndex(ds, ds.xAxisColumn), col = ds.data[xIdx]; if (col?.bounds) { if (col.bounds.min < xMin) xMin = col.bounds.min; if (col.bounds.max > xMax) xMax = col.bounds.max; } });
      if (xMin !== Infinity) { const pad = (xMax - xMin || 1) * 0.05; targetXAxes.current[id] = { min: xMin - pad, max: xMax + pad }; }
    });
    startAnimation();
  }, [startAnimation, activeXAxesUsed]);

  const getHoveredYAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
    let lOff = 0; for (let i = 0; i < leftAxes.length; i++) { const am = axisLayout[leftAxes[i].id] || { total: 40 }; if (mouseX >= padding.left - lOff - am.total && mouseX <= padding.left - lOff) return leftAxes[i].id; lOff += am.total; }
    let rOff = 0; for (let i = 0; i < rightAxes.length; i++) { const am = axisLayout[rightAxes[i].id] || { total: 40 }; if (mouseX >= width - padding.right + rOff && mouseX <= width - padding.right + rOff + am.total) return rightAxes[i].id; rOff += am.total; }
    return null;
  }, [leftAxes, rightAxes, axisLayout, padding, width, height]);

  const getHoveredXAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseX < padding.left || mouseX > width - padding.right) return null;
    for (const m of xAxesMetrics) { const baseY = height - padding.bottom + m.cumulativeOffset; if (mouseY >= baseY && mouseY <= baseY + m.height) return m.id; }
    return null;
  }, [xAxesMetrics, padding, width, height]);

  const performPan = useCallback((dx: number, dy: number, target: PanTarget = 'all', shiftKey: boolean = false) => {
    const state = useGraphStore.getState();
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axes = (target === 'all' || shiftKey) ? activeXAxesUsed : [activeXAxesUsed.find(a => a.id === (target as any).xAxisId)!];
      axes.forEach(axis => { if (!axis) return; const xr = axis.max - axis.min, xm = chartWidth > 0 ? (dx / chartWidth) * xr : 0, next = { min: axis.min - xm, max: axis.max - xm }; state.updateXAxis(axis.id, next); targetXAxes.current[axis.id] = next; });
    }
    const draggedY = typeof target === 'object' && 'yAxisId' in target ? target.yAxisId : null;
    const yAxesToPan = (target === 'all' && !shiftKey) ? activeYAxes : (draggedY ? [activeYAxes.find(a => a.id === draggedY)!] : []);
    yAxesToPan.forEach(axis => { if (!axis) return; const cur = state.yAxes.find(a => a.id === axis.id)!, yr = cur.max - cur.min, ym = chartHeight > 0 ? (dy / chartHeight) * yr : 0, next = { min: cur.min + ym, max: cur.max + ym }; state.updateYAxis(axis.id, next); targetYs.current[axis.id] = next; });
  }, [activeXAxesUsed, activeYAxes, chartWidth, chartHeight]);

  const handleMouseDown = (e: React.MouseEvent, target: PanTarget = 'all') => {
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.shiftKey && target === 'all') { setMeasureRange({ startX: x, startY: y, endX: x, endY: y }); }
    else if (e.ctrlKey && target === 'all') { if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) { const box = { startX: x, startY: y, endX: x, endY: y }; zoomBoxStartRef.current = box; setZoomBoxState(box); } }
    else { isPanningRef.current = true; setPanTarget(target); lastMousePos.current = { x: e.clientX, y: e.clientY }; }
  };

  const handleTouchStart = (e: React.TouchEvent, target: PanTarget = 'all') => {
    const now = Date.now(), isDouble = now - lastTouchTime.current < 300; lastTouchTime.current = now;
    if (e.touches.length === 1) {
      const t = e.touches[0], rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
      if (isDouble) { if (target === 'all') { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); } else if (typeof target === 'object') { if ('xAxisId' in target) handleAutoScaleX(target.xAxisId); else if ('yAxisId' in target) handleAutoScaleY(target.yAxisId, t.clientY - rect.top); } return; }
      isPanningRef.current = true; setPanTarget(target); lastTouchPos.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) { isPanningRef.current = false; setPanTarget(prev => (prev && prev !== 'all') ? prev : target); const t1 = e.touches[0], t2 = e.touches[1]; lastPinchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); }
  };

  const handleTouchMoveRaw = useCallback((e: TouchEvent) => {
    if (e.touches.length === 1 && panTarget && lastTouchPos.current) { if (e.cancelable) e.preventDefault(); const t = e.touches[0], dx = t.clientX - lastTouchPos.current.x, dy = t.clientY - lastTouchPos.current.y; lastTouchPos.current = { x: t.clientX, y: t.clientY }; performPan(dx, dy, panTarget, e.shiftKey); }
    else if (e.touches.length === 2 && lastPinchDist.current) { if (e.cancelable) e.preventDefault(); const rect = containerRef.current!.getBoundingClientRect(), t1 = e.touches[0], t2 = e.touches[1], dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY); if (dist === 0) return; const zf = lastPinchDist.current / dist; lastPinchDist.current = dist; performZoom(zf, (t1.clientX + t2.clientX) / 2 - rect.left, (t1.clientY + t2.clientY) / 2 - rect.top, panTarget || 'all', e.shiftKey); }
  }, [panTarget, performPan, performZoom]);

  const handleMouseMoveRaw = useCallback((e: MouseEvent) => {
    const rect = containerRef.current?.getBoundingClientRect(); if (!rect) return;
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    hoveredAxisIdRef.current = getHoveredYAxis(mx, my); hoveredXAxisIdRef.current = getHoveredXAxis(mx, my);
    if (measureRange) { setMeasureRange({ ...measureRange, endX: mx, endY: my }); return; }
    if (zoomBoxStartRef.current) { const box = zoomBoxStartRef.current; box.endX = Math.max(padding.left, Math.min(width - padding.right, mx)); box.endY = Math.max(padding.top, Math.min(height - padding.bottom, my)); setZoomBoxState({ ...box }); return; }
    if (!panTarget || !lastMousePos.current) return; performPan(e.clientX - lastMousePos.current.x, e.clientY - lastMousePos.current.y, panTarget, e.shiftKey); lastMousePos.current = { x: e.clientX, y: e.clientY };
  }, [panTarget, padding, width, height, getHoveredYAxis, getHoveredXAxis, performPan, measureRange]);

  useEffect(() => {
    const handleMouseUp = () => {
      if (measureRange) setMeasureRange(null);
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current; zoomBoxStartRef.current = null; setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX), maxX = Math.max(box.startX, box.endX), minY = Math.min(box.startY, box.endY), maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          activeXAxesUsed.forEach(axis => { const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding }; const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp); targetXAxes.current[axis.id] = { min: w1.x, max: w2.x }; });
          if (!isShiftPressed) { activeYAxes.forEach(axis => { const mx = activeXAxesUsed[0] || xAxes[0], avp = { xMin: mx.min, xMax: mx.max, yMin: axis.min, yMax: axis.max, width, height, padding }; const a1 = screenToWorld(minX, maxY, avp), a2 = screenToWorld(maxX, minY, avp); targetYs.current[axis.id] = { min: a1.y, max: a2.y }; }); }
          startAnimation();
        }
      }
      isPanningRef.current = false; setPanTarget(null);
    };
    window.addEventListener('mousemove', handleMouseMoveRaw); window.addEventListener('mouseup', handleMouseUp); window.addEventListener('touchmove', handleTouchMoveRaw, { passive: false }); window.addEventListener('touchend', () => { isPanningRef.current = false; setPanTarget(null); lastTouchPos.current = null; lastPinchDist.current = null; });
    return () => { window.removeEventListener('mousemove', handleMouseMoveRaw); window.removeEventListener('mouseup', handleMouseUp); window.removeEventListener('touchmove', handleTouchMoveRaw); };
  }, [handleMouseMoveRaw, handleTouchMoveRaw, activeXAxesUsed, activeYAxes, width, height, padding, startAnimation, isShiftPressed, xAxes, measureRange]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(e.type === 'keydown'); if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.type === 'keyup') pressedKeys.current.delete(e.key); else {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.ctrlKey && ['+', '-', '=', '_'].includes(e.key)) e.preventDefault();
        pressedKeys.current.add(e.key); const step = 0.15;
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { const axes = (hoveredXAxisIdRef.current && !e.shiftKey) ? activeXAxesUsed.filter(a => a.id === hoveredXAxisIdRef.current) : activeXAxesUsed; axes.forEach(a => { const t = targetXAxes.current[a.id] || { min: a.min, max: a.max }, r = t.max - t.min, d = e.key === 'ArrowLeft' ? -1 : 1; targetXAxes.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step }; }); startAnimation(); }
        else if (['ArrowUp', 'ArrowDown'].includes(e.key)) { const axes = hoveredAxisIdRef.current ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes, d = (hoveredAxisIdRef.current ? -1 : 1) * (e.key === 'ArrowUp' ? 1 : -1); axes.forEach(a => { const t = targetYs.current[a.id] || { min: a.min, max: a.max }, r = t.max - t.min; targetYs.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step }; }); startAnimation(); }
        else if (['+', '-'].includes(e.key)) startAnimation();
      }
    };
    window.addEventListener('keydown', handleKey); window.addEventListener('keyup', handleKey); return () => { window.removeEventListener('keydown', handleKey); window.removeEventListener('keyup', handleKey); };
  }, [activeYAxes, activeXAxesUsed, startAnimation]);

  const xAxesLayout = useMemo(() => {
    const activeDsIds = new Set(series.map(s => s.sourceId)), dsByX = {} as any, dsToX = {} as any;
    datasets.forEach(d => { if (activeDsIds.has(d.id)) { const xId = d.xAxisId || 'axis-1'; dsToX[d.id] = xId; if (!dsByX[xId]) dsByX[xId] = []; dsByX[xId].push(d); } });
    const sByX = {} as any; series.forEach(s => { const xId = dsToX[s.sourceId]; if (xId) { if (!sByX[xId]) sByX[xId] = []; sByX[xId].push(s); } });
    return activeXAxesUsed.map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date', dss = dsByX[axis.id] || [], srs = sByX[axis.id] || [], title = Array.from(new Set(dss.map((d: any) => d.xAxisColumn))).join(' / '), color = srs[0]?.lineColor || '#475569';
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false }, title, color };
      if (!isDate) {
        let step; if (isPanningRef.current && lockedXSteps.current[axis.id]?.step) step = lockedXSteps.current[axis.id].step!;
        else { const mt = Math.max(2, Math.floor(chartWidth / 60)), s = r / mt, mag = Math.pow(10, Math.floor(Math.log10(Math.abs(s) || 1))), ns = s / mag; step = (ns < 1.5 ? 1 : ns < 3 ? 2 : ns < 7 ? 5 : 10) * mag; lockedXSteps.current[axis.id] = { step }; }
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false }, title, color };
        const pr = Math.max(0, -Math.floor(Math.log10(step))), f = Math.ceil((axis.min - step) / step) * step, res = []; for (let t = f; t <= axis.max + step; t += step) { if (res.length > 200) break; res.push(t); }
        return { id: axis.id, ticks: { result: res, step, precision: pr, isXDate: false }, title, color };
      } else {
        let ts; if (isPanningRef.current && lockedXSteps.current[axis.id]?.timeStep) ts = lockedXSteps.current[axis.id].timeStep!; else { ts = getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80))); lockedXSteps.current[axis.id] = { timeStep: ts }; }
        return { id: axis.id, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets]);

  return (
    <main className="plot-area" ref={containerRef} onMouseDown={(e) => handleMouseDown(e, 'all')} onTouchStart={(e) => handleTouchStart(e, 'all')} onWheel={(e) => handleWheel(e, 'all')} style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : (isShiftPressed || measureRange ? 'ew-resize' : 'crosshair')), backgroundColor: '#fff', overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}>
      {datasets.length === 0 && <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, pointerEvents: 'none', color: '#ccc', fontSize: '2rem', fontWeight: 'bold', textTransform: 'uppercase' }}>No data</div>}
      <GridLines xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} />
      <div style={{ position: 'absolute', inset: 0, zIndex: 1 }}><WebGLRenderer datasets={datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} isInteracting={isPanningRef.current || isAnimating.current} highlightedSeriesId={highlightedSeriesId} /></div>
      <AxesLayer xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} leftAxes={activeYAxesLayout.filter(a => a.position === 'left')} rightAxes={activeYAxesLayout.filter(a => a.position === 'right')} series={series} axisLayout={axisLayout} allXAxes={xAxes} xAxesMetrics={xAxesMetrics} />
      {xAxesMetrics.map(m => { const bY = padding.bottom - m.cumulativeOffset - m.height; return <div key={`wheel-x-${m.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { xAxisId: m.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { xAxisId: m.id }); }} onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, { xAxisId: m.id }); }} onDoubleClick={(e) => { e.stopPropagation(); handleAutoScaleX(m.id); }} style={{ position: 'absolute', bottom: bY, left: padding.left, right: padding.right, height: m.height, cursor: 'ew-resize', zIndex: 20 }} />; })}
      {activeYAxes.map(a => { const isL = a.position === 'left', am = axisLayout[a.id] || { total: 40 }; let xP = isL ? padding.left - (leftOffsets[a.id] ?? 0) - am.total : width - padding.right + (rightOffsets[a.id] ?? 0); return <div key={`wheel-${a.id}`} onWheel={(e) => { e.stopPropagation(); handleWheel(e, { yAxisId: a.id }); }} onMouseDown={(e) => { e.stopPropagation(); handleMouseDown(e, { yAxisId: a.id }); }} onTouchStart={(e) => { e.stopPropagation(); handleTouchStart(e, { yAxisId: a.id }); }} onDoubleClick={(e) => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); handleAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined); }} style={{ position: 'absolute', left: xP, top: padding.top, width: am.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />; })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} xAxes={xAxes} yAxes={activeYAxes} datasets={datasets} series={series} measureRange={measureRange} />
      {zoomBoxState && <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
    </main>
  );
};

export default ChartContainer;
