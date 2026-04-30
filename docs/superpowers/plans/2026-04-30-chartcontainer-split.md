# ChartContainer Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `ChartContainer.tsx` (948 lines, 8+ responsibilities) into focused files so each unit has one clear purpose and the main component becomes ~150 lines of composition.

**Architecture:** Extract the three inline sub-components (`GridLines`, `AxesLayer`, `Crosshair`) to their own files; extract interaction logic into two hooks (`usePanZoom`, `useAutoScale`); extract axis tick/step calculation to a utility (`axisCalculations.ts`). `ChartContainer.tsx` retains only layout state, padding math, and JSX composition.

**Tech Stack:** React, TypeScript, Zustand, Vitest/jsdom

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `src/components/Plot/GridLines.tsx` | SVG grid line rendering |
| Create | `src/components/Plot/AxesLayer.tsx` | SVG/DOM axis spines, ticks, labels, titles |
| Create | `src/components/Plot/Crosshair.tsx` | Mouse tracking, snap logic, tooltip, Ctrl+C copy |
| Create | `src/hooks/usePanZoom.ts` | Pan, zoom, box-zoom, touch, keyboard interaction |
| Create | `src/hooks/useAutoScale.ts` | Auto-scale X/Y, view restoration, new-series detection |
| Create | `src/utils/axisCalculations.ts` | Tick/step generation for numeric and date axes |
| Modify | `src/components/Plot/ChartContainer.tsx` | Reduce to layout state + padding math + JSX composition (~150 lines) |

---

## Task 1: Extract `axisCalculations.ts`

**Files:**
- Create: `src/utils/axisCalculations.ts`
- Create: `src/utils/__tests__/axisCalculations.test.ts`

- [x] **Step 1: Write failing tests**

```ts
// src/utils/__tests__/axisCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { calcNumericStep, calcNumericTicks, calcNumericPrecision, calcYAxisTicks } from '../axisCalculations';

describe('calcNumericStep', () => {
  it('rounds to nice steps', () => {
    expect(calcNumericStep(10, 5)).toBe(2);
    expect(calcNumericStep(100, 5)).toBe(20);
    expect(calcNumericStep(0.3, 3)).toBe(0.1);
  });
  it('returns 1 for zero range', () => {
    expect(calcNumericStep(0, 5)).toBe(1);
  });
});

describe('calcNumericPrecision', () => {
  it('returns 0 for steps >= 1', () => {
    expect(calcNumericPrecision(2)).toBe(0);
    expect(calcNumericPrecision(10)).toBe(0);
  });
  it('returns positive precision for fractional steps', () => {
    expect(calcNumericPrecision(0.1)).toBe(1);
    expect(calcNumericPrecision(0.01)).toBe(2);
  });
});

describe('calcNumericTicks', () => {
  it('generates ticks covering the range', () => {
    const ticks = calcNumericTicks(0, 10, 2);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
  });
  it('caps at 200 ticks', () => {
    expect(calcNumericTicks(0, 1e6, 1).length).toBeLessThanOrEqual(201);
  });
});

describe('calcYAxisTicks', () => {
  it('returns ticks, precision, and actualStep', () => {
    const result = calcYAxisTicks(0, 100, 400);
    expect(result.ticks.length).toBeGreaterThan(0);
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.actualStep).toBeGreaterThan(0);
  });
  it('handles zero range', () => {
    const result = calcYAxisTicks(5, 5, 400);
    expect(result.ticks).toEqual([]);
    expect(result.actualStep).toBe(1);
  });
});
```

- [x] **Step 2: Run tests to verify they fail**

```
npx vitest run src/utils/__tests__/axisCalculations.test.ts
```
Expected: FAIL (module not found)

- [x] **Step 3: Create `axisCalculations.ts`**

```ts
// src/utils/axisCalculations.ts

/** Round a raw step size to a nice human-readable step. */
export function calcNumericStep(range: number, maxTicks: number): number {
  if (range <= 0) return 1;
  const raw = range / Math.max(1, maxTicks);
  const mag = Math.pow(10, Math.floor(Math.log10(Math.abs(raw) || 1)));
  const norm = raw / mag;
  return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/** Decimal places needed to display a step value. */
export function calcNumericPrecision(step: number): number {
  return Math.max(0, -Math.floor(Math.log10(step || 1)));
}

/** Generate tick values from min to max for a given step (capped at 200). */
export function calcNumericTicks(min: number, max: number, step: number): number[] {
  const first = Math.ceil((min - step) / step) * step;
  const ticks: number[] = [];
  for (let t = first; t <= max + step; t += step) {
    if (ticks.length > 200) break;
    ticks.push(t);
  }
  return ticks;
}

/** Full Y-axis tick calculation: returns ticks, precision, and actualStep. */
export function calcYAxisTicks(
  min: number,
  max: number,
  chartHeight: number,
  lockedStep?: number,
): { ticks: number[]; precision: number; actualStep: number } {
  const range = max - min;
  if (range <= 0) return { ticks: [], precision: 0, actualStep: 1 };
  const step = lockedStep ?? calcNumericStep(range, Math.max(2, Math.floor(chartHeight / 30)));
  if (step <= 0) return { ticks: [], precision: 0, actualStep: 1 };
  const precision = calcNumericPrecision(step);
  return { ticks: calcNumericTicks(min, max, step), precision, actualStep: step };
}
```

- [x] **Step 4: Run tests to verify they pass**

```
npx vitest run src/utils/__tests__/axisCalculations.test.ts
```
Expected: All PASS

- [x] **Step 5: Commit**

```bash
git add src/utils/axisCalculations.ts src/utils/__tests__/axisCalculations.test.ts
git commit -m "feat: extract axis tick/step calculation to axisCalculations.ts"
```

---

## Task 2: Extract `GridLines.tsx`

**Files:**
- Create: `src/components/Plot/GridLines.tsx`

The `GridLines` component currently lives at lines 123–151 of `ChartContainer.tsx`. It is already a self-contained `React.memo` component — this task just moves it to its own file.

- [x] **Step 1: Create the file**

```tsx
// src/components/Plot/GridLines.tsx
import React from 'react';
import { worldToScreen } from '../../utils/coords';
import { type XAxisConfig } from '../../services/persistence';
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
```

- [x] **Step 2: Create shared type file that both GridLines and AxesLayer will use**

```ts
// src/components/Plot/chartTypes.ts
import { type YAxisConfig } from '../../services/persistence';
import { type TimeTick, type SecondaryLabel } from '../../utils/time';

export type XTicks =
  | { result: number[]; step: number; precision: number; isXDate: false; secondaryLabels?: undefined }
  | { result: TimeTick[]; isXDate: true; secondaryLabels: SecondaryLabel[]; step?: undefined; precision?: undefined };

export interface XAxisLayout {
  id: string;
  ticks: XTicks;
  title: string;
  color: string;
}

export interface YAxisLayout extends YAxisConfig {
  ticks: number[];
  precision: number;
  actualStep: number;
}

export interface XAxisMetrics {
  id: string;
  height: number;
  labelBottom: number;
  secLabelBottom: number;
  titleBottom: number;
  cumulativeOffset: number;
}

export type PanTarget = 'all' | { xAxisId: string } | { yAxisId: string };
```

- [x] **Step 3: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 4: Commit**

```bash
git add src/components/Plot/GridLines.tsx src/components/Plot/chartTypes.ts
git commit -m "feat: extract GridLines component and shared chartTypes to own files"
```

---

## Task 3: Extract `AxesLayer.tsx`

**Files:**
- Create: `src/components/Plot/AxesLayer.tsx`

The `AxesLayer` component currently lives at lines 153–326 of `ChartContainer.tsx`.

- [x] **Step 1: Create the file**

```tsx
// src/components/Plot/AxesLayer.tsx
import React, { useMemo } from 'react';
import { worldToScreen } from '../../utils/coords';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig } from '../../services/persistence';
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
```

- [x] **Step 2: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/components/Plot/AxesLayer.tsx
git commit -m "feat: extract AxesLayer component to own file"
```

---

## Task 4: Extract `Crosshair.tsx`

**Files:**
- Create: `src/components/Plot/Crosshair.tsx`

The `Crosshair` component currently lives at lines 328–498 of `ChartContainer.tsx`.

- [x] **Step 1: Create the file**

```tsx
// src/components/Plot/Crosshair.tsx
import React, { useState, useCallback, useEffect, useMemo } from 'react';
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

  if (!pos) return null;

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
```

- [x] **Step 2: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/components/Plot/Crosshair.tsx
git commit -m "feat: extract Crosshair component to own file"
```

---

## Task 5: Extract `usePanZoom.ts`

**Files:**
- Create: `src/hooks/usePanZoom.ts`

This hook owns all interaction state: pan, wheel zoom, box-zoom, touch, keyboard modifiers. It takes layout constants (padding, chartWidth, chartHeight, activeXAxes, activeYAxes) and returns handlers + derived state.

- [x] **Step 1: Create the hook**

```ts
// src/hooks/usePanZoom.ts
import { useState, useRef, useCallback, useEffect } from 'react';
import { screenToWorld } from '../utils/coords';
import { useGraphStore } from '../store/useGraphStore';
import { type XAxisConfig, type YAxisConfig } from '../services/persistence';
import { type PanTarget } from '../components/Plot/chartTypes';

interface UsePanZoomOptions {
  containerRef: React.RefObject<HTMLDivElement | null>;
  width: number;
  height: number;
  padding: { top: number; right: number; bottom: number; left: number };
  chartWidth: number;
  chartHeight: number;
  activeXAxes: XAxisConfig[];
  activeYAxes: YAxisConfig[];
  xAxesById: Map<string, XAxisConfig>;
  yAxesById: Map<string, YAxisConfig>;
  targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  startAnimation: () => void;
  xAxesMetrics: Array<{ id: string; height: number; cumulativeOffset: number }>;
  axisLayout: Record<string, { total: number; label: number }>;
  leftAxes: YAxisConfig[];
  rightAxes: YAxisConfig[];
  leftOffsets: Record<string, number>;
  rightOffsets: Record<string, number>;
  handleAutoScaleX: (xAxisId?: string) => void;
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
}

interface UsePanZoomResult {
  panTarget: PanTarget | null;
  isCtrlPressed: boolean;
  isShiftPressed: boolean;
  zoomBoxState: { startX: number; startY: number; endX: number; endY: number } | null;
  isPanningRef: React.MutableRefObject<boolean>;
  pressedKeys: React.MutableRefObject<Set<string>>;
  hoveredAxisIdRef: React.MutableRefObject<string | null>;
  hoveredXAxisIdRef: React.MutableRefObject<string | null>;
  handleMouseDown: (e: React.MouseEvent, target?: PanTarget) => void;
  handleTouchStart: (e: React.TouchEvent, target?: PanTarget) => void;
  handleWheel: (e: React.WheelEvent, target?: PanTarget) => void;
}

export function usePanZoom({
  containerRef, width, height, padding, chartWidth, chartHeight,
  activeXAxes, activeYAxes, xAxesById, yAxesById,
  targetXAxes, targetYs, startAnimation,
  xAxesMetrics, axisLayout, leftAxes, rightAxes, leftOffsets, rightOffsets,
  handleAutoScaleX, handleAutoScaleY,
}: UsePanZoomOptions): UsePanZoomResult {
  const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
  const [isCtrlPressed, setIsCtrlPressed] = useState(false);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [zoomBoxState, setZoomBoxState] = useState<{ startX: number; startY: number; endX: number; endY: number } | null>(null);

  const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
  const lastPinchDist = useRef<number | null>(null);
  const lastTouchTime = useRef<number>(0);
  const lastMousePos = useRef<{ x: number; y: number } | null>(null);
  const zoomBoxStartRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
  const isPanningRef = useRef(false);
  const pressedKeys = useRef<Set<string>>(new Set());
  const hoveredAxisIdRef = useRef<string | null>(null);
  const hoveredXAxisIdRef = useRef<string | null>(null);

  const getHoveredYAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
    let lOff = 0;
    for (let i = 0; i < leftAxes.length; i++) {
      const am = axisLayout[leftAxes[i].id] || { total: 40 };
      if (mouseX >= padding.left - lOff - am.total && mouseX <= padding.left - lOff) return leftAxes[i].id;
      lOff += am.total;
    }
    let rOff = 0;
    for (let i = 0; i < rightAxes.length; i++) {
      const am = axisLayout[rightAxes[i].id] || { total: 40 };
      if (mouseX >= width - padding.right + rOff && mouseX <= width - padding.right + rOff + am.total) return rightAxes[i].id;
      rOff += am.total;
    }
    return null;
  }, [leftAxes, rightAxes, axisLayout, padding, width, height]);

  const getHoveredXAxis = useCallback((mouseX: number, mouseY: number) => {
    if (mouseX < padding.left || mouseX > width - padding.right) return null;
    for (const m of xAxesMetrics) {
      const baseY = height - padding.bottom + m.cumulativeOffset;
      if (mouseY >= baseY && mouseY <= baseY + m.height) return m.id;
    }
    return null;
  }, [xAxesMetrics, padding, width, height]);

  const performZoom = useCallback((zoomFactor: number, mouseX: number, mouseY: number, target: PanTarget = 'all', shiftKey = false) => {
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axesToZoom = (target === 'all' || shiftKey) ? activeXAxes : [xAxesById.get((target as { xAxisId: string }).xAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
        const worldMouse = screenToWorld(mouseX, 0, vp);
        const currentX = targetXAxes.current[axis.id] || { min: axis.min, max: axis.max };
        const newXRange = (currentX.max - currentX.min) * zoomFactor;
        const weight = (mouseX - padding.left) / chartWidth;
        targetXAxes.current[axis.id] = { min: worldMouse.x - weight * newXRange, max: worldMouse.x + (1 - weight) * newXRange };
      });
    }
    if ((target === 'all' && !shiftKey) || (typeof target === 'object' && 'yAxisId' in target)) {
      const axesToZoom = target === 'all' ? activeYAxes : [yAxesById.get((target as { yAxisId: string }).yAxisId)!];
      axesToZoom.forEach(axis => {
        if (!axis) return;
        const axisVp = { xMin: 0, xMax: 100, yMin: axis.min, yMax: axis.max, width, height, padding };
        const worldMouse = screenToWorld(0, mouseY, axisVp);
        const currentTarget = targetYs.current[axis.id] || { min: axis.min, max: axis.max };
        const newYRange = (currentTarget.max - currentTarget.min) * zoomFactor;
        const weight = (height - padding.bottom - mouseY) / chartHeight;
        targetYs.current[axis.id] = { min: worldMouse.y - weight * newYRange, max: worldMouse.y + (1 - weight) * newYRange };
      });
    }
    startAnimation();
  }, [activeXAxes, activeYAxes, xAxesById, yAxesById, width, height, padding, chartWidth, chartHeight, targetXAxes, targetYs, startAnimation]);

  const performPan = useCallback((dx: number, dy: number, target: PanTarget = 'all', shiftKey = false) => {
    const state = useGraphStore.getState();
    if (target === 'all' || (typeof target === 'object' && 'xAxisId' in target)) {
      const axes = (target === 'all' || shiftKey) ? activeXAxes : [xAxesById.get(((target as { xAxisId: string }).xAxisId))!];
      axes.forEach(axis => {
        if (!axis) return;
        const xr = axis.max - axis.min;
        const xm = chartWidth > 0 ? (dx / chartWidth) * xr : 0;
        const next = { min: axis.min - xm, max: axis.max - xm };
        state.updateXAxis(axis.id, next);
        targetXAxes.current[axis.id] = next;
      });
    }
    const draggedY = typeof target === 'object' && 'yAxisId' in target ? target.yAxisId : null;
    const yAxesToPan = (target === 'all' && !shiftKey) ? activeYAxes : (draggedY ? [yAxesById.get(draggedY)!] : []);
    yAxesToPan.forEach(axis => {
      if (!axis) return;
      const cur = yAxesById.get(axis.id)!;
      const yr = cur.max - cur.min;
      const ym = chartHeight > 0 ? (dy / chartHeight) * yr : 0;
      const next = { min: cur.min + ym, max: cur.max + ym };
      state.updateYAxis(axis.id, next);
      targetYs.current[axis.id] = next;
    });
  }, [activeXAxes, activeYAxes, xAxesById, yAxesById, chartWidth, chartHeight, targetXAxes, targetYs]);

  const handleWheel = useCallback((e: React.WheelEvent, target: PanTarget = 'all') => {
    const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
    const rect = containerRef.current?.getBoundingClientRect();
    performZoom(zoomFactor, rect ? e.clientX - rect.left : width / 2, rect ? e.clientY - rect.top : height / 2, target, e.shiftKey);
  }, [containerRef, width, height, performZoom]);

  const handleMouseDown = useCallback((e: React.MouseEvent, target: PanTarget = 'all') => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left, y = e.clientY - rect.top;
    if (e.ctrlKey && target === 'all') {
      if (x >= padding.left && x <= width - padding.right && y >= padding.top && y <= height - padding.bottom) {
        const box = { startX: x, startY: y, endX: x, endY: y };
        zoomBoxStartRef.current = box;
        setZoomBoxState(box);
      }
    } else {
      isPanningRef.current = true;
      setPanTarget(target);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    }
  }, [containerRef, padding, width, height]);

  const handleTouchStart = useCallback((e: React.TouchEvent, target: PanTarget = 'all') => {
    const now = Date.now(), isDouble = now - lastTouchTime.current < 300;
    lastTouchTime.current = now;
    if (e.touches.length === 1) {
      const t = e.touches[0], rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      if (isDouble) {
        if (target === 'all') { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); }
        else if (typeof target === 'object') {
          if ('xAxisId' in target) handleAutoScaleX(target.xAxisId);
          else if ('yAxisId' in target) handleAutoScaleY(target.yAxisId, t.clientY - rect.top);
        }
        return;
      }
      isPanningRef.current = true;
      setPanTarget(target);
      lastTouchPos.current = { x: t.clientX, y: t.clientY };
    } else if (e.touches.length === 2) {
      isPanningRef.current = false;
      setPanTarget(prev => (prev && prev !== 'all') ? prev : target);
      const t1 = e.touches[0], t2 = e.touches[1];
      lastPinchDist.current = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
    }
  }, [containerRef, activeYAxes, handleAutoScaleX, handleAutoScaleY]);

  // Raw event listeners (non-React for passive:false touch)
  const panTargetRef = useRef(panTarget);
  panTargetRef.current = panTarget;
  const isShiftPressedRef = useRef(isShiftPressed);
  isShiftPressedRef.current = isShiftPressed;

  useEffect(() => {
    const handleTouchMoveRaw = (e: TouchEvent) => {
      const target = panTargetRef.current;
      if (e.touches.length === 1 && target && lastTouchPos.current) {
        if (e.cancelable) e.preventDefault();
        const t = e.touches[0], dx = t.clientX - lastTouchPos.current.x, dy = t.clientY - lastTouchPos.current.y;
        lastTouchPos.current = { x: t.clientX, y: t.clientY };
        performPan(dx, dy, target, e.shiftKey);
      } else if (e.touches.length === 2 && lastPinchDist.current) {
        if (e.cancelable) e.preventDefault();
        const rect = containerRef.current!.getBoundingClientRect();
        const t1 = e.touches[0], t2 = e.touches[1];
        const dist = Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
        if (dist === 0) return;
        const zf = lastPinchDist.current / dist;
        lastPinchDist.current = dist;
        performZoom(zf, (t1.clientX + t2.clientX) / 2 - rect.left, (t1.clientY + t2.clientY) / 2 - rect.top, target || 'all', e.shiftKey);
      }
    };

    const handleMouseMoveRaw = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const mx = e.clientX - rect.left, my = e.clientY - rect.top;
      hoveredAxisIdRef.current = getHoveredYAxis(mx, my);
      hoveredXAxisIdRef.current = getHoveredXAxis(mx, my);

      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        box.endX = Math.max(padding.left, Math.min(width - padding.right, mx));
        box.endY = Math.max(padding.top, Math.min(height - padding.bottom, my));
        setZoomBoxState({ ...box });
        return;
      }
      const target = panTargetRef.current;
      if (!target || !lastMousePos.current) return;
      performPan(e.clientX - lastMousePos.current.x, e.clientY - lastMousePos.current.y, target, e.shiftKey);
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => {
      if (zoomBoxStartRef.current) {
        const box = zoomBoxStartRef.current;
        zoomBoxStartRef.current = null;
        setZoomBoxState(null);
        const minX = Math.min(box.startX, box.endX), maxX = Math.max(box.startX, box.endX);
        const minY = Math.min(box.startY, box.endY), maxY = Math.max(box.startY, box.endY);
        if (maxX - minX > 5 && maxY - minY > 5) {
          activeXAxes.forEach(axis => {
            const vp = { xMin: axis.min, xMax: axis.max, yMin: 0, yMax: 100, width, height, padding };
            const w1 = screenToWorld(minX, maxY, vp), w2 = screenToWorld(maxX, minY, vp);
            targetXAxes.current[axis.id] = { min: w1.x, max: w2.x };
          });
          if (!isShiftPressedRef.current) {
            activeYAxes.forEach(axis => {
              const mx2 = activeXAxes[0];
              const avp = { xMin: mx2.min, xMax: mx2.max, yMin: axis.min, yMax: axis.max, width, height, padding };
              const a1 = screenToWorld(minX, maxY, avp), a2 = screenToWorld(maxX, minY, avp);
              targetYs.current[axis.id] = { min: a1.y, max: a2.y };
            });
          }
          startAnimation();
        }
      }
      isPanningRef.current = false;
      setPanTarget(null);
    };

    const handleTouchEnd = () => {
      isPanningRef.current = false;
      setPanTarget(null);
      lastTouchPos.current = null;
      lastPinchDist.current = null;
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
  }, [containerRef, padding, width, height, activeXAxes, activeYAxes, targetXAxes, targetYs, startAnimation, performPan, performZoom, getHoveredYAxis, getHoveredXAxis]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Control') setIsCtrlPressed(e.type === 'keydown');
      if (e.key === 'Shift') setIsShiftPressed(e.type === 'keydown');
      if (e.type === 'keyup') {
        pressedKeys.current.delete(e.key);
      } else {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement || e.target instanceof HTMLTextAreaElement) return;
        if (e.ctrlKey && ['+', '-', '=', '_'].includes(e.key)) e.preventDefault();
        pressedKeys.current.add(e.key);
        const step = 0.15;
        if (['ArrowLeft', 'ArrowRight'].includes(e.key)) {
          const axes = (hoveredXAxisIdRef.current && !e.shiftKey) ? activeXAxes.filter(a => a.id === hoveredXAxisIdRef.current) : activeXAxes;
          axes.forEach(a => {
            const t = targetXAxes.current[a.id] || { min: a.min, max: a.max };
            const r = t.max - t.min, d = e.key === 'ArrowLeft' ? -1 : 1;
            targetXAxes.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
          });
          startAnimation();
        } else if (['ArrowUp', 'ArrowDown'].includes(e.key)) {
          const axes = hoveredAxisIdRef.current ? activeYAxes.filter(a => a.id === hoveredAxisIdRef.current) : activeYAxes;
          const d = (hoveredAxisIdRef.current ? -1 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
          axes.forEach(a => {
            const t = targetYs.current[a.id] || { min: a.min, max: a.max };
            const r = t.max - t.min;
            targetYs.current[a.id] = { min: t.min + d * r * step, max: t.max + d * r * step };
          });
          startAnimation();
        } else if (['+', '-'].includes(e.key)) {
          startAnimation();
        }
      }
    };
    window.addEventListener('keydown', handleKey);
    window.addEventListener('keyup', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
      window.removeEventListener('keyup', handleKey);
    };
  }, [activeYAxes, activeXAxes, targetXAxes, targetYs, startAnimation]);

  return {
    panTarget,
    isCtrlPressed,
    isShiftPressed,
    zoomBoxState,
    isPanningRef,
    pressedKeys,
    hoveredAxisIdRef,
    hoveredXAxisIdRef,
    handleMouseDown,
    handleTouchStart,
    handleWheel,
  };
}
```

- [x] **Step 2: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/hooks/usePanZoom.ts
git commit -m "feat: extract pan/zoom/keyboard interaction to usePanZoom hook"
```

---

## Task 6: Extract `useAutoScale.ts`

**Files:**
- Create: `src/hooks/useAutoScale.ts`

This hook owns: auto-scale Y (with visible-range query using chunkMin/chunkMax), auto-scale X, view restoration on `lastAppliedViewId` change, and new-series detection triggering auto-scale.

- [x] **Step 1: Create the hook**

```ts
// src/hooks/useAutoScale.ts
import { useRef, useEffect, useCallback } from 'react';
import { useGraphStore } from '../store/useGraphStore';
import { type YAxisConfig, type XAxisConfig, type SeriesConfig, type Dataset } from '../services/persistence';
import { getColumnIndex } from '../utils/columns';

interface UseAutoScaleOptions {
  isLoaded: boolean;
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  activeYAxes: YAxisConfig[];
  activeXAxesUsed: XAxisConfig[];
  datasets: Dataset[];
  padding: { top: number; right: number; bottom: number; left: number };
  chartHeight: number;
  targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
  startAnimation: () => void;
  lastAppliedViewId: { id: string } | null;
}

interface UseAutoScaleResult {
  handleAutoScaleY: (axisId: string, mouseY?: number) => void;
  handleAutoScaleX: (xAxisId?: string) => void;
}

export function useAutoScale({
  isLoaded, series, yAxes, activeYAxes, activeXAxesUsed, datasets,
  padding, chartHeight, targetXAxes, targetYs, startAnimation, lastAppliedViewId,
}: UseAutoScaleOptions): UseAutoScaleResult {
  const wasEmptyRef = useRef(true);

  const handleAutoScaleY = useCallback((axisId: string, mouseY?: number) => {
    const state = useGraphStore.getState();
    const axisSeries = state.series.filter(s => s.yAxisId === axisId);
    if (axisSeries.length === 0) return;
    let yMin = Infinity, yMax = -Infinity;
    const datasetsByIdLocal = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsByIdLocal.set(d.id, d));
    const xAxesByIdLocal = new Map<string, XAxisConfig>();
    state.xAxes.forEach(a => xAxesByIdLocal.set(a.id, a));

    axisSeries.forEach(s => {
      const ds = datasetsByIdLocal.get(s.sourceId);
      const xAxis = xAxesByIdLocal.get(ds?.xAxisId || 'axis-1');
      if (!ds || !xAxis) return;
      const xIdx = getColumnIndex(ds, ds.xAxisColumn), yIdx = getColumnIndex(ds, s.yColumn);
      if (xIdx === -1 || yIdx === -1) return;
      const colX = ds.data[xIdx], colY = ds.data[yIdx];
      if (!colX?.data || !colY?.data) return;
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
        } else {
          for (let i = startIdx; i <= endIdx; i++) { const v = yData[i] + refY; if (v < yMin) yMin = v; if (v > yMax) yMax = v; }
        }
      }
    });

    if (yMin !== Infinity) {
      let nMin = yMin, nMax = yMax;
      const r = yMax - yMin || 1, p = r * 0.05;
      if (mouseY !== undefined) {
        if (mouseY < padding.top + chartHeight / 3) { nMin = yMin - r - 3 * p; nMax = yMax + p; }
        else if (mouseY > padding.top + 2 * chartHeight / 3) { nMin = yMin - p; nMax = yMax + r + 3 * p; }
        else { nMin = yMin - p; nMax = yMax + p; }
      } else { nMin = yMin - p; nMax = yMax + p; }
      targetYs.current[axisId] = { min: nMin, max: nMax };
      startAnimation();
    }
  }, [padding.top, chartHeight, targetYs, startAnimation]);

  const handleAutoScaleX = useCallback((xAxisId?: string) => {
    const state = useGraphStore.getState();
    if (state.datasets.length === 0) return;
    const activeDatasetIds = new Set<string>();
    state.series.forEach(s => activeDatasetIds.add(s.sourceId));
    const axesToScale = xAxisId ? [xAxisId] : activeXAxesUsed.map(a => a.id);
    axesToScale.forEach(id => {
      const activeDs = state.datasets.filter(d => (d.xAxisId || 'axis-1') === id && activeDatasetIds.has(d.id));
      if (activeDs.length === 0) return;
      let xMin = Infinity, xMax = -Infinity;
      activeDs.forEach(ds => {
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), col = ds.data[xIdx];
        if (col?.bounds) { if (col.bounds.min < xMin) xMin = col.bounds.min; if (col.bounds.max > xMax) xMax = col.bounds.max; }
      });
      if (xMin !== Infinity) {
        const pad = (xMax - xMin || 1) * 0.05;
        targetXAxes.current[id] = { min: xMin - pad, max: xMax + pad };
      }
    });
    startAnimation();
  }, [startAnimation, activeXAxesUsed, targetXAxes]);

  // Initial load + empty-to-data transition
  useEffect(() => {
    if (!isLoaded) return;
    const state = useGraphStore.getState();
    if (state.series.length === 0 && state.datasets.length === 0) { wasEmptyRef.current = true; return; }
    if (wasEmptyRef.current && (state.xAxes[0].min !== 0 || state.xAxes[0].max !== 100)) wasEmptyRef.current = false;
    let shouldReset = wasEmptyRef.current;
    const datasetsByIdLocal = new Map<string, Dataset>();
    state.datasets.forEach(d => datasetsByIdLocal.set(d.id, d));
    if (!shouldReset && state.datasets.length > 0) {
      let anyDataVisible = false;
      const xAxesByIdLocal = new Map<string, XAxisConfig>();
      state.xAxes.forEach(a => xAxesByIdLocal.set(a.id, a));
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId), xAxis = xAxesByIdLocal.get(ds?.xAxisId || 'axis-1');
        if (!ds || !xAxis) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), xCol = ds.data[xIdx];
        if (xCol && xCol.bounds) {
          if (Math.max(0, Math.min(xAxis.max, xCol.bounds.max) - Math.max(xAxis.min, xCol.bounds.min)) > 0
            || (xAxis.min >= xCol.bounds.min && xAxis.max <= xCol.bounds.max)) anyDataVisible = true;
        }
      });
      if (!anyDataVisible) shouldReset = true;
    }
    if (shouldReset && state.datasets.length > 0) {
      wasEmptyRef.current = false;
      const xBounds = new Map<string, { min: number; max: number }>();
      state.series.forEach(s => {
        const ds = datasetsByIdLocal.get(s.sourceId); if (!ds) return;
        const xIdx = getColumnIndex(ds, ds.xAxisColumn), col = ds.data[xIdx];
        if (!col || !col.bounds) return;
        const xId = ds.xAxisId || 'axis-1';
        const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity };
        xBounds.set(xId, { min: Math.min(cur.min, col.bounds.min), max: Math.max(cur.max, col.bounds.max) });
      });
      xBounds.forEach((bounds, id) => {
        if (bounds.min !== Infinity) {
          const pad = (bounds.max - bounds.min || 1) * 0.05;
          const nextX = { min: bounds.min - pad, max: bounds.max + pad };
          targetXAxes.current[id] = nextX;
          state.updateXAxis(id, nextX);
        }
      });
      const seriesByYAxisIdLocal = new Map<string, SeriesConfig[]>();
      state.series.forEach(s => {
        if (!seriesByYAxisIdLocal.has(s.yAxisId)) seriesByYAxisIdLocal.set(s.yAxisId, []);
        seriesByYAxisIdLocal.get(s.yAxisId)!.push(s);
      });
      activeYAxes.forEach(axis => {
        const axisSeries = seriesByYAxisIdLocal.get(axis.id) || [];
        if (axisSeries.length === 0) return;
        let yMin = Infinity, yMax = -Infinity;
        axisSeries.forEach(s => {
          const ds = datasetsByIdLocal.get(s.sourceId); if (!ds) return;
          const yIdx = getColumnIndex(ds, s.yColumn), yCol = ds.data[yIdx];
          if (!yCol || !yCol.bounds) return;
          if (yCol.bounds.min < yMin) yMin = yCol.bounds.min;
          if (yCol.bounds.max > yMax) yMax = yCol.bounds.max;
        });
        if (yMin !== Infinity) {
          const pad = (yMax - yMin || 1) * 0.05;
          const nextY = { min: yMin - pad, max: yMax + pad };
          targetYs.current[axis.id] = nextY;
          state.updateYAxis(axis.id, nextY);
        }
      });
      startAnimation();
    }
  }, [isLoaded, startAnimation, series, yAxes, activeYAxes, targetXAxes, targetYs]);

  // View restoration
  useEffect(() => {
    if (!lastAppliedViewId) return;
    const view = useGraphStore.getState().views.find(v => v.id === lastAppliedViewId.id);
    if (!view) return;
    view.xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
    if (view.yAxes.length > 0) {
      view.yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
    } else {
      activeYAxes.forEach(a => handleAutoScaleY(a.id));
    }
    startAnimation();
  }, [lastAppliedViewId, startAnimation, activeYAxes, handleAutoScaleY, targetXAxes, targetYs]);

  // New series detection
  const prevSeriesRef = useRef(series);
  useEffect(() => {
    if (!isLoaded) return;
    if (series.length > prevSeriesRef.current.length) {
      const added = series[series.length - 1];
      if (added) handleAutoScaleY(added.yAxisId);
    } else {
      series.forEach(s => {
        const prev = prevSeriesRef.current.find(ps => ps.id === s.id);
        if (prev && (prev.yColumn !== s.yColumn || prev.sourceId !== s.sourceId)) handleAutoScaleY(s.yAxisId);
      });
    }
    prevSeriesRef.current = series;
  }, [series, isLoaded, handleAutoScaleY]);

  return { handleAutoScaleY, handleAutoScaleX };
}
```

- [x] **Step 2: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 3: Commit**

```bash
git add src/hooks/useAutoScale.ts
git commit -m "feat: extract auto-scale and view restoration logic to useAutoScale hook"
```

---

## Task 7: Rewrite `ChartContainer.tsx` to use extracted pieces

**Files:**
- Modify: `src/components/Plot/ChartContainer.tsx`

Replace the 948-line file with a slim composition (~150 lines) that imports `GridLines`, `AxesLayer`, `Crosshair`, `usePanZoom`, `useAutoScale`, and `calcYAxisTicks`/`calcNumericStep`/`calcNumericTicks`/`calcNumericPrecision`.

- [x] **Step 1: Replace ChartContainer.tsx**

```tsx
// src/components/Plot/ChartContainer.tsx
import React, { useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useTheme } from '../../hooks/useTheme';
import { THEMES } from '../../themes';
import { applyKeyboardZoom, animateXAxes, animateYAxes } from '../../utils/animation';
import { useGraphStore } from '../../store/useGraphStore';
import { type Dataset, type XAxisConfig } from '../../services/persistence';
import { getTimeStep, generateTimeTicks, generateSecondaryLabels } from '../../utils/time';
import { getColumnIndex } from '../../utils/columns';
import { calcNumericStep, calcNumericPrecision, calcNumericTicks, calcYAxisTicks } from '../../utils/axisCalculations';
import { WebGLRenderer } from './WebGLRenderer';
import { ChartLegend } from './ChartLegend';
import { GridLines } from './GridLines';
import { AxesLayer } from './AxesLayer';
import { Crosshair } from './Crosshair';
import { usePanZoom } from '../../hooks/usePanZoom';
import { useAutoScale } from '../../hooks/useAutoScale';
import ErrorBoundary from '../ErrorBoundary';
import { type XAxisLayout, type YAxisLayout, type XAxisMetrics, type PanTarget } from './chartTypes';

type DatasetsByAxisId = Record<string, Dataset[]>;
type SeriesByAxisId = Record<string, string[]>;

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };
const BASE_PADDING_MOBILE = { top: 10, right: 10, bottom: 40, left: 10 };

const getXAxisMetrics = (isMobile: boolean, xMode: 'date' | 'numeric'): Omit<XAxisMetrics, 'id' | 'cumulativeOffset'> => {
  if (xMode === 'date') {
    return { height: isMobile ? 50 : 60, labelBottom: isMobile ? 18 : 22, secLabelBottom: isMobile ? 32 : 38, titleBottom: isMobile ? 44 : 52 };
  }
  return { height: 40, labelBottom: 18, secLabelBottom: 0, titleBottom: 32 };
};

const ChartContainer: React.FC = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const series = useGraphStore(s => s.series);
  const xAxes = useGraphStore(s => s.xAxes);
  const yAxes = useGraphStore(s => s.yAxes);
  const isLoaded = useGraphStore(s => s.isLoaded);
  const lastAppliedViewId = useGraphStore(s => s.lastAppliedViewId);
  const datasets = useGraphStore(s => s.datasets);
  const highlightedSeriesId = useGraphStore(s => s.highlightedSeriesId);
  const legendVisible = useGraphStore(s => s.legendVisible);
  const [themeName] = useTheme();
  const themeColors = THEMES[themeName];

  const datasetsById = useMemo(() => { const m = new Map<string, Dataset>(); datasets.forEach(d => m.set(d.id, d)); return m; }, [datasets]);
  const xAxesById = useMemo(() => { const m = new Map<string, XAxisConfig>(); xAxes.forEach(a => m.set(a.id, a)); return m; }, [xAxes]);
  const yAxesById = useMemo(() => { const m = new Map(); yAxes.forEach(a => m.set(a.id, a)); return m; }, [yAxes]);

  const [width, setWidth] = useState(800);
  const [height, setHeight] = useState(600);

  const targetXAxes = useRef<Record<string, { min: number; max: number }>>({});
  const targetYs = useRef<Record<string, { min: number; max: number }>>({});
  const isAnimating = useRef(false);
  const lockedXSteps = useRef<Record<string, { step?: number; timeStep?: ReturnType<typeof getTimeStep> }>>({});
  const lockedYSteps = useRef<Record<string, number>>({});

  const startAnimation = useCallback(() => {
    if (isAnimating.current) return;
    isAnimating.current = true;
    const loop = () => {
      const state = useGraphStore.getState();
      const factor = 0.4;
      let needsNextFrame = applyKeyboardZoom(state, pressedKeysRef.current, targetXAxes.current, targetYs.current);
      if (animateXAxes(state, targetXAxes.current, factor)) needsNextFrame = true;
      if (animateYAxes(state, targetYs.current, factor)) needsNextFrame = true;
      if (needsNextFrame) requestAnimationFrame(loop); else isAnimating.current = false;
    };
    requestAnimationFrame(loop);
  }, []);

  // pressedKeys ref forwarded from usePanZoom — initialized here so startAnimation can access it
  const pressedKeysRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (isLoaded && !isAnimating.current) {
      xAxes.forEach(axis => { targetXAxes.current[axis.id] = { min: axis.min, max: axis.max }; });
      yAxes.forEach(axis => { targetYs.current[axis.id] = { min: axis.min, max: axis.max }; });
      startAnimation();
    }
  }, [isLoaded, xAxes, yAxes, startAnimation]);

  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver(entries => {
      if (entries.length > 0) { const e = entries[entries.length - 1]; setWidth(e.contentRect.width); setHeight(e.contentRect.height); }
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const activeYAxes = useMemo(() => {
    const usedIds = new Set(series.map(s => s.yAxisId));
    return yAxes.filter(a => usedIds.has(a.id));
  }, [yAxes, series]);

  const activeXAxesUsed = useMemo(() => {
    const axisToMinDsIdx = new Map<string, number>();
    datasets.forEach((d, dsIdx) => { if (series.some(s => s.sourceId === d.id)) { const xId = d.xAxisId || 'axis-1'; if (!axisToMinDsIdx.has(xId) || dsIdx < axisToMinDsIdx.get(xId)!) axisToMinDsIdx.set(xId, dsIdx); } });
    return xAxes.filter(a => axisToMinDsIdx.has(a.id)).sort((a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0));
  }, [xAxes, series, datasets]);

  const activeYAxesLayout = useMemo((): YAxisLayout[] => {
    const isMobile = width < 768 || height < 500;
    const chartH = Math.max(0, height - (isMobile ? 40 : 60) - 20);
    return activeYAxes.map(axis => {
      const locked = lockedYSteps.current[axis.id];
      const { ticks, precision, actualStep } = calcYAxisTicks(axis.min, axis.max, chartH, locked);
      lockedYSteps.current[axis.id] = actualStep;
      return { ...axis, ticks, precision, actualStep };
    });
  }, [activeYAxes, height, width]);

  const axisLayout = useMemo(() => {
    const layout: Record<string, { total: number; label: number }> = {};
    activeYAxes.forEach(axis => {
      const step = calcNumericStep(axis.max - axis.min, Math.max(2, Math.floor(height / 30)));
      const precision = calcNumericPrecision(step);
      const widestValChars = Math.max(axis.min.toFixed(precision).length, axis.max.toFixed(precision).length);
      const labelWidth = widestValChars * 6;
      layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
    });
    return layout;
  }, [activeYAxes, height]);

  const leftAxes = useMemo(() => activeYAxes.filter(a => a.position === 'left'), [activeYAxes]);
  const rightAxes = useMemo(() => activeYAxes.filter(a => a.position === 'right'), [activeYAxes]);

  const { leftOffsets, rightOffsets } = useMemo(() => {
    const leftOffsets: Record<string, number> = {}; let lOff = 0;
    for (const a of leftAxes) { leftOffsets[a.id] = lOff; lOff += axisLayout[a.id]?.total || 40; }
    const rightOffsets: Record<string, number> = {}; let rOff = 0;
    for (const a of rightAxes) { rightOffsets[a.id] = rOff; rOff += axisLayout[a.id]?.total || 40; }
    return { leftOffsets, rightOffsets };
  }, [leftAxes, rightAxes, axisLayout]);

  const xAxesMetrics = useMemo((): XAxisMetrics[] => {
    const isMobile = width < 768 || height < 500;
    let currentOffset = 0;
    return activeXAxesUsed.map(axis => {
      const base = getXAxisMetrics(isMobile, axis.xMode);
      const metrics = { ...base, id: axis.id, cumulativeOffset: currentOffset };
      currentOffset += base.height;
      return metrics;
    });
  }, [activeXAxesUsed, width, height]);

  const padding = useMemo(() => {
    const isMobile = width < 768 || height < 500;
    const base = isMobile ? BASE_PADDING_MOBILE : BASE_PADDING_DESKTOP;
    const leftSum = leftAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const rightSum = rightAxes.reduce((sum, a) => sum + (axisLayout[a.id]?.total || 40), 0);
    const bottom = xAxesMetrics.length > 0 ? xAxesMetrics.reduce((sum, m) => sum + m.height, 0) : base.bottom;
    return { ...base, left: base.left + leftSum, right: base.right + rightSum, bottom };
  }, [leftAxes, rightAxes, axisLayout, xAxesMetrics, width, height]);

  const chartWidth = Math.max(0, width - padding.left - padding.right);
  const chartHeight = Math.max(0, height - padding.top - padding.bottom);

  const { handleAutoScaleY, handleAutoScaleX } = useAutoScale({
    isLoaded, series, yAxes, activeYAxes, activeXAxesUsed, datasets,
    padding, chartHeight, targetXAxes, targetYs, startAnimation, lastAppliedViewId,
  });

  const {
    panTarget, isCtrlPressed, isShiftPressed, zoomBoxState,
    isPanningRef, pressedKeys, hoveredAxisIdRef, hoveredXAxisIdRef,
    handleMouseDown, handleTouchStart, handleWheel,
  } = usePanZoom({
    containerRef, width, height, padding, chartWidth, chartHeight,
    activeXAxes: activeXAxesUsed, activeYAxes, xAxesById, yAxesById,
    targetXAxes, targetYs, startAnimation,
    xAxesMetrics, axisLayout, leftAxes, rightAxes, leftOffsets, rightOffsets,
    handleAutoScaleX, handleAutoScaleY,
  });

  // Forward pressedKeys ref so startAnimation's applyKeyboardZoom can see it
  useEffect(() => { pressedKeysRef.current = pressedKeys.current; });

  const xAxesLayout = useMemo((): XAxisLayout[] => {
    const activeDsIds = new Set(series.map(s => s.sourceId));
    const dsToX: Record<string, string> = {};
    const dsByX: DatasetsByAxisId = {};
    datasets.forEach(d => { if (activeDsIds.has(d.id)) { const xId = d.xAxisId || 'axis-1'; dsToX[d.id] = xId; if (!dsByX[xId]) dsByX[xId] = []; dsByX[xId].push(d); } });

    return activeXAxesUsed.map(axis => {
      const r = axis.max - axis.min, isDate = axis.xMode === 'date';
      const dss = dsByX[axis.id] || [];
      const title = Array.from(new Set(dss.map((d: Dataset) => d.xAxisColumn))).join(' / ');
      const color = themeColors.labelColor;
      if (r <= 0 || chartWidth <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };

      if (!isDate) {
        const locked = lockedXSteps.current[axis.id]?.step;
        const step = (isPanningRef.current && locked) ? locked : calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
        lockedXSteps.current[axis.id] = { step };
        if (step <= 0) return { id: axis.id, ticks: { result: [], step: 1, precision: 0, isXDate: false as const }, title, color };
        const precision = calcNumericPrecision(step);
        return { id: axis.id, ticks: { result: calcNumericTicks(axis.min, axis.max, step), step, precision, isXDate: false as const }, title, color };
      } else {
        const lockedTs = lockedXSteps.current[axis.id]?.timeStep;
        const ts = (isPanningRef.current && lockedTs) ? lockedTs : getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
        lockedXSteps.current[axis.id] = { timeStep: ts };
        return { id: axis.id, ticks: { result: generateTimeTicks(axis.min, axis.max, ts), isXDate: true as const, secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts) }, title, color };
      }
    });
  }, [activeXAxesUsed, chartWidth, series, datasets, themeColors.labelColor, isPanningRef]);

  const gridXViewports = useMemo(() => activeXAxesUsed.map(axis => ({ id: axis.id, xMin: axis.min, xMax: axis.max })), [activeXAxesUsed]);
  const gridYViewports = useMemo(() => activeYAxesLayout.map(axis => ({ id: axis.id, xMin: xAxes[0]?.min ?? 0, xMax: xAxes[0]?.max ?? 1, yMin: axis.min, yMax: axis.max })), [activeYAxesLayout, xAxes]);

  return (
    <main className="plot-area" ref={containerRef}
      onMouseDown={(e) => handleMouseDown(e, 'all')}
      onTouchStart={(e) => handleTouchStart(e, 'all')}
      onWheel={(e) => handleWheel(e, 'all')}
      style={{ position: 'relative', cursor: panTarget ? 'grabbing' : (zoomBoxState || isCtrlPressed ? 'zoom-in' : (isShiftPressed ? 'ew-resize' : 'crosshair')), backgroundColor: themeColors.plotBg, overflow: 'hidden', touchAction: 'none', userSelect: 'none' }}
    >
      {datasets.length === 0 && <div className="chart-no-data">No data</div>}
      <GridLines xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} gridColor={themeColors.gridColor} xViewports={gridXViewports} yViewports={gridYViewports} />
      <div className="chart-webgl-layer">
        <ErrorBoundary level="component">
          <WebGLRenderer key={themeName} datasets={datasets} series={series} xAxes={xAxes} yAxes={yAxes} width={width} height={height} padding={padding} isInteracting={isPanningRef.current || isAnimating.current} highlightedSeriesId={highlightedSeriesId} />
        </ErrorBoundary>
      </div>
      <AxesLayer xAxes={xAxesLayout} yAxes={activeYAxesLayout} width={width} height={height} padding={padding} series={series} axisLayout={axisLayout} allXAxes={xAxes} xAxesMetrics={xAxesMetrics} axisColor={themeColors.axisColor} zeroLineColor={themeColors.zeroLineColor} labelColor={themeColors.labelColor} secLabelBg={themeColors.secLabelBg} leftOffsets={leftOffsets} rightOffsets={rightOffsets} />
      {xAxesMetrics.map(m => {
        const bY = padding.bottom - m.cumulativeOffset - m.height;
        return <div key={`wheel-x-${m.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { xAxisId: m.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { xAxisId: m.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { xAxisId: m.id }); }} onDoubleClick={e => { e.stopPropagation(); handleAutoScaleX(m.id); }} style={{ position: 'absolute', bottom: bY, left: padding.left, right: padding.right, height: m.height, cursor: 'ew-resize', zIndex: 20 }} />;
      })}
      {activeYAxes.map(a => {
        const isL = a.position === 'left', am = axisLayout[a.id] || { total: 40 };
        const xP = isL ? padding.left - (leftOffsets[a.id] ?? 0) - am.total : width - padding.right + (rightOffsets[a.id] ?? 0);
        return <div key={`wheel-${a.id}`} onWheel={e => { e.stopPropagation(); handleWheel(e, { yAxisId: a.id }); }} onMouseDown={e => { e.stopPropagation(); handleMouseDown(e, { yAxisId: a.id }); }} onTouchStart={e => { e.stopPropagation(); handleTouchStart(e, { yAxisId: a.id }); }} onDoubleClick={e => { e.stopPropagation(); const rect = containerRef.current?.getBoundingClientRect(); handleAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined); }} style={{ position: 'absolute', left: xP, top: padding.top, width: am.total, bottom: padding.bottom, cursor: 'ns-resize', zIndex: 20 }} />;
      })}
      <Crosshair containerRef={containerRef} padding={padding} width={width} height={height} isPanning={!!panTarget || !!zoomBoxState} xAxes={xAxes} yAxes={activeYAxes} datasets={datasets} series={series} tooltipColor={themeColors.tooltipColor} snapLineColor={themeColors.snapLineColor} tooltipDividerColor={themeColors.tooltipDividerColor} tooltipSubColor={themeColors.tooltipSubColor} />
      {zoomBoxState && <svg width="100%" height="100%" className="chart-abs-fill" style={{ zIndex: 30 }}><rect x={Math.min(zoomBoxState.startX, zoomBoxState.endX)} y={Math.min(zoomBoxState.startY, zoomBoxState.endY)} width={Math.abs(zoomBoxState.endX - zoomBoxState.startX)} height={Math.abs(zoomBoxState.endY - zoomBoxState.startY)} fill="rgba(0, 123, 255, 0.2)" stroke="#007bff" strokeWidth="1" /></svg>}
      {series.length > 0 && legendVisible && <ChartLegend series={series} onToggleVisibility={(id, hidden) => useGraphStore.getState().updateSeriesVisibility(id, hidden)} onHighlight={(id) => useGraphStore.getState().setHighlightedSeries(id)} />}
      {datasets.length > 0 && (
        <div className="chart-fit-btns" style={{ bottom: padding.bottom + 8, right: padding.right + 8 }}>
          <button onClick={() => { handleAutoScaleX(); activeYAxes.forEach(a => handleAutoScaleY(a.id)); }} title="Fit All (Double-click plot also works)" className="chart-fit-btn">Fit All</button>
        </div>
      )}
    </main>
  );
};

export default ChartContainer;
```

- [x] **Step 2: Verify TypeScript compiles**

```
npx tsc -b --noEmit
```
Expected: No errors

- [x] **Step 3: Run full test suite**

```
npx vitest run
```
Expected: All tests pass (same count as before)

- [x] **Step 4: Commit**

```bash
git add src/components/Plot/ChartContainer.tsx
git commit -m "refactor: slim ChartContainer to ~150-line composition using extracted hooks and components"
```

---

## Task 8: Run full build and verify

- [x] **Step 1: Full build**

```
npm run build
```
Expected: No TypeScript errors, successful bundle output

- [x] **Step 2: Run all tests**

```
npm run test
```
Expected: All tests pass

- [x] **Step 3: Run lint**

```
npm run lint
```
Expected: No errors (fix any `noUnusedLocals` violations if the old ChartContainer imports are gone)

- [x] **Step 4: Commit if any lint fixes needed**

```bash
git add -A
git commit -m "fix: clean up unused imports after ChartContainer refactor"
```

---

## Summary of Files After Refactor

| File | Lines (approx) | Role |
|------|----------------|------|
| `ChartContainer.tsx` | ~150 | Composition only |
| `GridLines.tsx` | ~35 | SVG grid rendering |
| `AxesLayer.tsx` | ~170 | SVG/DOM axes rendering |
| `Crosshair.tsx` | ~140 | Mouse tracking + tooltip |
| `chartTypes.ts` | ~30 | Shared type definitions |
| `usePanZoom.ts` | ~200 | All interaction logic |
| `useAutoScale.ts` | ~130 | Auto-scale + view restore |
| `axisCalculations.ts` | ~30 | Tick/step math utilities |
