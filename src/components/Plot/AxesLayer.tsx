import React, { useMemo, useImperativeHandle, forwardRef, useRef, useEffect } from 'react';
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
  gridColor: string;
  plotBg: string;
  labelColor: string;
  secLabelBg: string;
  leftOffsets: Record<string, number>;
  rightOffsets: Record<string, number>;
}

const AxesLayer = React.memo(forwardRef<AxesLayerHandle, AxesLayerProps>(({
  xAxes: initialXAxes, yAxes: initialYAxes, width, height, padding, series, axisLayout,
  xAxesMetrics, axisColor, zeroLineColor, gridColor, plotBg, labelColor, secLabelBg, leftOffsets, rightOffsets
}: AxesLayerProps, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gridCanvasRef = useRef<HTMLCanvasElement>(null);

  const lastXAxes = useRef<XAxisLayout[]>(initialXAxes);
  const lastYAxes = useRef<YAxisLayout[]>(initialYAxes);

  const seriesByYAxisId = useMemo(() => {
    const grouped: Record<string, SeriesConfig[]> = {};
    for (const s of series) {
      if (!grouped[s.yAxisId]) grouped[s.yAxisId] = [];
      grouped[s.yAxisId].push(s);
    }
    return grouped;
  }, [series]);

  const drawGrid = (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
    const canvas = gridCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.fillStyle = plotBg;
    ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
    ctx.strokeStyle = gridColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    xAxes.forEach((axis, idx) => {
      if (idx === 0) {
        axis.ticks.result.forEach(t => {
          const ts = typeof t === 'number' ? t : t.timestamp;
          const normX = (ts - axis.min) / (axis.max - axis.min);
          if (normX >= 0 && normX <= 1) {
            const x = padding.left + normX * chartWidth;
            ctx.moveTo(x, padding.top);
            ctx.lineTo(x, height - padding.bottom);
          }
        });
      }
    });
    yAxes.forEach(axis => {
      if (axis.showGrid) {
        axis.ticks.forEach(t => {
          const normY = (t - axis.min) / (axis.max - axis.min);
          if (normY >= 0 && normY <= 1) {
            const y = (height - padding.bottom) - normY * chartHeight;
            ctx.moveTo(padding.left, y);
            ctx.lineTo(width - padding.right, y);
          }
        });
      }
    });
    ctx.stroke();
    ctx.restore();
  };

  const draw = (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
    drawGrid(xAxes, yAxes);

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const isMobile = width < 768 || height < 500;
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    ctx.save();
    ctx.scale(dpr, dpr);

    // --- Axis Frame & Ticks ---
    ctx.strokeStyle = axisColor;
    ctx.fillStyle = axisColor;
    ctx.lineWidth = 1;

    // Main frame spines
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(width - padding.right, padding.top);
    ctx.moveTo(width - padding.right, padding.top);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // X Axes lines + ticks + arrows
    xAxes.forEach((axis, idx) => {
      const metrics = xAxesMetrics[idx];
      if (!metrics) return;
      const y = height - padding.bottom + metrics.cumulativeOffset;
      // Axis line
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right + 8, y);
      ctx.stroke();
      // Arrow at right end
      const size = 6;
      ctx.beginPath();
      ctx.moveTo(width - padding.right + 8, y);
      ctx.lineTo(width - padding.right + 8 - size, y - size / 2);
      ctx.lineTo(width - padding.right + 8 - size, y + size / 2);
      ctx.closePath();
      ctx.fill();
      // Tick marks
      ctx.beginPath();
      axis.ticks.result.forEach(t => {
        const ts = typeof t === 'number' ? t : t.timestamp;
        const normX = (ts - axis.min) / (axis.max - axis.min);
        if (normX >= 0 && normX <= 1) {
          const x = padding.left + normX * chartWidth;
          ctx.moveTo(x, y);
          ctx.lineTo(x, y + 6);
        }
      });
      ctx.stroke();
    });

    // Zero line (from first X axis)
    if (xAxes.length > 0) {
      const axis = xAxes[0];
      if (axis.min <= 0 && axis.max >= 0) {
        const normX = (0 - axis.min) / (axis.max - axis.min);
        const x = padding.left + normX * chartWidth;
        ctx.strokeStyle = zeroLineColor;
        ctx.fillStyle = zeroLineColor;
        ctx.beginPath();
        ctx.moveTo(x, height - padding.bottom);
        ctx.lineTo(x, padding.top - 8);
        ctx.stroke();
        // Arrow pointing up
        const size = 6;
        ctx.beginPath();
        ctx.moveTo(x, padding.top - 8);
        ctx.lineTo(x - size / 2, padding.top - 8 + size);
        ctx.lineTo(x + size / 2, padding.top - 8 + size);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = axisColor;
        ctx.fillStyle = axisColor;
      }
    }

    // Y Axes lines + ticks + arrows
    yAxes.forEach(axis => {
      const isLeft = axis.position === 'left';
      const metrics = axisLayout[axis.id] || { total: 40 };
      const xPos = isLeft
        ? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
        : width - padding.right + (rightOffsets[axis.id] ?? 0);
      const axisLineX = isLeft ? xPos + metrics.total : xPos;

      // Axis spine line
      ctx.beginPath();
      ctx.moveTo(axisLineX, height - padding.bottom);
      ctx.lineTo(axisLineX, padding.top - 8);
      ctx.stroke();
      // Arrow pointing up
      const size = 6;
      ctx.beginPath();
      ctx.moveTo(axisLineX, padding.top - 8);
      ctx.lineTo(axisLineX - size / 2, padding.top - 8 + size);
      ctx.lineTo(axisLineX + size / 2, padding.top - 8 + size);
      ctx.closePath();
      ctx.fill();
      // Tick marks
      ctx.beginPath();
      axis.ticks.forEach(t => {
        const normY = (t - axis.min) / (axis.max - axis.min);
        if (normY >= 0 && normY <= 1) {
          const y = (height - padding.bottom) - normY * chartHeight;
          const x1 = isLeft ? axisLineX - 5 : axisLineX;
          const x2 = isLeft ? axisLineX : axisLineX + 5;
          ctx.moveTo(x1, y);
          ctx.lineTo(x2, y);
        }
      });
      ctx.stroke();
    });

    // X Axes
    xAxes.forEach((axis, axisIdx) => {
      const metrics = xAxesMetrics[axisIdx];
      if (!metrics) return;
      const baseY = height - padding.bottom + metrics.cumulativeOffset;

      ctx.font = `${isMobile ? 10 : 9}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = axis.color || labelColor;

      // Primary Labels
      axis.ticks.result.forEach((t) => {
        const timestamp = typeof t === 'number' ? t : t.timestamp;
        const normX = (timestamp - axis.min) / (axis.max - axis.min);
        if (normX < 0 || normX > 1) return;
        const x = padding.left + normX * chartWidth;
        const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : t.label;
        ctx.fillText(label, x, baseY + metrics.labelBottom - (isMobile ? 10 : 9));
      });

      // Secondary Labels
      if (axis.ticks.secondaryLabels) {
        ctx.font = 'bold 10px system-ui, -apple-system, sans-serif';
        ctx.textAlign = 'left';
        axis.ticks.secondaryLabels.forEach((sl: SecondaryLabel, i: number) => {
          const nextSl = axis.ticks.secondaryLabels![i + 1];
          const normX = (sl.timestamp - axis.min) / (axis.max - axis.min);
          const nextNormX = nextSl ? (nextSl.timestamp - axis.min) / (axis.max - axis.min) : 1.5;
          
          const currentX = padding.left + normX * chartWidth;
          const nextX = padding.left + nextNormX * chartWidth;
          
          if (currentX > width - padding.right || nextX < padding.left) return;

          const x = Math.max(currentX + 5, padding.left + 5);
          
          // Draw background for secondary label
          const textWidth = ctx.measureText(sl.label).width;
          const rectY = baseY + metrics.secLabelBottom - 14;
          ctx.fillStyle = secLabelBg;
          ctx.fillRect(x - 2, rectY, textWidth + 4, 14);
          
          // Draw border
          if (currentX > padding.left) {
            ctx.strokeStyle = axis.color || labelColor;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(currentX, rectY);
            ctx.lineTo(currentX, rectY + 14);
            ctx.stroke();
          }

          ctx.fillStyle = axis.color || labelColor;
          ctx.fillText(sl.label, x, baseY + metrics.secLabelBottom);
        });
      }

      // Axis Title
      ctx.font = `bold ${isMobile ? 14 : 12}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillStyle = axis.color || labelColor;
      ctx.fillText(axis.title, padding.left + chartWidth / 2, baseY + metrics.titleBottom - (isMobile ? 14 : 12));
    });

    // Y Axes
    yAxes.forEach((axis) => {
      const isLeft = axis.position === 'left';
      const metrics = axisLayout[axis.id] || { total: 40, label: 30 };
      const axisSeries = seriesByYAxisId[axis.id] || [];

      const xPos = isLeft 
        ? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
        : width - padding.right + (rightOffsets[axis.id] ?? 0);
      
      const spineX = isLeft ? xPos + metrics.total : xPos;
      const labelX = isLeft ? spineX - 7 : spineX + 7;
      const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

      ctx.font = `${isMobile ? 10 : 9}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = isLeft ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = labelColor;

      // Y Labels
      axis.ticks.forEach((t) => {
        const normY = (t - axis.min) / (axis.max - axis.min);
        if (normY < 0 || normY > 1) return;
        const y = padding.top + (1 - normY) * chartHeight;
        const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.precision);
        ctx.fillText(label, labelX, y);
      });

      // Y Axis Title
      ctx.save();
      ctx.translate(titleX, padding.top + chartHeight / 2);
      ctx.rotate((isLeft ? -90 : 90) * Math.PI / 180);
      
      ctx.font = `bold ${isMobile ? 14 : 12}px system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      
      let currentX = 0;
      const totalWidth = axisSeries.reduce((acc, s, i) => {
        const separatorWidth = (i > 0 && axisSeries.length > 1) ? ctx.measureText(' / ').width : 0;
        return acc + separatorWidth + ctx.measureText(s.name || s.yColumn).width;
      }, 0);
      
      currentX = -totalWidth / 2;
      
      axisSeries.forEach((s, i) => {
        if (i > 0 && axisSeries.length > 1) {
          ctx.fillStyle = labelColor;
          const sep = ' / ';
          ctx.fillText(sep, currentX + ctx.measureText(sep).width / 2, 0);
          currentX += ctx.measureText(sep).width;
        }
        ctx.fillStyle = s.lineColor;
        const name = s.name || s.yColumn;
        ctx.fillText(name, currentX + ctx.measureText(name).width / 2, 0);
        currentX += ctx.measureText(name).width;
      });
      ctx.restore();
    });

    ctx.restore();
  };

  useImperativeHandle(ref, () => ({
    redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
      lastXAxes.current = xAxes;
      lastYAxes.current = yAxes;
      draw(xAxes, yAxes);
    },
  }), [width, height, padding, axisLayout, xAxesMetrics, axisColor, zeroLineColor, gridColor, plotBg, labelColor, secLabelBg, leftOffsets, rightOffsets, seriesByYAxisId]);

  useEffect(() => {
    draw(initialXAxes, initialYAxes);
  }, [initialXAxes, initialYAxes, width, height, padding]);

  const dpr = window.devicePixelRatio || 1;

  return (
    <>
      <canvas
        ref={gridCanvasRef}
        width={width * dpr}
        height={height * dpr}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
      />
      <canvas
        ref={canvasRef}
        width={width * dpr}
        height={height * dpr}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
          zIndex: 6
        }}
      />
    </>
  );
}));

AxesLayer.displayName = 'AxesLayer';
export { AxesLayer };
export type { AxesLayerProps };
