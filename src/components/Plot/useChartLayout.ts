import { useMemo } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { DEFAULT_X_AXIS_ID } from "../../utils/axisCalculations";
import {
	computeAxisOffsets,
	measureYAxisGutter,
	sumGutterTotals,
} from "./axisGutters";
import {
	computeXAxisCategoryLabels,
	computeYAxisCategoryLabels,
} from "./categoryLabels";
import { computeXAxesMetrics } from "./xAxisMetrics";

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };

export function useChartLayout(
	series: SeriesConfig[],
	datasets: Dataset[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
) {
	const activeDsIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => {
			set.add(s.sourceId);
		});
		return set;
	}, [series]);

	const usedYAxisIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => {
			set.add(s.yAxisId);
		});
		return set;
	}, [series]);

	const activeYAxes = useMemo(() => {
		return yAxes.filter((a) => usedYAxisIdsSet.has(a.id));
	}, [yAxes, usedYAxisIdsSet]);

	const yAxisCategoryLabels = useMemo(
		() => computeYAxisCategoryLabels(series, datasets),
		[series, datasets],
	);

	const xAxisCategoryLabels = useMemo(
		() => computeXAxisCategoryLabels(activeDsIdsSet, datasets, xAxes),
		[activeDsIdsSet, datasets, xAxes],
	);

	const activeXAxesUsed = useMemo(() => {
		const axisToMinDsIdx = new Map<string, number>();
		datasets.forEach((d, dsIdx) => {
			if (activeDsIdsSet.has(d.id)) {
				const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
				const currentMin = axisToMinDsIdx.get(xId);
				if (currentMin === undefined || dsIdx < currentMin) {
					axisToMinDsIdx.set(xId, dsIdx);
				}
			}
		});
		return xAxes
			.filter((a) => axisToMinDsIdx.has(a.id))
			.sort(
				(a, b) =>
					(axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0),
			);
	}, [xAxes, activeDsIdsSet, datasets]);

	const axisLayout = useMemo(() => {
		const layout: Record<string, { total: number; label: number }> = {};
		for (const axis of activeYAxes) {
			layout[axis.id] = measureYAxisGutter(
				axis,
				height,
				yAxisCategoryLabels.get(axis.id),
			);
		}
		return layout;
	}, [activeYAxes, height, yAxisCategoryLabels]);

	const { leftAxes, rightAxes } = useMemo(() => {
		const left: typeof activeYAxes = [];
		const right: typeof activeYAxes = [];
		for (const a of activeYAxes) {
			if (a.position === "left") {
				left.push(a);
			} else {
				right.push(a);
			}
		}
		return { leftAxes: left, rightAxes: right };
	}, [activeYAxes]);

	const { leftOffsets, rightOffsets } = useMemo(
		() => ({
			leftOffsets: computeAxisOffsets(leftAxes, axisLayout),
			rightOffsets: computeAxisOffsets(rightAxes, axisLayout),
		}),
		[leftAxes, rightAxes, axisLayout],
	);

	const xAxesMetrics = useMemo(
		() => computeXAxesMetrics(activeXAxesUsed),
		[activeXAxesUsed],
	);

	const padding = useMemo(() => {
		const base = BASE_PADDING_DESKTOP;
		const leftSum = sumGutterTotals(leftAxes, axisLayout);
		const rightSum = sumGutterTotals(rightAxes, axisLayout);
		const bottom =
			xAxesMetrics.length > 0
				? xAxesMetrics.reduce((sum, m) => sum + m.height, 0)
				: base.bottom;
		return {
			...base,
			left: base.left + leftSum,
			right: base.right + rightSum,
			bottom,
		};
	}, [leftAxes, rightAxes, axisLayout, xAxesMetrics]);

	const chartWidth = Math.max(0, width - padding.left - padding.right);
	const chartHeight = Math.max(0, height - padding.top - padding.bottom);

	return {
		activeDsIdsSet,
		usedYAxisIdsSet,
		activeYAxes,
		yAxisCategoryLabels,
		xAxisCategoryLabels,
		activeXAxesUsed,
		axisLayout,
		leftAxes,
		rightAxes,
		leftOffsets,
		rightOffsets,
		xAxesMetrics,
		padding,
		chartWidth,
		chartHeight,
	};
}
