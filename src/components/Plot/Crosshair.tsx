// src/components/Plot/Crosshair.tsx
import React, { useState, useEffect, useMemo } from 'react';
import { worldToScreen, screenToWorld } from '../../utils/coords';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../../services/persistence';
import { formatFullDate } from '../../utils/time';
import { getColumnIndex } from '../../utils/columns';

const SNAP_PX = 30;

interface SeriesMetadata {
  series: SeriesConfig;
  ds: Dataset;
  axis: YAxisConfig;
  xAxis: XAxisConfig;
  xIdx: number;
  yIdx: number;
  xCol: { data: Float32Array; refPoint: number };
  yCol: { data: Float32Array; refPoint: number };
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
  tooltipColor: string;
  snapLineColor: string;
  tooltipDividerColor: string;
  tooltipSubColor: string;
}

const Crosshair = React.memo(({ containerRef, padding, width, height, isPanning, xAxes, yAxes, datasets, series, tooltipColor, snapLineColor, tooltipDividerColor, tooltipSubColor }: CrosshairProps) => {
  const [pos, setPos] = useState<{ x: number, y: number } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
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

  const datasetsById = useMemo(() => {
    const map = new Map<string, Dataset>();
    datasets.forEach(d => map.set(d.id, d));
    return map;
  }, [datasets]);

  const yAxesById = useMemo(() => {
    const map = new Map<string, YAxisConfig>();
    yAxes.forEach(a => map.set(a.id, a));
    return map;
  }, [yAxes]);

  const xAxesById = useMemo(() => {
    const map = new Map<string, XAxisConfig>();
    xAxes.forEach(a => map.set(a.id, a));
    return map;
  }, [xAxes]);

  const seriesMetadata = useMemo(() => {
    return series.filter(s => !s.hidden).map(s => {
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
    }).filter(Boolean) as SeriesMetadata[];
  }, [datasetsById, yAxesById, xAxesById, series]);

  const snapMetadata = useMemo(() => {
    if (seriesMetadata.length === 0) return null;
    const xAxisConf = seriesMetadata[0].xAxis;
    if (!xAxisConf) return null;
    return { xAxisConf };
  }, [seriesMetadata]);

  const snap = useMemo(() => {
    if (!pos || !snapMetadata || seriesMetadata.length === 0) return null;
    const { xAxisConf } = snapMetadata;
    const xWorldPerPx = (xAxisConf.max - xAxisConf.min) / Math.max(1, width - padding.left - padding.right);
    const xSnapWorld = SNAP_PX * xWorldPerPx;
    let bestDist = Infinity;
    let bestXWorld: number | null = null;
    let bestSeriesXConf: XAxisConfig | null = null;
    const closestIdxByDataset = new Map<string, number>();

    seriesMetadata.forEach(({ ds, xAxis, xCol }) => {
      let cachedIdx = closestIdxByDataset.get(ds.id);
      const xData = xCol.data;
      const refX = xCol.refPoint;
      if (cachedIdx === undefined) {
        const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
        const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
        let lo = 0, hi = xData.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >>> 1;
          if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1; else hi = mid;
        }
        let bestI = lo;
        if (lo > 0 && Math.abs(xData[lo - 1] + refX - sMouseWorld.x) < Math.abs(xData[lo] + refX - sMouseWorld.x)) bestI = lo - 1;
        cachedIdx = bestI;
        closestIdxByDataset.set(ds.id, cachedIdx);
      }
      const sVp = { xMin: xAxis.min, xMax: xAxis.max, yMin: 0, yMax: 100, width, height, padding };
      const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
      for (const i of [cachedIdx - 1, cachedIdx, cachedIdx + 1]) {
        if (i < 0 || i >= xData.length) continue;
        const wx = xData[i] + refX;
        const d = Math.abs(wx - sMouseWorld.x);
        if (d < bestDist) { bestDist = d; bestXWorld = wx; bestSeriesXConf = xAxis; }
      }
    });

    if (bestXWorld === null || !bestSeriesXConf || bestDist > xSnapWorld) return null;
    const finalBestXWorld = bestXWorld as number;
    const finalXConf = bestSeriesXConf as XAxisConfig;
    const entriesMap = new Map<string, { xLabel: string; xAxisName: string; items: { label: string; value: number; color: string }[] }>();

    seriesMetadata.forEach(({ series: s, ds, xAxis, xCol, yCol }) => {
      const xData = xCol.data, yData = yCol.data;
      const refX = xCol.refPoint, refY = yCol.refPoint;
      const bestI = closestIdxByDataset.get(ds.id) as number;
      const yVal = yData[bestI] + refY;
      const xVal = xData[bestI] + refX;
      const label = s.name || s.yColumn;
      const xLab = xAxis.xMode === 'date'
        ? formatFullDate(xVal)
        : parseFloat(xVal.toPrecision(7)).toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 10 });
      const xAxisName = ds.xAxisColumn || xAxis.name || `X-Axis ${ds.xAxisId}`;
      const groupKey = `${xLab}|${xAxisName}`;
      let group = entriesMap.get(groupKey);
      if (!group) { group = { xLabel: xLab, xAxisName, items: [] }; entriesMap.set(groupKey, group); }
      group.items.push({ label, value: yVal, color: s.lineColor || '#333' });
    });

    const entries = Array.from(entriesMap.values());
    const snapScreenX = worldToScreen(finalBestXWorld, 0, { xMin: finalXConf.min, xMax: finalXConf.max, yMin: 0, yMax: 100, width, height, padding }).x;
    return { snapScreenX, entries };
  }, [pos, seriesMetadata, width, height, padding, snapMetadata]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && (e.key === 'c' || e.key === 'C')) {
        if (!snap) return;
        const text = snap.entries.map(g => {
          const itemsText = g.items.map(i => `${i.label}: ${i.value.toLocaleString(undefined, { maximumSignificantDigits: 7 })}`).join('\n');
          return `${g.xAxisName}: ${g.xLabel}\n${itemsText}`;
        }).join('\n\n');
        navigator.clipboard.writeText(text);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [snap]);

  if (isPanning || !pos) return null;

  return (
    <>
      <svg width="100%" height="100%" className="chart-abs-fill" style={{ zIndex: 15 }}>
        {snap && <line x1={snap.snapScreenX} y1={padding.top} x2={snap.snapScreenX} y2={height - padding.bottom} stroke={snapLineColor} strokeWidth="1" strokeDasharray="3 3" />}
      </svg>
      {snap && (
        <div className="chart-tooltip" style={{ left: snap.snapScreenX + 12, top: (pos?.y || 0) + 15, whiteSpace: 'pre', boxShadow: '0 10px 15px -3px var(--shadow)' }}>
          {snap.entries.map((group, groupIdx) => (
            <React.Fragment key={`group-${groupIdx}`}>
              <div style={{ color: tooltipSubColor, fontSize: '9px', borderTop: groupIdx > 0 ? `1px solid ${tooltipDividerColor}` : 'none', paddingTop: groupIdx > 0 ? '4px' : 0, marginTop: groupIdx > 0 ? '4px' : 0 }}>
                <span className="chart-tooltip-x-label" style={{ color: tooltipColor }}>{group.xAxisName}: {group.xLabel}</span>
              </div>
              {group.items.map((item, itemIdx) => (
                <div key={`item-${groupIdx}-${itemIdx}`} className="chart-tooltip-item" style={{ color: item.color }}>
                  <span>{item.label}:</span>
                  <span className="chart-tooltip-value" style={{ color: tooltipColor }}>{parseFloat(item.value.toPrecision(7)).toLocaleString()}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
      )}
    </>
  );
});

Crosshair.displayName = 'Crosshair';
export { Crosshair };
export type { CrosshairProps };
