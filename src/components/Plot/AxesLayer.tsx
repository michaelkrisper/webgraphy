// src/components/Plot/AxesLayer.tsx
import React, { useMemo } from 'react';
import { worldToScreen } from '../../utils/coords';
import { type XAxisConfig, type SeriesConfig } from '../../services/persistence';
import { type SecondaryLabel } from '../../utils/time';
import { type XAxisLayout, type YAxisLayout, type XAxisMetrics } from './chartTypes';

interface AxesLayerProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisLayout[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  series: SeriesConfig[];
  axisLayout: Record<string, { total: number; label: number }>;
  allXAxes: XAxisConfig[];
  xAxesMetrics: XAxisMetrics[];
  axisColor: string;
  zeroLineColor: string;
  labelColor: string;
  secLabelBg: string;
  leftOffsets: Record<string, number>;
  rightOffsets: Record<string, number>;
}

const AxesLayer = React.memo(({ xAxes, yAxes, width, height, padding, series, axisLayout, allXAxes, xAxesMetrics, axisColor, zeroLineColor, labelColor, secLabelBg, leftOffsets, rightOffsets }: AxesLayerProps) => {
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

  return (
    <>
      <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6 }}>
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse" markerUnits="userSpaceOnUse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={axisColor} />
          </marker>
        </defs>

        <path
          d={`M${padding.left},${height - padding.bottom} V${padding.top} H${width - padding.right} V${height - padding.bottom}`}
          fill="none"
          stroke={axisColor}
          strokeWidth="2"
        />

        {xAxes.map((axis, idx) => {
          const axisConf = mainXConf.id === axis.id ? mainXConf : allXAxesById.get(axis.id)!;
          const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
          const metrics = xAxesMetrics[idx];
          const y = height - padding.bottom + metrics.cumulativeOffset;
          return (
            <g key={`x-axis-spine-${axis.id}`}>
              <line x1={padding.left} y1={y} x2={width - padding.right + 8} y2={y} stroke={axisColor} strokeWidth="1" markerEnd="url(#arrow)" />
              {axis.ticks.result.map((t) => {
                const ts = typeof t === 'number' ? t : (t as { timestamp: number }).timestamp;
                const { x } = worldToScreen(ts, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                return <line key={`xt-${axis.id}-${ts}`} x1={x} y1={y} x2={x} y2={y + 6} stroke={axisColor} strokeWidth="1" />;
              })}
              {axisConf.min <= 0 && axisConf.max >= 0 && idx === 0 && (
                <line x1={worldToScreen(0, 0, vp).x} y1={height - padding.bottom} x2={worldToScreen(0, 0, vp).x} y2={padding.top - 8} stroke={zeroLineColor} strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#arrow)" />
              )}
            </g>
          );
        })}

        {yAxes.length > 0 && (() => {
          const mainAxis = yAxes[0];
          const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
          if (mainAxis.min <= 0 && mainAxis.max >= 0) {
            return (
              <line x1={padding.left} y1={worldToScreen(mainXConf.min, 0, axisVp).y} x2={width - padding.right + 8} y2={worldToScreen(mainXConf.min, 0, axisVp).y} stroke={zeroLineColor} strokeWidth="1" strokeDasharray="4 4" markerEnd="url(#arrow)" />
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
              <line x1={axisLineX} y1={height - padding.bottom} x2={axisLineX} y2={padding.top - 8} stroke={axisColor} strokeWidth="1" markerEnd="url(#arrow)" />
              {axis.ticks.map(t => {
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
                if (y < padding.top || y > height - padding.bottom) return null;
                const x1 = isLeft ? axisLineX - 5 : axisLineX;
                const x2 = isLeft ? axisLineX : axisLineX + 5;
                return <line key={`yt-${axis.id}-${t}`} x1={x1} y1={y} x2={x2} y2={y} stroke={axisColor} strokeWidth="1" />;
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
                    <div key={`sl-${axis.id}-${sl.timestamp}`} style={{ position: 'absolute', left: x, bottom: baseY - metrics.secLabelBottom, fontSize: '10px', fontWeight: 'bold', color: axis.color, backgroundColor: secLabelBg, padding: '1px 4px', borderRadius: '0', whiteSpace: 'nowrap', borderLeft: currentX > padding.left ? `2px solid ${axis.color}` : 'none', zIndex: 10 }}>{sl.label}</div>
                  );
                }
                return null;
              })}
              {axis.ticks.result.map((t) => {
                const timestamp = typeof t === 'number' ? t : (t as { timestamp: number }).timestamp;
                const { x } = worldToScreen(timestamp, 0, vp);
                if (x < padding.left || x > width - padding.right) return null;
                const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : (t as { label: string }).label;
                return <div key={`xl-${axis.id}-${timestamp}`} style={{ position: 'absolute', left: x, bottom: baseY - metrics.labelBottom, transform: 'translateX(-50%)', fontSize: isMobile ? '10px' : '9px', color: axis.color }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', bottom: baseY - metrics.titleBottom, left: padding.left + (width - padding.left - padding.right) / 2, transform: 'translateX(-50%)', fontSize: isMobile ? '14px' : '12px', fontWeight: 'bold', color: axis.color, whiteSpace: 'nowrap', maxWidth: width - padding.left - padding.right, overflow: 'hidden', textOverflow: 'ellipsis' }}>{axis.title}</div>
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
          const axisSeries = seriesByYAxisId[axis.id] || [];
          const spineX = isLeft ? xPos + axisMetrics.total : xPos;
          const labelX = isLeft ? spineX - 7 - axisMetrics.label : spineX + 7;
          const titleX = isLeft ? xPos + 7.5 : xPos + axisMetrics.total - 7.5;
          return (
            <React.Fragment key={axis.id}>
              {axis.ticks.map(t => {
                const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
                if (y < padding.top || y > height - padding.bottom) return null;
                const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.precision);
                return <div key={`yl-${axis.id}-${t}`} style={{ position: 'absolute', left: labelX, top: y, transform: 'translateY(-50%)', fontSize: isMobile ? '10px' : '9px', color: labelColor, width: axisMetrics.label, textAlign: isLeft ? 'right' : 'left' }}>{label}</div>;
              })}
              <div style={{ position: 'absolute', top: padding.top + chartHeight / 2, left: titleX, transform: `translate(-50%, -50%) rotate(${isLeft ? -90 : 90}deg)`, fontSize: isMobile ? '14px' : '12px', fontWeight: 'bold', color: labelColor, padding: '2px 4px', borderRadius: '0', whiteSpace: 'nowrap', textAlign: 'center', maxWidth: chartHeight, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {axisSeries.map((s, i) => (
                  <React.Fragment key={s.id}>
                    {i > 0 && <span style={{ color: labelColor }}> / </span>}
                    <span style={{ color: s.lineColor }}>{s.name || s.yColumn}</span>
                  </React.Fragment>
                ))}
              </div>
            </React.Fragment>
          );
        })}
      </div>
    </>
  );
});

AxesLayer.displayName = 'AxesLayer';
export { AxesLayer };
export type { AxesLayerProps };
