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

export interface AxesFrame {
  xUpdates: Record<string, { min: number; max: number }>;
  yUpdates: Record<string, { min: number; max: number }>;
}

/**
 * Returns updates to sync axes with targets instantly (no lerp).
 * Uses epsilon-based comparison to prevent infinite update loops.
 */
export function syncAxesWithTargets(
  state: { xAxes: Array<{ id: string, min: number, max: number }>, yAxes: Array<{ id: string, min: number, max: number }> },
  targetXAxes: Record<string, { min: number, max: number }>,
  targetYs: Record<string, { min: number, max: number }>
): AxesFrame {
  const xUpdates: Record<string, { min: number; max: number }> = {};
  const yUpdates: Record<string, { min: number; max: number }> = {};
  const EPSILON = 1e-10;

  state.xAxes.forEach(axis => {
    const target = targetXAxes[axis.id];
    if (target && (Math.abs(axis.min - target.min) > EPSILON || Math.abs(axis.max - target.max) > EPSILON)) {
      xUpdates[axis.id] = { min: target.min, max: target.max };
    }
  });

  state.yAxes.forEach(axis => {
    const target = targetYs[axis.id];
    if (target && (Math.abs(axis.min - target.min) > EPSILON || Math.abs(axis.max - target.max) > EPSILON)) {
      yUpdates[axis.id] = { min: target.min, max: target.max };
    }
  });

  return { xUpdates, yUpdates };
}
