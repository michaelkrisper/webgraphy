// Pure X-axis row geometry, extracted from ChartContainer. Each visible
// x-axis occupies a horizontal strip below the plot — date axes are taller
// to fit the secondary-label row, others are shorter. `computeXAxesMetrics`
// stacks these strips and records each axis' cumulative pixel offset from
// the plot's bottom edge.

import type { XAxisMetrics } from "./chartTypes";

type XMode = "date" | "numeric" | "categorical";

/** Heights and label baselines for a single x-axis strip, by mode. */
export function getXAxisRowMetrics(
	xMode: XMode,
): Omit<XAxisMetrics, "id" | "cumulativeOffset"> {
	if (xMode === "date") {
		return {
			height: 70,
			labelBottom: 22,
			secLabelBottom: 38,
			titleBottom: 60,
		};
	}
	return { height: 50, labelBottom: 26, secLabelBottom: 0, titleBottom: 40 };
}

/**
 * Stack each axis' strip below the plot and tag it with its cumulative
 * offset (the sum of preceding strips' heights).
 */
export function computeXAxesMetrics(
	axes: readonly { id: string; xMode: XMode }[],
): XAxisMetrics[] {
	const result: XAxisMetrics[] = [];
	let currentOffset = 0;
	for (const axis of axes) {
		const base = getXAxisRowMetrics(axis.xMode);
		result.push({ ...base, id: axis.id, cumulativeOffset: currentOffset });
		currentOffset += base.height;
	}
	return result;
}
