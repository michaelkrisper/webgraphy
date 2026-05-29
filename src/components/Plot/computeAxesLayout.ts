// Memoized axis-layout computation, extracted from ChartContainer so the
// cache behavior can be unit-tested. Each Map keys per-axis layouts by the
// fields that affect the layout output (range, name, grid flag, mode); the
// adjacent depsKey is a coarse invalidator wiped on chart-wide changes
// (chart size, label color, dataset set).

import type {
	Dataset,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import {
	DEFAULT_X_AXIS_ID,
	calcYAxisTicks,
} from "../../utils/axisCalculations";
import { buildXAxisLayout } from "./buildXAxisLayout";
import type { XAxisLayout, YAxisLayout } from "./chartTypes";

interface CacheEntry<T> {
	key: string;
	layout: T;
}

export interface AxesLayoutCache<T> {
	entries: Map<string, CacheEntry<T>>;
	depsKey: string;
}

export function createAxesLayoutCache<T>(): AxesLayoutCache<T> {
	return { entries: new Map(), depsKey: "" };
}

export type DatasetsByXAxis = Record<string, Dataset[]>;

/** Bucket active datasets by their x-axis id (falling back to the default). */
export function groupActiveDatasetsByXAxis(
	datasets: readonly Dataset[],
	activeDsIds: ReadonlySet<string>,
): DatasetsByXAxis {
	const out: DatasetsByXAxis = {};
	for (const d of datasets) {
		if (!activeDsIds.has(d.id)) continue;
		const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
		if (!out[xId]) out[xId] = [];
		out[xId].push(d);
	}
	return out;
}

/** Build the layout for a single x-axis using the pre-grouped datasets. */
export function buildXAxisLayoutFor(
	axis: XAxisConfig,
	chartWidth: number,
	labelColor: string,
	xAxisCategoryLabels: ReadonlyMap<
		string,
		{ labels: string[]; ticks?: number[] } | undefined
	>,
	dsByX: DatasetsByXAxis,
): XAxisLayout {
	const catInfo = xAxisCategoryLabels.get(axis.id);
	const dss = dsByX[axis.id] || [];
	return buildXAxisLayout(
		axis,
		chartWidth,
		labelColor,
		catInfo?.labels,
		catInfo?.ticks,
		dss,
	);
}

/** Build the layout for a single y-axis. */
export function buildYAxisLayoutFor(
	axis: YAxisConfig,
	chartHeight: number,
	yAxisCategoryLabels: ReadonlyMap<string, string[] | undefined>,
): YAxisLayout {
	const categoryLabels = yAxisCategoryLabels.get(axis.id);
	const { ticks, precision, actualStep } = calcYAxisTicks(
		axis.min,
		axis.max,
		chartHeight,
		categoryLabels ? 1 : undefined,
		categoryLabels?.length,
	);
	return { ...axis, ticks, precision, actualStep, categoryLabels };
}

export interface ComputeXAxesLayoutParams {
	liveXAxes: readonly XAxisConfig[];
	activeXAxesUsed: readonly XAxisConfig[];
	datasets: readonly Dataset[];
	activeDsIdsSet: ReadonlySet<string>;
	chartWidth: number;
	labelColor: string;
	xAxisCategoryLabels: ReadonlyMap<
		string,
		{ labels: string[]; ticks?: number[] } | undefined
	>;
	cache: AxesLayoutCache<XAxisLayout>;
}

export function computeXAxesLayoutCached({
	liveXAxes,
	activeXAxesUsed,
	datasets,
	activeDsIdsSet,
	chartWidth,
	labelColor,
	xAxisCategoryLabels,
	cache,
}: ComputeXAxesLayoutParams): XAxisLayout[] {
	const dsByX = groupActiveDatasetsByXAxis(datasets, activeDsIdsSet);

	const depsKey = `${chartWidth}|${labelColor}|${datasets.length}|${activeDsIdsSet.size}`;
	if (cache.depsKey !== depsKey) {
		cache.entries.clear();
		cache.depsKey = depsKey;
	}

	return liveXAxes
		.filter((axis) => activeXAxesUsed.some((ax) => ax.id === axis.id))
		.map((axis) => {
			const cacheKey = `${axis.min}|${axis.max}|${axis.showGrid}|${axis.xMode}|${axis.name ?? ""}`;
			const cached = cache.entries.get(axis.id);
			if (cached && cached.key === cacheKey) return cached.layout;

			const layout = buildXAxisLayoutFor(
				axis,
				chartWidth,
				labelColor,
				xAxisCategoryLabels,
				dsByX,
			);
			cache.entries.set(axis.id, { key: cacheKey, layout });
			return layout;
		});
}

export interface ComputeYAxesLayoutParams {
	liveYAxes: readonly YAxisConfig[];
	usedYAxisIdsSet: ReadonlySet<string>;
	chartHeight: number;
	yAxisCategoryLabels: ReadonlyMap<string, string[] | undefined>;
	cache: AxesLayoutCache<YAxisLayout>;
}

export function computeYAxesLayoutCached({
	liveYAxes,
	usedYAxisIdsSet,
	chartHeight,
	yAxisCategoryLabels,
	cache,
}: ComputeYAxesLayoutParams): YAxisLayout[] {
	const depsKey = `${chartHeight}|${usedYAxisIdsSet.size}`;
	if (cache.depsKey !== depsKey) {
		cache.entries.clear();
		cache.depsKey = depsKey;
	}
	return liveYAxes
		.filter((a) => usedYAxisIdsSet.has(a.id))
		.map((axis) => {
			const cacheKey = `${axis.min}|${axis.max}|${axis.position}|${axis.showGrid}|${axis.name ?? ""}`;
			const cached = cache.entries.get(axis.id);
			if (cached && cached.key === cacheKey) return cached.layout;
			const layout = buildYAxisLayoutFor(
				axis,
				chartHeight,
				yAxisCategoryLabels,
			);
			cache.entries.set(axis.id, { key: cacheKey, layout });
			return layout;
		});
}
