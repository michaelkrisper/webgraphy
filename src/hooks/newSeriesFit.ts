import type { Dataset, SeriesConfig } from "../services/persistence";
import { DEFAULT_X_AXIS_ID } from "../utils/axisCalculations";
import {
	type AxisScale,
	padRange as padScaleRange,
	positiveBounds,
} from "../utils/axisScale";
import { getColumnIndex } from "../utils/columns";

interface Range {
	min: number;
	max: number;
}

export const AXIS_PADDING_RATIO = 0.05;

/** Pads in scale space, so a log axis stays positive. */
export const padRange = ({ min, max }: Range, log = false): Range =>
	padScaleRange(min, max, AXIS_PADDING_RATIO, log);

const isFiniteRange = (r: Range | undefined): r is Range =>
	!!r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max;

const unite = (a: Range | undefined, b: Range): Range =>
	a ? { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) } : { ...b };

/** A log axis can only show the strictly positive values. */
function columnBounds(
	ds: Dataset,
	column: string,
	log = false,
): Range | undefined {
	const col = ds.data[getColumnIndex(ds, column)];
	if (!col) return undefined;
	const bounds = log ? positiveBounds(col.data, col.refPoint) : col.bounds;
	return bounds && isFiniteRange(bounds) ? bounds : undefined;
}

/**
 * Axis ranges to apply after series were added or rebound to another column.
 *
 * - A y axis no series used before is fitted to everything now on it, as is
 *   the axis of a series whose column changed.
 * - A y axis that already carried series widens just enough to include the
 *   new data when it still shows all of its previous data (not zoomed in) and
 *   the new data sticks out. A user-zoomed axis keeps its range unless the
 *   new data would be entirely off-screen.
 * - An x axis no previous series' dataset sat on is fitted to its datasets;
 *   one that did (a dataset joining a shared x axis) widens by the y rule.
 */
export function fitForNewSeries(
	prev: readonly SeriesConfig[],
	next: readonly SeriesConfig[],
	datasetsById: ReadonlyMap<string, Dataset>,
	yAxes: readonly ({ id: string; scale?: AxisScale } & Range)[],
	xAxes: readonly ({ id: string; scale?: AxisScale } & Range)[] = [],
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
	// Series of a dataset removed in the same step (an import replacing the
	// demo) no longer occupy their axis: it is fresh and gets fitted.
	const prevYAxes = new Set(
		prev.filter((s) => datasetsById.has(s.sourceId)).map((s) => s.yAxisId),
	);
	const isLogY = (axisId: string) =>
		yAxes.find((a) => a.id === axisId)?.scale === "log";
	const isLogX = (axisId: string) =>
		xAxes.find((a) => a.id === axisId)?.scale === "log";
	const prevXAxes = new Set(prev.map(xAxisOf));

	const seriesBounds = (list: readonly SeriesConfig[], log = false) => {
		let r: Range | undefined;
		for (const s of list) {
			const ds = datasetsById.get(s.sourceId);
			const b = ds && columnBounds(ds, s.yColumn, log);
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
		const log = isLogY(axisId);
		const r = seriesBounds(
			next.filter((s) => s.yAxisId === axisId),
			log,
		);
		if (r) y[axisId] = padRange(r, log);
	}
	for (const [axisId, list] of addedByAxis) {
		if (refit.has(axisId)) continue;
		const log = isLogY(axisId);
		const widened = widen(
			yAxes.find((a) => a.id === axisId),
			seriesBounds(
				prev.filter((s) => s.yAxisId === axisId),
				log,
			),
			seriesBounds(list, log),
			log,
		);
		if (widened) y[axisId] = widened;
	}

	const xBounds = (list: readonly SeriesConfig[], xId: string, log: boolean) => {
		let r: Range | undefined;
		const seen = new Set<string>();
		for (const s of list) {
			if (seen.has(s.sourceId) || xAxisOf(s) !== xId) continue;
			seen.add(s.sourceId);
			const ds = datasetsById.get(s.sourceId);
			const b = ds && columnBounds(ds, ds.xAxisColumn, log);
			if (b) r = unite(r, b);
		}
		return r;
	};
	const addedX = new Set<string>();
	for (const s of added) {
		const id = xAxisOf(s);
		if (id) addedX.add(id);
	}
	for (const xId of addedX) {
		const log = isLogX(xId);
		if (!prevXAxes.has(xId)) {
			const r = xBounds(next, xId, log);
			if (r) x[xId] = padRange(r, log);
			continue;
		}
		const widened = widen(
			xAxes.find((a) => a.id === xId),
			xBounds(prev, xId, log),
			xBounds(added, xId, log),
			log,
		);
		if (widened) x[xId] = widened;
	}

	return { x, y };
}

/**
 * The range an in-use axis widens to for newly added data `r`, or undefined
 * to keep it. An axis still showing all of its previous data (`shown`) is not
 * user-zoomed, so the new data should fit completely, not just poke into
 * view; a zoomed axis only moves when the new data would be off-screen.
 */
function widen(
	axis: Range | undefined,
	shown: Range | undefined,
	r: Range | undefined,
	log: boolean,
): Range | undefined {
	if (!r || !isFiniteRange(axis)) return undefined;
	const unzoomed = !!shown && axis.min <= shown.min && axis.max >= shown.max;
	const clipped = r.min < axis.min || r.max > axis.max;
	const offScreen = r.max < axis.min || r.min > axis.max;
	return offScreen || (unzoomed && clipped)
		? unite(axis, padRange(r, log))
		: undefined;
}
