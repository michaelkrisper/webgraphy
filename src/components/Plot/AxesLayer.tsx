import React, { useMemo, useImperativeHandle, forwardRef, useState } from 'react';
import { type SeriesConfig } from '../../services/persistence';
import { type SecondaryLabel } from '../../utils/time';
import { type XAxisLayout, type YAxisLayout, type XAxisMetrics } from './chartTypes';

export interface AxesLayerHandle {
  redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => void;
}

interface AxesLayerProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisLayout[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  series: SeriesConfig[];
  axisLayout: Record<string, { total: number; label: number }>;
  xAxesMetrics: XAxisMetrics[];
  axisColor: string;
  zeroLineColor: string;
  labelColor: string;
  secLabelBg: string;
  leftOffsets: Record<string, number>;
  rightOffsets: Record<string, number>;
}

const AxesLayer = React.memo(forwardRef<AxesLayerHandle, AxesLayerProps>(({ 
  xAxes: initialXAxes, yAxes: initialYAxes, width, height, padding, series, axisLayout, 
  xAxesMetrics, labelColor, secLabelBg, leftOffsets, rightOffsets 
}: AxesLayerProps, ref) => {
  const [currentXAxes, setCurrentXAxes] = useState<XAxisLayout[]>(initialXAxes);
  const [currentYAxes, setCurrentYAxes] = useState<YAxisLayout[]>(initialYAxes);

  React.useEffect(() => {
    setCurrentXAxes(initialXAxes);
    setCurrentYAxes(initialYAxes);
  }, [initialXAxes, initialYAxes]);

  useImperativeHandle(ref, () => ({
    redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
      setCurrentXAxes(xAxes);
      setCurrentYAxes(yAxes);
    },
  }), []);

  const isMobile = width < 768 || height < 500;

  const seriesByYAxisId = useMemo(() => {
    const grouped: Record<string, SeriesConfig[]> = {};
    for (const s of series) {
      if (!grouped[s.yAxisId]) grouped[s.yAxisId] = [];
      grouped[s.yAxisId].push(s);
    }
    return grouped;
  }, [series]);

  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  return (
    <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6, overflow: 'hidden' }}>
      {/* X Axes Labels & Titles */}
      {currentXAxes.map((axis, axisIdx) => {
        const metrics = xAxesMetrics[axisIdx];
        if (!metrics) return null;
        const baseY = padding.bottom - metrics.cumulativeOffset;

        return (
          <React.Fragment key={axis.id}>
            {/* Primary Labels */}
            {axis.ticks.result.map((t, i) => {
              const timestamp = typeof t === 'number' ? t : t.timestamp;
              const normX = (timestamp - axis.min) / (axis.max - axis.min);
              if (normX < 0 || normX > 1) return null;
              const x = padding.left + normX * chartWidth;
              const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : t.label;
              return (
                <div 
                  key={i} 
                  style={{ 
                    position: 'absolute', 
                    left: x, 
                    bottom: baseY - metrics.labelBottom + (isMobile ? 10 : 9),
                    transform: 'translateX(-50%)',
                    color: axis.color || labelColor,
                    fontSize: isMobile ? '10px' : '9px',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  {label}
                </div>
              );
            })}

            {/* Secondary Labels */}
            {axis.ticks.secondaryLabels?.map((sl: SecondaryLabel, i: number) => {
              const nextSl = axis.ticks.secondaryLabels![i + 1];
              const normX = (sl.timestamp - axis.min) / (axis.max - axis.min);
              const nextNormX = nextSl ? (nextSl.timestamp - axis.min) / (axis.max - axis.min) : 1.5;
              
              const currentX = padding.left + normX * chartWidth;
              const nextX = padding.left + nextNormX * chartWidth;
              
              if (currentX > width - padding.right || nextX < padding.left) return null;

              // Simplified positioning for HTML
              const x = Math.max(currentX + 5, padding.left + 5);
              
              return (
                <div 
                  key={i} 
                  style={{ 
                    position: 'absolute', 
                    left: x, 
                    bottom: baseY - metrics.secLabelBottom,
                    backgroundColor: secLabelBg,
                    color: axis.color || labelColor,
                    fontSize: '10px',
                    fontWeight: 'bold',
                    padding: '1px 4px',
                    borderLeft: currentX > padding.left ? `2px solid ${axis.color || labelColor}` : 'none',
                    whiteSpace: 'nowrap',
                    fontFamily: 'system-ui, -apple-system, sans-serif'
                  }}
                >
                  {sl.label}
                </div>
              );
            })}

            {/* Axis Title */}
            <div 
              style={{ 
                position: 'absolute', 
                left: padding.left + chartWidth / 2, 
                bottom: baseY - metrics.titleBottom + (isMobile ? 14 : 12),
                transform: 'translateX(-50%)',
                color: axis.color || labelColor,
                fontSize: isMobile ? '14px' : '12px',
                fontWeight: 'bold',
                fontFamily: 'system-ui, -apple-system, sans-serif'
              }}
            >
              {axis.title}
            </div>
          </React.Fragment>
        );
      })}

      {/* Y Axes Labels & Titles */}
      {currentYAxes.map((axis) => {
        const isLeft = axis.position === 'left';
        const metrics = axisLayout[axis.id] || { total: 40, label: 30 };
        const axisSeries = seriesByYAxisId[axis.id] || [];

        let xPos = 0;
        if (isLeft) {
          xPos = padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total;
        } else {
          xPos = width - padding.right + (rightOffsets[axis.id] ?? 0);
        }
        
        const spineX = isLeft ? xPos + metrics.total : xPos;
        const labelX = isLeft ? spineX - 7 : spineX + 7;
        const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

        return (
          <React.Fragment key={axis.id}>
            {/* Y Labels */}
            {axis.ticks.map((t, i) => {
              const normY = (t - axis.min) / (axis.max - axis.min);
              if (normY < 0 || normY > 1) return null;
              const y = padding.top + (1 - normY) * chartHeight;
              const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.precision);
              return (
                <div 
                  key={i} 
                  style={{ 
                    position: 'absolute', 
                    [isLeft ? 'right' : 'left']: isLeft ? width - labelX : labelX, 
                    top: y,
                    transform: 'translateY(-50%)',
                    color: labelColor,
                    fontSize: isMobile ? '10px' : '9px',
                    fontFamily: 'system-ui, -apple-system, sans-serif',
                    textAlign: isLeft ? 'right' : 'left'
                  }}
                >
                  {label}
                </div>
              );
            })}

            {/* Y Axis Title */}
            <div 
              style={{ 
                position: 'absolute', 
                [isLeft ? 'left' : 'right']: isLeft ? titleX : width - titleX,
                top: padding.top + chartHeight / 2,
                transform: `translate(${isLeft ? '-50%' : '50%'}, -50%) rotate(${isLeft ? -90 : 90}deg)`,
                fontSize: isMobile ? '14px' : '12px',
                fontWeight: 'bold',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                display: 'flex',
                gap: '4px',
                whiteSpace: 'nowrap'
              }}
            >
              {axisSeries.map((s, i) => (
                <span key={s.id}>
                  {i > 0 && <span style={{ color: labelColor }}> / </span>}
                  <span style={{ color: s.lineColor }}>{s.name || s.yColumn}</span>
                </span>
              ))}
            </div>
          </React.Fragment>
        );
      })}
    </div>
  );
}));

AxesLayer.displayName = 'AxesLayer';
export { AxesLayer };
export type { AxesLayerProps };
