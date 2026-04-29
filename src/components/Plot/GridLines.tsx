// src/components/Plot/GridLines.tsx
import React from 'react';
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

const GridLines = React.memo(({ xAxes, yAxes, width, height, padding, gridColor, xViewports, yViewports }: GridLinesProps) => {
  return (
    <svg width="100%" height="100%" style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
      {xAxes.length > 0 && (() => {
        const axis = xAxes[0];
        const vp = xViewports.find(v => v.id === axis.id);
        if (!vp) return null;
        const viewport = { xMin: vp.xMin, xMax: vp.xMax, yMin: 0, yMax: 100, width, height, padding };
        return axis.ticks.result.map((t: number | TimeTick) => {
          const timestamp = typeof t === 'number' ? t : t.timestamp;
          const { x } = worldToScreen(timestamp, 0, viewport);
          if (x < padding.left || x > width - padding.right) return null;
          return <line key={`gx-${timestamp}`} x1={x} y1={padding.top} x2={x} y2={height - padding.bottom} stroke={gridColor} strokeWidth="1" />;
        });
      })()}
      {yAxes.map((axis) => {
        if (!axis.showGrid || height <= padding.top + padding.bottom) return null;
        const vp = yViewports.find(v => v.id === axis.id);
        if (!vp) return null;
        const viewport = { xMin: vp.xMin, xMax: vp.xMax, yMin: axis.min, yMax: axis.max, width, height, padding };
        return axis.ticks.map(t => {
          const { y } = worldToScreen(vp.xMin, t, viewport);
          if (y < padding.top || y > height - padding.bottom) return null;
          return <line key={`gy-${axis.id}-${t}`} x1={padding.left} y1={y} x2={width - padding.right} y2={y} stroke={gridColor} strokeWidth="1" />;
        });
      })}
    </svg>
  );
});

GridLines.displayName = 'GridLines';
export { GridLines };
export type { GridLinesProps };
