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
	const dsByX: Record<string, Dataset[]> = {};
	for (const d of datasets) {
		if (activeDsIdsSet.has(d.id)) {
			const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
			if (!dsByX[xId]) dsByX[xId] = [];
			dsByX[xId].push(d);
		}
	}

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

			const catInfo = xAxisCategoryLabels.get(axis.id);
			const dss = dsByX[axis.id] || [];
			const layout = buildXAxisLayout(
				axis,
				chartWidth,
				labelColor,
				catInfo?.labels,
				catInfo?.ticks,
				dss,
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
			const categoryLabels = yAxisCategoryLabels.get(axis.id);
			const { ticks, precision, actualStep } = calcYAxisTicks(
				axis.min,
				axis.max,
				chartHeight,
				categoryLabels ? 1 : undefined,
				categoryLabels?.length,
			);
			const layout = {
				...axis,
				ticks,
				precision,
				actualStep,
				categoryLabels,
			};
			cache.entries.set(axis.id, { key: cacheKey, layout });
			return layout;
		});
}
