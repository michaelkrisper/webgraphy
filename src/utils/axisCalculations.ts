// src/utils/axisCalculations.ts

/** Tolerance for floating-point axis bounds comparisons. */
export const AXIS_EPSILON = 1e-10;

/** Identifier of the implicit default x-axis (used when a dataset has no explicit xAxisId). */
export const DEFAULT_X_AXIS_ID = "axis-1";

/**
 * Resolve an axis by id. Axes are a fixed set of 9 slots with ids
 * `axis-1`..`axis-9` kept in canonical order, so the id maps directly to its
 * array index (`axis-N` -> slot N-1) without a lookup map. Falls back to a
 * scan for non-canonical ids or out-of-order arrays, matching `.find`
 * semantics (the matching axis, or undefined).
 */
export function getAxisById<T extends { id: string }>(
	axes: T[],
	id: string,
): T | undefined {
	const direct = axes[Number(id.slice(5)) - 1];
	if (direct?.id === id) return direct;
	return axes.find((a) => a.id === id);
}

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

/** Hard cap on generated numeric ticks, guarding against pathological steps. */
const MAX_NUMERIC_TICKS = 200;

/** Generate tick values from min to max for a given step. */
export function calcNumericTicks(
	min: number,
	max: number,
	step: number,
): number[] {
	const first = Math.ceil((min - step) / step) * step;
	const ticks: number[] = [];
	for (let t = first; t <= max + step; t += step) {
		if (ticks.length > MAX_NUMERIC_TICKS) break;
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
	let xUpdates: Record<string, { min: number; max: number }>;
	let yUpdates: Record<string, { min: number; max: number }>;

	if (scratch) {
		scratch.xUpdates = {};
		scratch.yUpdates = {};
		xUpdates = scratch.xUpdates;
		yUpdates = scratch.yUpdates;
	} else {
		xUpdates = {};
		yUpdates = {};
	}

	let hasUpdates = false;

	for (let i = 0; i < state.xAxes.length; i++) {
		const axis = state.xAxes[i];
		const target = targetXAxes[axis.id];
		if (
			target &&
			(Math.abs(axis.min - target.min) > AXIS_EPSILON ||
				Math.abs(axis.max - target.max) > AXIS_EPSILON)
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
			(Math.abs(axis.min - target.min) > AXIS_EPSILON ||
				Math.abs(axis.max - target.max) > AXIS_EPSILON)
		) {
			yUpdates[axis.id] = { min: target.min, max: target.max };
			hasUpdates = true;
		}
	}

	return { xUpdates, yUpdates, hasUpdates };
}

/** Fraction of the remaining distance covered per rAF frame when easing
 * wheel-zoom toward its target. */
export const ZOOM_EASE_FACTOR = 0.35;

/** Relative distance (vs. target span) below which easing snaps onto the
 * target — ~0.25px on a typical chart width. */
const EASE_SNAP_EPSILON = 2e-4;

/**
 * Eases the rendered viewport toward the targets in `updates`: moves each
 * `displayed` entry `factor` of the remaining way and rewrites the update to
 * that eased value, so the caller renders the eased range. `displayed` is the
 * caller-owned record of what was last rendered, seeded from `axes` when an
 * axis is first seen. With `factor >= 1` it only records the targets (no
 * easing). Returns true once every update sits exactly on its target.
 */
export function easeAxisUpdates(
	displayed: Record<string, { min: number; max: number }>,
	updates: Record<string, { min: number; max: number }>,
	axes: Array<{ id: string; min: number; max: number }>,
	factor: number,
): boolean {
	let converged = true;
	let axesById: Record<string, { id: string; min: number; max: number }> | null = null;
	for (const id in updates) {
		const target = updates[id];
		let shown = displayed[id];
		if (!shown) {
			if (!axesById) {
				axesById = {};
				for (let i = 0; i < axes.length; i++) {
					axesById[axes[i].id] = axes[i];
				}
			}
			const axis = axesById[id];
			shown = displayed[id] = {
				min: axis ? axis.min : target.min,
				max: axis ? axis.max : target.max,
			};
		}
		if (factor >= 1) {
			shown.min = target.min;
			shown.max = target.max;
			continue;
		}
		const span = Math.max(Math.abs(target.max - target.min), Number.MIN_VALUE);
		const min = shown.min + (target.min - shown.min) * factor;
		const max = shown.max + (target.max - shown.max) * factor;
		if (
			Math.abs(target.min - min) <= span * EASE_SNAP_EPSILON &&
			Math.abs(target.max - max) <= span * EASE_SNAP_EPSILON
		) {
			shown.min = target.min;
			shown.max = target.max;
		} else {
			shown.min = min;
			shown.max = max;
			target.min = min;
			target.max = max;
			converged = false;
		}
	}
	return converged;
}
