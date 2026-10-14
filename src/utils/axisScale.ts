/**
 * Linear/log axis scale math shared by the renderer host, the render worker,
 * interaction, autoscale, crosshair, and SVG export.
 *
 * A log axis keeps its `min`/`max` in data units (always > 0); everything
 * positional — pixel mapping, pan, zoom, easing, padding — happens in "scale
 * space", which is the value itself on a linear axis and log10(value) on a
 * log axis. Non-positive values have no position on a log axis (NaN).
 */

export type AxisScale = "linear" | "log";

/** Exponent clamp for log ranges: zooming out never reaches 0 or Infinity. */
const LOG_MIN_EXP = -300;
const LOG_MAX_EXP = 300;

export const isLogAxis = (axis: { scale?: AxisScale } | null | undefined) =>
	axis?.scale === "log";

/** Value → scale space (log10 on log axes, NaN for v <= 0 there). */
export function toScale(v: number, log: boolean): number {
	if (!log) return v;
	return v > 0 ? Math.log10(v) : Number.NaN;
}

/** Scale space → value; log exponents are clamped to stay finite and > 0. */
export function fromScale(u: number, log: boolean): number {
	if (!log) return u;
	return 10 ** Math.min(LOG_MAX_EXP, Math.max(LOG_MIN_EXP, u));
}

/** Position of `v` across [min, max] as a 0..1 fraction (NaN if unplaceable). */
export function axisFraction(
	v: number,
	min: number,
	max: number,
	log: boolean,
): number {
	if (!log) return (v - min) / (max - min);
	const lo = Math.log10(min);
	return (toScale(v, true) - lo) / (Math.log10(max) - lo);
}

/** Inverse of {@link axisFraction}. */
export function axisValueAt(
	f: number,
	min: number,
	max: number,
	log: boolean,
): number {
	if (!log) return min + f * (max - min);
	const lo = Math.log10(min);
	return fromScale(lo + f * (Math.log10(max) - lo), true);
}

/**
 * Apply a linear range operation (pan, zoom, ease) in scale space: the range
 * is mapped into it, `op` runs on the mapped edges, and the result is mapped
 * back. On a linear axis this is just `op(min, max)`.
 */
export function mapRangeInScale(
	min: number,
	max: number,
	log: boolean,
	op: (lo: number, hi: number) => { min: number; max: number },
): { min: number; max: number } {
	if (!log) return op(min, max);
	const r = op(Math.log10(min), Math.log10(max));
	return { min: fromScale(r.min, true), max: fromScale(r.max, true) };
}

/**
 * Widen [min, max] by `ratio` of its span on each side, in scale space (a
 * degenerate span pads by `ratio`). On a log axis this pads by a constant
 * factor, so the result stays positive.
 */
export function padRange(
	min: number,
	max: number,
	ratio: number,
	log: boolean,
): { min: number; max: number } {
	return mapRangeInScale(min, max, log, (lo, hi) => {
		const pad = (hi - lo || 1) * ratio;
		return { min: lo - pad, max: hi + pad };
	});
}

/** Fallback log range when there is no positive data to fit. */
const DEFAULT_LOG_RANGE = { min: 1, max: 100 };

/**
 * A range that is valid on a log axis: kept when already positive, else
 * fitted to `positive` (padded data bounds) or derived from a positive max.
 */
export function logSafeRange(
	min: number,
	max: number,
	positive: { min: number; max: number } | null,
): { min: number; max: number } {
	if (min > 0 && max > min && Number.isFinite(max)) return { min, max };
	if (positive) return padRange(positive.min, positive.max, 0.05, true);
	if (max > 0 && Number.isFinite(max)) return { min: max / 1000, max };
	return { ...DEFAULT_LOG_RANGE };
}

// Columns are immutable, so positive bounds are computed once per array
// identity (and refPoint, which can differ between datasets sharing data).
const positiveBoundsCache = new WeakMap<
	Float32Array,
	{ ref: number; bounds: { min: number; max: number } | null }
>();

/**
 * Min/max over the strictly positive values of a column (`data[i] + ref`),
 * or null when none are positive — what a log axis can show.
 */
export function positiveBounds(
	data: Float32Array,
	ref: number,
): { min: number; max: number } | null {
	const cached = positiveBoundsCache.get(data);
	if (cached && cached.ref === ref) return cached.bounds;
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < data.length; i++) {
		const v = data[i] + ref;
		if (!(v > 0) || v === Infinity) continue;
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const bounds = min === Infinity ? null : { min, max };
	positiveBoundsCache.set(data, { ref, bounds });
	return bounds;
}
