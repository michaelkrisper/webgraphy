import type { Dataset, SeriesConfig } from "../services/persistence";
import { DEFAULT_X_AXIS_ID } from "../utils/axisCalculations";
import { getColumnIndex } from "../utils/columns";

interface Range {
	min: number;
	max: number;
}

export const AXIS_PADDING_RATIO = 0.05;

export const padRange = ({ min, max }: Range): Range => {
	const pad = (max - min || 1) * AXIS_PADDING_RATIO;
	return { min: min - pad, max: max + pad };
};

const isFiniteRange = (r: Range | undefined): r is Range =>
	!!r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max;

const unite = (a: Range | undefined, b: Range): Range =>
	a ? { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) } : { ...b };

function columnBounds(ds: Dataset, column: string): Range | undefined {
	const bounds = ds.data[getColumnIndex(ds, column)]?.bounds;
	return isFiniteRange(bounds) ? bounds : undefined;
}

/**
 * Axis ranges to apply after series were added or rebound to another column.
 *
 * - A y axis no series used before is fitted to everything now on it, as is
 *   the axis of a series whose column changed.
 * - A y axis that already carried series keeps its (possibly user-zoomed)
 *   range unless the new data would be entirely off-screen; then it widens
 *   just enough to include it.
 * - An x axis no previous series' dataset sat on is fitted to its datasets.
 */
export function fitForNewSeries(
	prev: readonly SeriesConfig[],
	next: readonly SeriesConfig[],
	datasetsById: ReadonlyMap<string, Dataset>,
	yAxes: readonly ({ id: string } & Range)[],
): { x: Record<string, Range>; y: Record<string, Range> } {
	const x: Record<string, Range> = {};
	const y: Record<string, Range> = {};

	const prevById = new Map(prev.map((s) => [s.id, s]));
	const added: SeriesConfig[] = [];
	const rebound: SeriesConfig[] = [];
	for (const s of next) {
		const p = prevById.get(s.id);
		if (!p) added.push(s);
		else if (p.yColumn !== s.yColumn || p.sourceId !== s.sourceId) {
			rebound.push(s);
		}
	}
	if (added.length === 0 && rebound.length === 0) return { x, y };

	const xAxisOf = (s: SeriesConfig) => {
		const ds = datasetsById.get(s.sourceId);
		return ds ? ds.xAxisId || DEFAULT_X_AXIS_ID : undefined;
	};
	const prevYAxes = new Set(prev.map((s) => s.yAxisId));
	const prevXAxes = new Set(prev.map(xAxisOf));

	const seriesBounds = (list: readonly SeriesConfig[]) => {
		let r: Range | undefined;
		for (const s of list) {
			const ds = datasetsById.get(s.sourceId);
			const b = ds && columnBounds(ds, s.yColumn);
			if (b) r = unite(r, b);
		}
		return r;
	};

	const refit = new Set(rebound.map((s) => s.yAxisId));
	const addedByAxis = new Map<string, SeriesConfig[]>();
	for (const s of added) {
		if (!prevYAxes.has(s.yAxisId)) refit.add(s.yAxisId);
		else {
			const list = addedByAxis.get(s.yAxisId) ?? [];
			list.push(s);
			addedByAxis.set(s.yAxisId, list);
		}
	}

	for (const axisId of refit) {
		const r = seriesBounds(next.filter((s) => s.yAxisId === axisId));
		if (r) y[axisId] = padRange(r);
	}
	for (const [axisId, list] of addedByAxis) {
		if (refit.has(axisId)) continue;
		const r = seriesBounds(list);
		const axis = yAxes.find((a) => a.id === axisId);
		if (!r || !isFiniteRange(axis)) continue;
		if (r.max < axis.min || r.min > axis.max) {
			y[axisId] = unite(axis, padRange(r));
		}
	}

	const freshX = new Set<string>();
	for (const s of added) {
		const id = xAxisOf(s);
		if (id && !prevXAxes.has(id)) freshX.add(id);
	}
	for (const xId of freshX) {
		let r: Range | undefined;
		const seen = new Set<string>();
		for (const s of next) {
			if (seen.has(s.sourceId) || xAxisOf(s) !== xId) continue;
			seen.add(s.sourceId);
			const ds = datasetsById.get(s.sourceId);
			const b = ds && columnBounds(ds, ds.xAxisColumn);
			if (b) r = unite(r, b);
		}
		if (r) x[xId] = padRange(r);
	}

	return { x, y };
}
