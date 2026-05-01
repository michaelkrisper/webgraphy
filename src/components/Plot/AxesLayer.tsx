import React, { useEffect, useRef, useMemo, useImperativeHandle, forwardRef } from 'react';
import { worldToScreen } from '../../utils/coords';
import { type XAxisConfig, type SeriesConfig } from '../../services/persistence';
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
  allXAxes: XAxisConfig[];
  xAxesMetrics: XAxisMetrics[];
  axisColor: string;
  zeroLineColor: string;
  labelColor: string;
  secLabelBg: string;
  leftOffsets: Record<string, number>;
  rightOffsets: Record<string, number>;
}

const AxesLayer = React.memo(forwardRef<AxesLayerHandle, AxesLayerProps>(({ xAxes, yAxes, width, height, padding, series, axisLayout, allXAxes, xAxesMetrics, axisColor, zeroLineColor, labelColor, secLabelBg, leftOffsets, rightOffsets }: AxesLayerProps, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
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

  const drawRef = useRef<((xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => void) | null>(null);

  useImperativeHandle(ref, () => ({
    redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
      drawRef.current?.(xAxes, yAxes);
    },
  }), []);

  useEffect(() => {
    const drawFrame = (currentXAxes: XAxisLayout[], currentYAxes: YAxisLayout[]) => {
    const canvas = canvasRef.current;
    if (!canvas || width <= 0 || height <= 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, width, height);

    ctx.strokeStyle = axisColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    ctx.lineTo(padding.left, padding.top);
    ctx.lineTo(width - padding.right, padding.top);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    const drawArrow = (x: number, y: number, angle: number, color: string) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-6, -3);
      ctx.lineTo(-6, 3);
      ctx.fill();
      ctx.restore();
    };

    ctx.lineWidth = 1;
    ctx.textBaseline = 'top';

    // X Axes lines & ticks
    currentXAxes.forEach((axis, idx) => {
      const axisConf = mainXConf.id === axis.id ? mainXConf : allXAxesById.get(axis.id)!;
      const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
      const metrics = xAxesMetrics[idx];
      const y = height - padding.bottom + metrics.cumulativeOffset;

      ctx.strokeStyle = axisColor;
      ctx.beginPath();
      ctx.moveTo(padding.left, Math.round(y) + 0.5);
      ctx.lineTo(width - padding.right + 8, Math.round(y) + 0.5);
      ctx.stroke();
      drawArrow(width - padding.right + 8, y, 0, axisColor);

      ctx.beginPath();
      axis.ticks.result.forEach((t) => {
        const ts = typeof t === 'number' ? t : (t as { timestamp: number }).timestamp;
        const { x } = worldToScreen(ts, 0, vp);
        if (x >= padding.left && x <= width - padding.right) {
          ctx.moveTo(Math.round(x) + 0.5, y);
          ctx.lineTo(Math.round(x) + 0.5, y + 6);
        }
      });
      ctx.stroke();

      if (axisConf.min <= 0 && axisConf.max >= 0 && idx === 0) {
        const { x } = worldToScreen(0, 0, vp);
        ctx.strokeStyle = zeroLineColor;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(Math.round(x) + 0.5, height - padding.bottom);
        ctx.lineTo(Math.round(x) + 0.5, padding.top - 8);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(x, padding.top - 8, -Math.PI / 2, zeroLineColor);
      }
    });

    // Y Axes Zero line
    if (currentYAxes.length > 0) {
      const mainAxis = currentYAxes[0];
      const axisVp = { xMin: mainXConf.min, xMax: mainXConf.max, yMin: mainAxis.min, yMax: mainAxis.max, width, height, padding };
      if (mainAxis.min <= 0 && mainAxis.max >= 0) {
        const { y } = worldToScreen(mainXConf.min, 0, axisVp);
        ctx.strokeStyle = zeroLineColor;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(padding.left, Math.round(y) + 0.5);
        ctx.lineTo(width - padding.right + 8, Math.round(y) + 0.5);
        ctx.stroke();
        ctx.setLineDash([]);
        drawArrow(width - padding.right + 8, y, 0, zeroLineColor);
      }
    }

    // Y Axes lines & ticks
    currentYAxes.forEach((axis) => {
      const isLeft = axis.position === 'left';
      const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
      let xPos = 0;
      if (isLeft) {
        xPos = padding.left - (leftOffsets[axis.id] ?? 0) - axisMetrics.total;
      } else {
        xPos = width - padding.right + (rightOffsets[axis.id] ?? 0);
      }
      const axisLineX = isLeft ? xPos + axisMetrics.total : xPos;
      const chartHeight = Math.max(0, height - padding.top - padding.bottom);
      if (axis.max - axis.min <= 0 || chartHeight <= 0) return;

      ctx.strokeStyle = axisColor;
      ctx.beginPath();
      ctx.moveTo(Math.round(axisLineX) + 0.5, height - padding.bottom);
      ctx.lineTo(Math.round(axisLineX) + 0.5, padding.top - 8);
      ctx.stroke();
      drawArrow(axisLineX, padding.top - 8, -Math.PI / 2, axisColor);

      ctx.beginPath();
      axis.ticks.forEach(t => {
        const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
        if (y >= padding.top && y <= height - padding.bottom) {
          const x1 = isLeft ? axisLineX - 5 : axisLineX;
          const x2 = isLeft ? axisLineX : axisLineX + 5;
          ctx.moveTo(Math.round(x1) + 0.5, Math.round(y) + 0.5);
          ctx.lineTo(Math.round(x2) + 0.5, Math.round(y) + 0.5);
        }
      });
      ctx.stroke();
    });

    // Text rendering
    currentXAxes.forEach((axis, axisIdx) => {
      const axisConf = mainXConf.id === axis.id ? mainXConf : allXAxesById.get(axis.id)!;
      const vp = { xMin: axisConf.min, xMax: axisConf.max, yMin: 0, yMax: 100, width, height, padding };
      const metrics = xAxesMetrics[axisIdx];
      
      const baseTopY = height - padding.bottom + metrics.cumulativeOffset;

      // Secondary Labels
      if (axis.ticks.secondaryLabels) {
        ctx.font = "bold 10px system-ui, -apple-system, sans-serif";
        ctx.textBaseline = 'top';
        axis.ticks.secondaryLabels.forEach((sl: SecondaryLabel, idx: number) => {
          const nextSl = axis.ticks.secondaryLabels![idx + 1];
          const { x: currentX } = worldToScreen(sl.timestamp, 0, vp);
          const { x: nextX } = nextSl ? worldToScreen(nextSl.timestamp, 0, vp) : { x: width - padding.right + 200 };
          const labelWidth = ctx.measureText(sl.label).width;
          const paddingLeft = padding.left + 5;
          let x = Math.max(currentX + 5, paddingLeft);
          if (nextX < x + labelWidth + 10) x = nextX - labelWidth - 10;
          if (x + labelWidth > padding.left && x < width - padding.right) {
            const rectY = baseTopY + metrics.secLabelBottom - 14; 
            ctx.fillStyle = secLabelBg;
            ctx.fillRect(x, rectY, labelWidth + 8, 14);
            ctx.fillStyle = axis.color || labelColor;
            ctx.fillText(sl.label, x + 4, rectY + 1);
            if (currentX > padding.left) {
              ctx.strokeStyle = axis.color || labelColor;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.moveTo(Math.round(x) + 0.5, rectY);
              ctx.lineTo(Math.round(x) + 0.5, rectY + 14);
              ctx.stroke();
              ctx.lineWidth = 1;
            }
          }
        });
      }

      // Primary Labels
      ctx.font = `${isMobile ? '10px' : '9px'} system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = axis.color || labelColor;
      axis.ticks.result.forEach((t) => {
        const timestamp = typeof t === 'number' ? t : (t as { timestamp: number }).timestamp;
        const { x } = worldToScreen(timestamp, 0, vp);
        if (x >= padding.left && x <= width - padding.right) {
          const label = typeof t === 'number' ? (Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.ticks.precision)) : (t as { label: string }).label;
          ctx.fillText(label, x, baseTopY + metrics.labelBottom - (isMobile ? 10 : 9));
        }
      });

      // Title
      ctx.font = `bold ${isMobile ? '14px' : '12px'} system-ui, -apple-system, sans-serif`;
      ctx.fillText(axis.title, padding.left + (width - padding.left - padding.right) / 2, baseTopY + metrics.titleBottom - (isMobile ? 14 : 12));
    });

    currentYAxes.forEach((axis) => {
      const isLeft = axis.position === 'left';
      const axisMetrics = axisLayout[axis.id] || { total: 40, label: 30 };
      let xPos = 0;
      if (isLeft) {
        xPos = padding.left - (leftOffsets[axis.id] ?? 0) - axisMetrics.total;
      } else {
        xPos = width - padding.right + (rightOffsets[axis.id] ?? 0);
      }
      const chartHeight = Math.max(0, height - padding.top - padding.bottom);
      if (axis.max - axis.min <= 0 || chartHeight <= 0) return;

      const axisSeries = seriesByYAxisId[axis.id] || [];
      const spineX = isLeft ? xPos + axisMetrics.total : xPos;
      const labelX = isLeft ? spineX - 7 : spineX + 7;
      const titleX = isLeft ? xPos + 7.5 : xPos + axisMetrics.total - 7.5;

      ctx.font = `${isMobile ? '10px' : '9px'} system-ui, -apple-system, sans-serif`;
      ctx.textAlign = isLeft ? 'right' : 'left';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = labelColor;
      
      axis.ticks.forEach(t => {
        const { y } = worldToScreen(mainXConf.min, t, { xMin: mainXConf.min, xMax: mainXConf.max, yMin: axis.min, yMax: axis.max, width, height, padding });
        if (y >= padding.top && y <= height - padding.bottom) {
          const label = Math.abs(t) < 1e-12 ? '0' : t.toFixed(axis.precision);
          ctx.fillText(label, labelX, y);
        }
      });

      ctx.save();
      ctx.translate(titleX, padding.top + chartHeight / 2);
      ctx.rotate(isLeft ? -Math.PI / 2 : Math.PI / 2);
      ctx.font = `bold ${isMobile ? '14px' : '12px'} system-ui, -apple-system, sans-serif`;
      ctx.textAlign = 'center';
      
      // Calculate total width to center it
      let totalWidth = 0;
      const parts = axisSeries.map((s, i) => {
        const text = (i > 0 ? ' / ' : '') + (s.name || s.yColumn);
        const w = ctx.measureText(text).width;
        totalWidth += w;
        return { text, w, color: i > 0 && text.startsWith(' / ') ? labelColor : s.lineColor, origText: s.name || s.yColumn };
      });

      let currentX = -totalWidth / 2;
      parts.forEach((p, i) => {
        if (i > 0) {
          ctx.fillStyle = labelColor;
          ctx.fillText(' / ', currentX + ctx.measureText(' / ').width / 2, 0);
          currentX += ctx.measureText(' / ').width;
        }
        ctx.fillStyle = p.origText ? axisSeries[i].lineColor : labelColor;
        ctx.fillText(p.origText, currentX + ctx.measureText(p.origText).width / 2, 0);
        currentX += ctx.measureText(p.origText).width;
      });

      ctx.restore();
    });
    }; // end drawFrame
    drawRef.current = drawFrame;
    drawFrame(xAxes, yAxes);
  }, [xAxes, yAxes, width, height, padding, seriesByYAxisId, axisLayout, allXAxesById, mainXConf, xAxesMetrics, axisColor, zeroLineColor, labelColor, secLabelBg, leftOffsets, rightOffsets, isMobile]);

  return (
    <canvas 
      ref={canvasRef} 
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 6, width: '100%', height: '100%' }} 
    />
  );
}));

AxesLayer.displayName = 'AxesLayer';
export { AxesLayer };
export type { AxesLayerProps };
