// src/utils/axisCalculations.ts

import { type AxisScale, fromScale, toScale } from "./axisScale";

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

/**
 * `precision` sentinel for log-axis tick labels: values are formatted on
 * their own (plain decimals near 1, superscript powers of ten far from it)
 * instead of with a shared fixed decimal count.
 */
export const LOG_TICK_PRECISION = -1;

const SUPERSCRIPT: Record<string, string> = {
	"-": "\u207B",
	"0": "\u2070",
	"1": "\u00B9",
	"2": "\u00B2",
	"3": "\u00B3",
	"4": "\u2074",
	"5": "\u2075",
	"6": "\u2076",
	"7": "\u2077",
	"8": "\u2078",
	"9": "\u2079",
};

const superscript = (n: number) =>
	String(n).replace(/[-0-9]/g, (c) => SUPERSCRIPT[c]);

/** Log tick label: 0.001 … 1000 as plain decimals, else 10⁶ / 2×10⁻⁵. */
export function formatLogTickLabel(val: number): string {
	if (!(val > 0)) return formatAxisLabel(val, 0);
	let e = Math.floor(Math.log10(val));
	let m = Number((val / 10 ** e).toPrecision(6));
	if (m >= 10) {
		e++;
		m = Number((m / 10).toPrecision(6));
	}
	if (e >= -3 && e <= 3) return String(Number(val.toPrecision(6)));
	return m === 1 ? `10${superscript(e)}` : `${m}\u00D710${superscript(e)}`;
}

export function formatAxisLabel(val: number, precision: number): string {
	if (precision === LOG_TICK_PRECISION) return formatLogTickLabel(val);
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

/** Minimum px between log minor ticks (the 9→10 gap) for them to show. */
const LOG_MINOR_MIN_PX = 2;
/** Decade strides for sparse log axes, so labels land on round exponents. */
const LOG_DECADE_STRIDES = [1, 2, 3, 5, 10, 20, 25, 50, 100];

export interface LogTicks {
	/** Labelled ticks (gridded). */
	ticks: number[];
	/** Unlabelled ticks between them (short marks, light grid). */
	minorTicks: number[];
	/** LOG_TICK_PRECISION, or a decimal count for the linear fallback. */
	precision: number;
	actualStep: number;
}

/**
 * Ticks for a log axis spanning [min, max] (both > 0) over `spanPx` pixels,
 * keeping labels at least `minLabelPx` apart:
 * - many decades: every k-th decade labelled, the skipped ones minor;
 * - a few decades: each decade labelled (plus 2 and 5 when roomy), 2..9 minor;
 * - under about a decade (fewer than two labels would show): linear nice
 *   ticks on the value range, which are near-uniform over so short a span.
 */
export function calcLogTicks(
	min: number,
	max: number,
	spanPx: number,
	minLabelPx: number,
): LogTicks {
	const empty = { ticks: [], minorTicks: [], precision: 0, actualStep: 1 };
	if (!(min > 0) || !(max > min) || !(spanPx > 0)) return empty;
	const lo = Math.log10(min);
	const hi = Math.log10(max);
	if (!Number.isFinite(lo) || !Number.isFinite(hi)) return empty;
	const pxPerDecade = spanPx / (hi - lo);
	const eLo = Math.floor(lo);
	const eHi = Math.ceil(hi);
	const decade = (e: number) => (e < 0 ? 1 / 10 ** -e : 10 ** e);

	if (pxPerDecade < minLabelPx) {
		const need = Math.ceil(minLabelPx / pxPerDecade);
		const stride =
			LOG_DECADE_STRIDES.find((k) => k >= need) ?? Math.ceil(need / 100) * 100;
		const ticks: number[] = [];
		const minorTicks: number[] = [];
		const showMinor = pxPerDecade >= LOG_MINOR_MIN_PX * 2;
		for (let e = Math.floor(eLo / stride) * stride; e <= eHi; e++) {
			if (e % stride === 0) ticks.push(decade(e));
			else if (showMinor) minorTicks.push(decade(e));
		}
		return {
			ticks,
			minorTicks,
			precision: LOG_TICK_PRECISION,
			actualStep: stride,
		};
	}

	const labelled = pxPerDecade * Math.log10(2) >= minLabelPx ? [1, 2, 5] : [1];
	const showMinor = pxPerDecade * Math.log10(10 / 9) >= LOG_MINOR_MIN_PX;
	const ticks: number[] = [];
	const minorTicks: number[] = [];
	let visible = 0;
	for (let e = eLo; e <= eHi; e++) {
		const base = decade(e);
		for (let m = 1; m <= 9; m++) {
			if (e === eHi && m > 1) break;
			const v = e < 0 ? m / 10 ** -e : m * base;
			if (labelled.includes(m)) {
				ticks.push(v);
				if (v >= min && v <= max) visible++;
			} else if (showMinor) {
				minorTicks.push(v);
			}
		}
	}
	if (visible >= 2) {
		return { ticks, minorTicks, precision: LOG_TICK_PRECISION, actualStep: 1 };
	}

	const step = calcNumericStep(
		max - min,
		Math.max(2, Math.floor(spanPx / minLabelPx)),
	);
	return {
		ticks: calcNumericTicks(min, max, step).filter((t) => t > 0),
		minorTicks: [],
		precision: calcNumericPrecision(step),
		actualStep: step,
	};
}

/** Px between y tick labels; the linear path derives its tick count from it. */
export const Y_TICK_SPACING_PX = 30;

/** Full Y-axis tick calculation: returns ticks, precision, and actualStep. */
export function calcYAxisTicks(
	min: number,
	max: number,
	chartHeight: number,
	lockedStep?: number,
	categoryCount?: number,
	log = false,
): {
	ticks: number[];
	precision: number;
	actualStep: number;
	minorTicks?: number[];
} {
	const range = max - min;
	if (range <= 0) return { ticks: [], precision: 0, actualStep: 1 };
	if (log && categoryCount === undefined) {
		return calcLogTicks(min, max, chartHeight, Y_TICK_SPACING_PX);
	}
	if (categoryCount !== undefined) {
		return {
			ticks: calcCategoricalTicks(min, max, categoryCount),
			precision: 0,
			actualStep: 1,
		};
	}
	const step =
		lockedStep ??
		calcNumericStep(
			range,
			Math.max(2, Math.floor(chartHeight / Y_TICK_SPACING_PX)),
		);
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
 * easing). Returns true once every update sits exactly on its target. Log
 * axes ease in log10 space, so a zoom stays anchored where the cursor was.
 */
export function easeAxisUpdates(
	displayed: Record<string, { min: number; max: number }>,
	updates: Record<string, { min: number; max: number }>,
	axes: Array<{ id: string; min: number; max: number; scale?: AxisScale }>,
	factor: number,
): boolean {
	let converged = true;
	let axesById: Record<
		string,
		{ id: string; min: number; max: number; scale?: AxisScale }
	> | null = null;
	const lookup = (id: string) => {
		if (!axesById) {
			axesById = {};
			for (let i = 0; i < axes.length; i++) {
				axesById[axes[i].id] = axes[i];
			}
		}
		return axesById[id];
	};
	for (const id in updates) {
		const target = updates[id];
		let shown = displayed[id];
		if (!shown) {
			const axis = lookup(id);
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
		const log = lookup(id)?.scale === "log";
		const tMin = toScale(target.min, log);
		const tMax = toScale(target.max, log);
		const span = Math.max(Math.abs(tMax - tMin), Number.MIN_VALUE);
		const sMin = toScale(shown.min, log);
		const sMax = toScale(shown.max, log);
		const eMin = sMin + (tMin - sMin) * factor;
		const eMax = sMax + (tMax - sMax) * factor;
		const min = fromScale(eMin, log);
		const max = fromScale(eMax, log);
		if (
			Math.abs(tMin - eMin) <= span * EASE_SNAP_EPSILON &&
			Math.abs(tMax - eMax) <= span * EASE_SNAP_EPSILON
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
