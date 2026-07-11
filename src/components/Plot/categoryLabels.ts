// Per-axis categorical-label resolution, extracted from ChartContainer so
// the (deterministic, store-input-only) computation can be unit-tested in
// isolation.

import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../services/persistence";
import {
	DEFAULT_X_AXIS_ID,
	getAxisById,
} from "../../utils/axisCalculations";
import { getColumnIndex } from "../../utils/columns";

/** Cap on x-values sampled when deriving categorical labels for a forced axis. */
export const MAX_DERIVED_CATEGORY_LABELS = 1000;

export interface XAxisCategoryInfo {
	labels: string[];
	ticks?: number[];
}

/**
 * Resolve Y-axis categorical labels.
 *
 * Returns labels for an axis only when every series bound to it points at a
 * column whose data carries `categoryLabels` and all those label sets are
 * identical. Axes that mix categorical with non-categorical columns, or
 * disagree on labels, map to `undefined`.
 */
export function computeYAxisCategoryLabels(
	series: readonly SeriesConfig[],
	datasets: readonly Dataset[],
): Map<string, string[] | undefined> {
	const dsById = new Map(datasets.map((d) => [d.id, d]));

	const seriesByAxis = new Map<string, SeriesConfig[]>();
	for (const s of series) {
		const arr = seriesByAxis.get(s.yAxisId) || [];
		arr.push(s);
		seriesByAxis.set(s.yAxisId, arr);
	}

	const out = new Map<string, string[] | undefined>();
	seriesByAxis.forEach((axisSeries, axisId) => {
		let labels: string[] | undefined;
		let mismatch = false;
		for (const s of axisSeries) {
			const ds = dsById.get(s.sourceId);
			if (!ds) {
				mismatch = true;
				break;
			}
			const colIdx = getColumnIndex(ds, s.yColumn);
			const col = colIdx >= 0 ? ds.data[colIdx] : undefined;
			const cl = col?.categoryLabels;
			if (!cl) {
				mismatch = true;
				break;
			}
			if (!labels) labels = cl;
			else if (
				labels.length !== cl.length ||
				labels.some((v, i) => v !== cl[i])
			) {
				mismatch = true;
				break;
			}
		}
		out.set(axisId, mismatch ? undefined : labels);
	});
	return out;
}

/**
 * Resolve X-axis categorical labels for each axis bound by an active dataset.
 *
 * Auto-detect: when every active dataset on an axis points at an x-column
 * whose data carries `categoryLabels` and they all agree, those labels are
 * returned.
 *
 * Forced: if auto-detect fails but `axis.xMode === "categorical"`, labels are
 * derived from the unique integer x-values across the bound datasets
 * (capped at MAX_DERIVED_CATEGORY_LABELS) and returned with explicit ticks
 * at those values.
 *
 * Otherwise the axis maps to `undefined`.
 */
export function computeXAxisCategoryLabels(
	activeDsIds: ReadonlySet<string>,
	datasets: readonly Dataset[],
	xAxes: XAxisConfig[],
): Map<string, XAxisCategoryInfo | undefined> {
	const out = new Map<string, XAxisCategoryInfo | undefined>();

	const dssByX = new Map<string, Dataset[]>();
	for (const d of datasets) {
		if (!activeDsIds.has(d.id)) continue;
		const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
		const arr = dssByX.get(xId) || [];
		arr.push(d);
		dssByX.set(xId, arr);
	}

	dssByX.forEach((dss, axisId) => {
		const cfg = getAxisById(xAxes, axisId);
		const forced = cfg?.xMode === "categorical";
		let labels: string[] | undefined;
		let mismatch = false;
		for (const d of dss) {
			const colIdx = getColumnIndex(d, d.xAxisColumn);
			const col = colIdx >= 0 ? d.data[colIdx] : undefined;
			const cl = col?.categoryLabels;
			if (!cl) {
				mismatch = true;
				break;
			}
			if (!labels) labels = cl;
			else if (
				labels.length !== cl.length ||
				labels.some((v, i) => v !== cl[i])
			) {
				mismatch = true;
				break;
			}
		}
		if (!mismatch && labels) {
			out.set(axisId, { labels });
			return;
		}
		if (forced) {
			const uniq = new Set<number>();
			outer: for (const d of dss) {
				const colIdx = getColumnIndex(d, d.xAxisColumn);
				const col = colIdx >= 0 ? d.data[colIdx] : undefined;
				if (!col) continue;
				const ref = col.refPoint;
				const arr = col.data;
				for (let i = 0; i < arr.length; i++) {
					uniq.add(arr[i] + ref);
					if (uniq.size > MAX_DERIVED_CATEGORY_LABELS) break outer;
				}
			}
			const size = uniq.size;
			const ticks = new Array(size);
			let i = 0;
			for (const v of uniq) {
				ticks[i++] = v;
			}
			ticks.sort((a, b) => a - b);
			const labels = new Array(size);
			for (let j = 0; j < size; j++) {
				labels[j] = String(ticks[j]);
			}
			out.set(axisId, {
				labels,
				ticks,
			});
			return;
		}
		out.set(axisId, undefined);
	});
	return out;
}
