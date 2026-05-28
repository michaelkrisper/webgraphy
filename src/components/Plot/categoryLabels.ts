// Per-axis categorical-label resolution, extracted from ChartContainer so
// the (deterministic, store-input-only) computation can be unit-tested in
// isolation.

import type { Dataset, SeriesConfig } from "../../services/persistence";
import { getColumnIndex } from "../../utils/columns";

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
