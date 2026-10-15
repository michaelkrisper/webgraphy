// Statistics over the samples whose x lies in the visible x range.

import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import { findFirstGE, findLastLE } from "../../../utils/binarySearch";
import { buildSeriesMetadata } from "../crosshair/seriesMetadata";
import { getOrComputeMonotonicity } from "../seriesPrep";

export interface ColumnStats {
	n: number;
	min: number;
	max: number;
	mean: number;
	/** Sample standard deviation (n − 1); 0 for a single sample. */
	std: number;
}

const xSortedCache = new WeakMap<Float32Array, boolean>();

/**
 * n/min/max/mean/std of `yData + refY` over the samples with x in
 * [xMin, xMax]. Sorted x columns are sliced by binary search, unsorted ones
 * (scatter data, NaN gaps) scanned linearly. NaN/±Infinity y values are
 * skipped; with `positiveOnly` (log y axes) so are values <= 0, matching what
 * the axis can show. The accumulation runs on the stored offsets and adds
 * `refY` back at the end, so large reference points (timestamps) keep their
 * precision. Returns null when no sample qualifies.
 */
export function visibleColumnStats(
	xData: Float32Array,
	refX: number,
	yData: Float32Array,
	refY: number,
	xMin: number,
	xMax: number,
	positiveOnly = false,
): ColumnStats | null {
	let n = 0;
	let mean = 0;
	let m2 = 0;
	let min = Infinity;
	let max = -Infinity;
	const add = (d: number) => {
		if (!Number.isFinite(d)) return;
		if (positiveOnly && !(d + refY > 0)) return;
		n++;
		// Welford: numerically stable single pass.
		const delta = d - mean;
		mean += delta / n;
		m2 += delta * (d - mean);
		if (d < min) min = d;
		if (d > max) max = d;
	};

	const len = Math.min(xData.length, yData.length);
	if (getOrComputeMonotonicity(xData, xSortedCache)) {
		const start = findFirstGE(xData, xMin, refX, -1);
		const end = Math.min(findLastLE(xData, xMax, refX, -1), len - 1);
		if (start === -1 || end === -1) return null;
		for (let j = start; j <= end; j++) add(yData[j]);
	} else {
		for (let j = 0; j < len; j++) {
			const x = xData[j] + refX;
			if (x >= xMin && x <= xMax) add(yData[j]);
		}
	}
	if (n === 0) return null;
	return {
		n,
		min: min + refY,
		max: max + refY,
		mean: mean + refY,
		std: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
	};
}

export interface StatsRow {
	seriesId: string;
	label: string;
	color: string;
	lineStyle: string;
	/** Category columns get a count only: their codes have no mean. */
	categorical: boolean;
	stats: ColumnStats | null;
}

/** One row per visible series, over its x axis' current range. */
export function buildStatsRows(
	series: readonly SeriesConfig[],
	datasets: readonly Dataset[],
	xAxes: readonly XAxisConfig[],
	yAxes: readonly YAxisConfig[],
): StatsRow[] {
	return buildSeriesMetadata(series, datasets, xAxes, yAxes).map((m) => ({
		seriesId: m.series.id,
		label: m.series.name || m.series.yColumn,
		color: m.series.lineColor,
		lineStyle: m.series.lineStyle,
		categorical: !!m.yCol.categoryLabels,
		stats: visibleColumnStats(
			m.xCol.data,
			m.xCol.refPoint,
			m.yCol.data,
			m.yCol.refPoint,
			m.xAxis.min,
			m.xAxis.max,
			m.axis.scale === "log",
		),
	}));
}
