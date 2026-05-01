// src/components/Plot/GridLines.tsx
import React, { useEffect, useRef, useImperativeHandle, forwardRef } from 'react';
import { worldToScreen } from '../../utils/coords';
import { type TimeTick } from '../../utils/time';
import { type XAxisLayout, type YAxisLayout } from './chartTypes';

interface GridLinesProps {
  xAxes: XAxisLayout[];
  yAxes: YAxisLayout[];
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  gridColor: string;
  xViewports: Array<{ id: string; xMin: number; xMax: number }>;
  yViewports: Array<{ id: string; xMin: number; xMax: number; yMin: number; yMax: number }>;
}

export interface GridLinesHandle {
  redraw: (
    xAxes: XAxisLayout[],
    yAxes: YAxisLayout[],
    xViewports: Array<{ id: string; xMin: number; xMax: number }>,
    yViewports: Array<{ id: string; xMin: number; xMax: number; yMin: number; yMax: number }>
  ) => void;
}

const GridLines = React.memo(forwardRef<GridLinesHandle, GridLinesProps>(({ xAxes, yAxes, width, height, padding, gridColor, xViewports, yViewports }, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const drawRef = useRef<GridLinesHandle['redraw'] | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || width === 0 || height === 0) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const drawFrame: GridLinesHandle['redraw'] = (cXAxes, cYAxes, cXVp, cYVp) => {
      const dpr = window.devicePixelRatio || 1;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      ctx.strokeStyle = gridColor;
      ctx.lineWidth = 1;
      ctx.beginPath();

      if (cXAxes.length > 0) {
        const axis = cXAxes[0];
        const vp = cXVp.find(v => v.id === axis.id);
        if (vp) {
          const viewport = { xMin: vp.xMin, xMax: vp.xMax, yMin: 0, yMax: 100, width, height, padding };
          axis.ticks.result.forEach((t: number | TimeTick) => {
            const timestamp = typeof t === 'number' ? t : t.timestamp;
            const { x } = worldToScreen(timestamp, 0, viewport);
            if (x >= padding.left && x <= width - padding.right) {
              ctx.moveTo(Math.round(x) + 0.5, padding.top);
              ctx.lineTo(Math.round(x) + 0.5, height - padding.bottom);
            }
          });
        }
      }

      cYAxes.forEach(axis => {
        if (!axis.showGrid || height <= padding.top + padding.bottom) return;
        const vp = cYVp.find(v => v.id === axis.id);
        if (!vp) return;
        const viewport = { xMin: vp.xMin, xMax: vp.xMax, yMin: axis.min, yMax: axis.max, width, height, padding };
        axis.ticks.forEach(t => {
          const { y } = worldToScreen(vp.xMin, t, viewport);
          if (y >= padding.top && y <= height - padding.bottom) {
            ctx.moveTo(padding.left, Math.round(y) + 0.5);
            ctx.lineTo(width - padding.right, Math.round(y) + 0.5);
          }
        });
      });

      ctx.stroke();
    };

    drawRef.current = drawFrame;
    drawFrame(xAxes, yAxes, xViewports, yViewports);
  }, [xAxes, yAxes, width, height, padding, gridColor, xViewports, yViewports]);

  useImperativeHandle(ref, () => ({
    redraw: (xAxes, yAxes, xViewports, yViewports) => {
      drawRef.current?.(xAxes, yAxes, xViewports, yViewports);
    },
  }), []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0, width: '100%', height: '100%' }}
    />
  );
}));

GridLines.displayName = 'GridLines';
export { GridLines };
export type { GridLinesProps };
