import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../services/persistence";
import { getAxisById } from "../../utils/axisCalculations";
import { getColumnIndex } from "../../utils/columns";
import { m4ByXFloat32 } from "../../utils/decimation";
import { formatFullDate } from "../../utils/time";

/**
 * The plotted data as a table.
 *
 * `role="img"` plus a generated name (#720) tells a screen reader that there
 * is a chart and over which ranges; it says nothing about what the data does.
 * This turns the same points the renderer draws into rows.
 *
 * Two choices are baked in, both for the reason the issue gives:
 *
 * - **Viewport, not whole dataset.** The rows cover the announced axis range,
 *   which is what the chart is showing and is orders of magnitude smaller
 *   than a column that routinely holds a million points.
 * - **The renderer's own decimation.** `m4ByXFloat32` is the function the
 *   renderer's decimation cache calls, so the rows are the extrema the line
 *   is actually drawn through rather than a second sampling path that can
 *   drift away from the picture.
 */

/**
 * Rows emitted per series, whatever the dataset size. M4 emits at most four
 * points per bucket plus one continuity anchor at each edge, so the bucket
 * count is chosen to stay under the cap; anything left over is trimmed and
 * reported through `truncated`.
 */
export const MAX_TABLE_ROWS = 200;

const BUCKETS = Math.floor((MAX_TABLE_ROWS - 2) / 4);

export interface PlotTableRow {
	/** World x, i.e. the column value with its `refPoint` added back. */
	x: number;
	y: number;
}

export interface PlotTableSeries {
	id: string;
	name: string;
	xAxisName: string;
	xMode: XAxisConfig["xMode"];
	rows: PlotTableRow[];
	/** True when the row cap trimmed the decimated output. */
	truncated: boolean;
}

export interface PlotDataTableInput {
	series: readonly SeriesConfig[];
	datasets: readonly Dataset[];
	xAxes: readonly XAxisConfig[];
}

/** One table per visible series; series with no resolvable column are skipped. */
export function buildPlotDataTable({
	series,
	datasets,
	xAxes,
}: PlotDataTableInput): PlotTableSeries[] {
	const dsById = new Map(datasets.map((d) => [d.id, d]));
	const tables: PlotTableSeries[] = [];

	for (const s of series) {
		if (s.hidden) continue;
		const ds = dsById.get(s.sourceId);
		if (!ds) continue;
		const xAxis = getAxisById(xAxes as XAxisConfig[], ds.xAxisId);
		if (!xAxis) continue;

		const xIdx = getColumnIndex(ds, ds.xAxisColumn);
		const yIdx = getColumnIndex(ds, s.yColumn);
		if (xIdx === -1 || yIdx === -1) continue;
		const xCol = ds.data[xIdx];
		const yCol = ds.data[yIdx];
		if (!xCol?.data || !yCol?.data) continue;

		const span = xAxis.max - xAxis.min;
		if (!Number.isFinite(span) || span <= 0) continue;

		const { x, y } = m4ByXFloat32(
			xCol.data,
			yCol.data,
			xCol.refPoint,
			xAxis.min,
			xAxis.max,
			span / BUCKETS,
		);

		const rows: PlotTableRow[] = [];
		for (let i = 0; i < x.length && rows.length < MAX_TABLE_ROWS; i++) {
			rows.push({ x: x[i] + xCol.refPoint, y: y[i] });
		}

		tables.push({
			id: s.id,
			name: s.name || s.yColumn,
			xAxisName: xAxis.name || ds.xAxisColumn,
			xMode: xAxis.xMode,
			rows,
			truncated: x.length > rows.length,
		});
	}

	return tables;
}

/** Same formatting the crosshair uses, so a cell reads like its tooltip. */
export function formatTableValue(
	value: number,
	xMode?: XAxisConfig["xMode"],
): string {
	if (!Number.isFinite(value)) return "—";
	if (xMode === "date") return formatFullDate(value);
	return parseFloat(value.toPrecision(7)).toLocaleString(undefined, {
		maximumFractionDigits: 10,
	});
}
