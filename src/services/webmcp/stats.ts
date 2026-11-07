import type { DataColumn } from "../persistence";

export interface ColumnStats {
	/** Rows considered: all, or those whose x lies in the range. */
	rows: number;
	/** Finite values among them. */
	n: number;
	min: number;
	max: number;
	mean: number;
	/** Sample standard deviation (n - 1); null below two values. */
	std: number | null;
}

type Column = Pick<DataColumn, "data" | "refPoint">;

/**
 * Summary statistics of `y`, optionally over the rows whose `x` lies within
 * [xMin, xMax]. The accumulation runs on the stored offsets and adds
 * `refPoint` once at the end, so date columns keep their precision. x is not
 * assumed sorted (scatter data), so this is a linear scan.
 */
export function columnStatistics(
	y: Column,
	x?: Column,
	range?: { min: number; max: number },
): ColumnStats {
	const filter = x && range ? { x, ...range } : null;
	const len = filter
		? Math.min(filter.x.data.length, y.data.length)
		: y.data.length;
	let rows = 0;
	let n = 0;
	let mean = 0;
	let m2 = 0;
	let min = Infinity;
	let max = -Infinity;
	for (let i = 0; i < len; i++) {
		if (filter) {
			const xv = filter.x.data[i] + filter.x.refPoint;
			if (!(xv >= filter.min && xv <= filter.max)) continue;
		}
		rows++;
		const v = y.data[i];
		if (!Number.isFinite(v)) continue;
		// Welford: stable where a sum of squares would cancel.
		n++;
		const delta = v - mean;
		mean += delta / n;
		m2 += delta * (v - mean);
		if (v < min) min = v;
		if (v > max) max = v;
	}
	const ref = y.refPoint;
	return {
		rows,
		n,
		min: n ? min + ref : Number.NaN,
		max: n ? max + ref : Number.NaN,
		mean: n ? mean + ref : Number.NaN,
		std: n > 1 ? Math.sqrt(m2 / (n - 1)) : null,
	};
}
