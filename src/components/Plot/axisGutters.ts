// Pure geometry for the Y-axis "gutters" — the stacked label/tick strips on
// the left and right of the plot. Extracted from ChartContainer so the
// offset/width math can be unit-tested in isolation.

import {
	calcNumericPrecision,
	calcNumericStep,
	formatAxisLabel,
} from "../../utils/axisCalculations";

export const DEFAULT_GUTTER_TOTAL = 40;

interface GutterLayout {
	total: number;
}

/** Pixel width reserved for an axis gutter, falling back to a default. */
export function gutterTotal(
	axisLayout: Record<string, GutterLayout>,
	id: string,
): number {
	return axisLayout[id]?.total || DEFAULT_GUTTER_TOTAL;
}

/**
 * Cumulative pixel offset of each gutter from the plot edge, in order.
 * The first axis sits flush against the plot (offset 0) and each subsequent
 * axis is pushed outward by the preceding gutters' widths.
 */
export function computeAxisOffsets(
	axes: readonly { id: string }[],
	axisLayout: Record<string, GutterLayout>,
): Record<string, number> {
	const offsets: Record<string, number> = {};
	let off = 0;
	for (const a of axes) {
		offsets[a.id] = off;
		off += gutterTotal(axisLayout, a.id);
	}
	return offsets;
}

/** Combined pixel width of a set of axis gutters. */
export function sumGutterTotals(
	axes: readonly { id: string }[],
	axisLayout: Record<string, GutterLayout>,
): number {
	let sum = 0;
	for (const a of axes) sum += gutterTotal(axisLayout, a.id);
	return sum;
}

/**
 * Size a single Y-axis gutter based on the widest label it will need to
 * render. For categorical axes the widest category label drives the width;
 * for numeric axes the precision implied by the range and chart height does.
 * Returns the inner label width and the total gutter width (label + tick
 * area). The label width is capped at 100px.
 */
export function measureYAxisGutter(
	axis: { min: number; max: number },
	height: number,
	categoryLabels: readonly string[] | undefined,
): { label: number; total: number } {
	let widestValChars: number;
	if (categoryLabels) {
		widestValChars = categoryLabels.reduce(
			(acc, n) => Math.max(acc, n?.length ?? 0),
			1,
		);
	} else {
		const step = calcNumericStep(
			axis.max - axis.min,
			Math.max(2, Math.floor(height / 30)),
		);
		const precision = calcNumericPrecision(step);
		widestValChars = Math.max(
			formatAxisLabel(axis.min, precision).length,
			formatAxisLabel(axis.max, precision).length,
		);
	}
	const labelWidth = Math.min(100, widestValChars * 6);
	return { label: labelWidth, total: labelWidth + 24 };
}
