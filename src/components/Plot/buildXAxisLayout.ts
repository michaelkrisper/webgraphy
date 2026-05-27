import type { Dataset, XAxisConfig } from "../../services/persistence";
import {
	calcCategoricalTicks,
	calcNumericPrecision,
	calcNumericStep,
	calcNumericTicks,
} from "../../utils/axisCalculations";
import {
	generateSecondaryLabels,
	generateTimeTicks,
	getTimeStep,
} from "../../utils/time";
import type { XAxisLayout } from "./chartTypes";

export function buildXAxisLayout(
	axis: XAxisConfig,
	chartWidth: number,
	labelColor: string,
	categoryLabels: string[] | undefined,
	categoryTicks: number[] | undefined,
	datasets: Dataset[],
): XAxisLayout {
	const r = axis.max - axis.min;
	const isDate = axis.xMode === "date";
	const uniqueColumns: string[] = [];
	for (let i = 0; i < datasets.length; i++) {
		const col = datasets[i].xAxisColumn;
		if (!uniqueColumns.includes(col)) uniqueColumns.push(col);
	}
	const defaultTitle =
		datasets.length > 1 ? uniqueColumns.join(" / ") : uniqueColumns[0];
	const title = axis.name || defaultTitle || "";
	const color = labelColor;
	if (r <= 0 || chartWidth <= 0)
		return {
			id: axis.id,
			min: axis.min,
			max: axis.max,
			showGrid: axis.showGrid,
			ticks: {
				result: [],
				step: 1,
				precision: 0,
				isXDate: false as const,
			},
			title,
			color,
			categoryLabels,
			categoryTicks,
		};
	if (categoryLabels) {
		const result = categoryTicks
			? categoryTicks.filter((v) => v >= axis.min && v <= axis.max)
			: calcCategoricalTicks(axis.min, axis.max, categoryLabels.length);
		return {
			id: axis.id,
			min: axis.min,
			max: axis.max,
			showGrid: axis.showGrid,
			ticks: {
				result,
				step: 1,
				precision: 0,
				isXDate: false as const,
			},
			title,
			color,
			categoryLabels,
			categoryTicks,
		};
	}
	if (!isDate) {
		const step = calcNumericStep(r, Math.max(2, Math.floor(chartWidth / 60)));
		if (step <= 0)
			return {
				id: axis.id,
				min: axis.min,
				max: axis.max,
				showGrid: axis.showGrid,
				ticks: {
					result: [],
					step: 1,
					precision: 0,
					isXDate: false as const,
				},
				title,
				color,
			};
		const precision = calcNumericPrecision(step);
		return {
			id: axis.id,
			min: axis.min,
			max: axis.max,
			showGrid: axis.showGrid,
			ticks: {
				result: calcNumericTicks(axis.min, axis.max, step),
				step,
				precision,
				isXDate: false as const,
			},
			title,
			color,
		};
	} else {
		const ts = getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
		return {
			id: axis.id,
			min: axis.min,
			max: axis.max,
			showGrid: axis.showGrid,
			ticks: {
				result: generateTimeTicks(axis.min, axis.max, ts),
				isXDate: true as const,
				secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts),
			},
			title,
			color,
		};
	}
}
