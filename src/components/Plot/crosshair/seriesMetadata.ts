import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import {
	DEFAULT_X_AXIS_ID,
	getAxisById,
} from "../../../utils/axisCalculations";
import { getColumnIndex } from "../../../utils/columns";
import type { SeriesMetadata } from "./types";

/** Visible series resolved to their dataset, axes and x/y columns. */
export function buildSeriesMetadata(
	series: readonly SeriesConfig[],
	datasets: readonly Dataset[],
	xAxes: readonly XAxisConfig[],
	yAxes: readonly YAxisConfig[],
): SeriesMetadata[] {
	const datasetsById = new Map(datasets.map((d) => [d.id, d]));
	const out: SeriesMetadata[] = [];
	for (const s of series) {
		if (s.hidden) continue;
		const ds = datasetsById.get(s.sourceId);
		const axis = getAxisById(yAxes as YAxisConfig[], s.yAxisId);
		const xAxis = getAxisById(
			xAxes as XAxisConfig[],
			ds?.xAxisId || DEFAULT_X_AXIS_ID,
		);
		if (!ds || !axis || !xAxis) continue;
		const xIdx = getColumnIndex(ds, ds.xAxisColumn);
		const yIdx = getColumnIndex(ds, s.yColumn);
		if (xIdx === -1 || yIdx === -1) continue;
		const xCol = ds.data[xIdx];
		const yCol = ds.data[yIdx];
		if (!xCol?.data || !yCol?.data) continue;
		out.push({ series: s, ds, axis, xAxis, xIdx, yIdx, xCol, yCol });
	}
	return out;
}

/** Tooltip name per x axis: its datasets' x column names joined by " / ". */
export function buildXAxisNames(
	datasets: readonly Dataset[],
): Record<string, string> {
	const columnsByX: Record<string, string[]> = {};
	for (const d of datasets) {
		const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
		const cols = columnsByX[xId] ?? [];
		cols.push(d.xAxisColumn);
		columnsByX[xId] = cols;
	}
	const out: Record<string, string> = {};
	for (const xId in columnsByX) {
		const cols = columnsByX[xId];
		out[xId] = cols.length > 1 ? [...new Set(cols)].join(" / ") : cols[0];
	}
	return out;
}
