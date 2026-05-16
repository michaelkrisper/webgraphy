// src/utils/axisCalculations.ts

/** Round a raw step size to a nice human-readable step. */
export function calcNumericStep(range: number, maxTicks: number): number {
	if (range <= 0) return 1;
	const raw = range / Math.max(1, maxTicks);
	const mag = 10 ** Math.floor(Math.log10(Math.abs(raw) || 1));
	const norm = raw / mag;
	return (norm < 1.5 ? 1 : norm < 3 ? 2 : norm < 7 ? 5 : 10) * mag;
}

/** Decimal places needed to display a step value. */
export function calcNumericPrecision(step: number): number {
	return Math.min(20, Math.max(0, -Math.floor(Math.log10(step || 1))));
}

export function formatAxisLabel(val: number, precision: number): string {
	if (Math.abs(val) < 1e-12) return "0";
	const str = val.toFixed(precision);
	if (str.length > 12) {
		return val.toExponential(Math.min(precision, 4));
	}
	return str;
}

/** Generate categorical integer ticks 0..N-1 within [min,max]. */
export function calcCategoricalTicks(
	min: number,
	max: number,
	categoryCount: number,
): number[] {
	const lo = Math.max(0, Math.ceil(min));
	const hi = Math.min(categoryCount - 1, Math.floor(max));
	const ticks: number[] = [];
	for (let i = lo; i <= hi; i++) ticks.push(i);
	return ticks;
}

/** Generate tick values from min to max for a given step (capped at 200). */
export function calcNumericTicks(
	min: number,
	max: number,
	step: number,
): number[] {
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
	categoryCount?: number,
): { ticks: number[]; precision: number; actualStep: number } {
	const range = max - min;
	if (range <= 0) return { ticks: [], precision: 0, actualStep: 1 };
	if (categoryCount !== undefined) {
		return {
			ticks: calcCategoricalTicks(min, max, categoryCount),
			precision: 0,
			actualStep: 1,
		};
	}
	const step =
		lockedStep ??
		calcNumericStep(range, Math.max(2, Math.floor(chartHeight / 30)));
	if (step <= 0) return { ticks: [], precision: 0, actualStep: 1 };
	const precision = calcNumericPrecision(step);
	return {
		ticks: calcNumericTicks(min, max, step),
		precision,
		actualStep: step,
	};
}

export interface AxesFrame {
	xUpdates: Record<string, { min: number; max: number }>;
	yUpdates: Record<string, { min: number; max: number }>;
	hasUpdates: boolean;
}

/**
 * Returns updates to sync axes with targets instantly (no lerp).
 * Uses epsilon-based comparison to prevent infinite update loops.
 * `scratch` lets callers reuse output records across rAF frames.
 */
export function syncAxesWithTargets(
	state: {
		xAxes: Array<{ id: string; min: number; max: number }>;
		yAxes: Array<{ id: string; min: number; max: number }>;
	},
	targetXAxes: Record<string, { min: number; max: number }>,
	targetYs: Record<string, { min: number; max: number }>,
	scratch?: {
		xUpdates: Record<string, { min: number; max: number }>;
		yUpdates: Record<string, { min: number; max: number }>;
	},
): AxesFrame {
	const xUpdates = scratch?.xUpdates ?? {};
	const yUpdates = scratch?.yUpdates ?? {};
	for (const k in xUpdates) delete xUpdates[k];
	for (const k in yUpdates) delete yUpdates[k];
	const EPSILON = 1e-10;
	let hasUpdates = false;

	for (let i = 0; i < state.xAxes.length; i++) {
		const axis = state.xAxes[i];
		const target = targetXAxes[axis.id];
		if (
			target &&
			(Math.abs(axis.min - target.min) > EPSILON ||
				Math.abs(axis.max - target.max) > EPSILON)
		) {
			xUpdates[axis.id] = { min: target.min, max: target.max };
			hasUpdates = true;
		}
	}

	for (let i = 0; i < state.yAxes.length; i++) {
		const axis = state.yAxes[i];
		const target = targetYs[axis.id];
		if (
			target &&
			(Math.abs(axis.min - target.min) > EPSILON ||
				Math.abs(axis.max - target.max) > EPSILON)
		) {
			yUpdates[axis.id] = { min: target.min, max: target.max };
			hasUpdates = true;
		}
	}

	return { xUpdates, yUpdates, hasUpdates };
}
