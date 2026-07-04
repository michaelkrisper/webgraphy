// Pure vertex-buffer writers for the overlay primitives drawn by
// WebGLRenderer.buildOverlay. Each helper appends its geometry to a packed
// Float32Array starting at the supplied write index and returns the next
// write index, so the caller can sum vertex counts and push draw groups
// while the geometry itself stays testable in isolation.

import { DEFAULT_GUTTER_TOTAL } from "./axisGutters";

interface Padding {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

interface GridAxis {
	readonly ticks: readonly number[];
	readonly min: number;
	readonly max: number;
	readonly showGrid: boolean;
}

interface ZeroLineAxis {
	readonly min: number;
	readonly max: number;
	readonly showGrid: boolean;
	readonly categoryLabels?: readonly string[];
}

interface XAxisLine {
	readonly ticks: readonly number[];
	readonly min: number;
	readonly max: number;
}

interface XAxisMetric {
	readonly cumulativeOffset: number;
}

interface YAxisLine {
	readonly id: string;
	readonly ticks: readonly number[];
	readonly min: number;
	readonly max: number;
	readonly position: "left" | "right";
}

interface YAxisGutter {
	readonly total: number;
}

const ARROW_SIZE = 6;

/**
 * Append the plot-background quad (two triangles, 6 vertices) covering the
 * plot area, with all coordinates pre-multiplied by `dpr` so the renderer
 * can blit straight to the device pixel grid.
 */
export function writeBackgroundQuad(
	buf: Float32Array,
	p: number,
	pad: Padding,
	cw: number,
	ch: number,
	dpr: number,
): number {
	const x0 = pad.left * dpr;
	const y0 = pad.top * dpr;
	const x1 = (pad.left + cw) * dpr;
	const y1 = (pad.top + ch) * dpr;
	buf[p++] = x0;
	buf[p++] = y0;
	buf[p++] = x1;
	buf[p++] = y0;
	buf[p++] = x0;
	buf[p++] = y1;
	buf[p++] = x1;
	buf[p++] = y0;
	buf[p++] = x1;
	buf[p++] = y1;
	buf[p++] = x0;
	buf[p++] = y1;
	return p;
}

/**
 * Append the vertical grid lines for the first x-axis (drawn full-height
 * across the plot). Ticks outside the visible range are skipped. Returns
 * the advanced write index.
 */
export function writeXGridLines(
	buf: Float32Array,
	p: number,
	axis: GridAxis,
	pad: Padding,
	cw: number,
	ch: number,
	dpr: number,
): number {
	if (!axis.showGrid || axis.max <= axis.min) return p;
	const range = axis.max - axis.min;
	const yTop = pad.top * dpr;
	const yBot = (pad.top + ch) * dpr;
	for (const t of axis.ticks) {
		const norm = (t - axis.min) / range;
		if (norm < 0 || norm > 1) continue;
		const sx = (pad.left + norm * cw) * dpr;
		buf[p++] = sx;
		buf[p++] = yTop;
		buf[p++] = sx;
		buf[p++] = yBot;
	}
	return p;
}

/**
 * Append the horizontal grid lines for every y-axis that opts in. Each
 * gridded axis adds a full-width line per visible tick. Returns the
 * advanced write index.
 */
export function writeYGridLines(
	buf: Float32Array,
	p: number,
	axes: readonly GridAxis[],
	pad: Padding,
	w: number,
	ch: number,
	dpr: number,
): number {
	const xL = pad.left * dpr;
	const xR = (w - pad.right) * dpr;
	for (const ax of axes) {
		if (!ax.showGrid || ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			buf[p++] = xL;
			buf[p++] = sy;
			buf[p++] = xR;
			buf[p++] = sy;
		}
	}
	return p;
}

/**
 * Append horizontal zero lines for every y-axis whose visible range straddles
 * 0 (skipping categorical axes and ones without grid). Each line extends from
 * the plot's left edge to a small arrow-tip stub on the right.
 */
export function writeYZeroLines(
	buf: Float32Array,
	p: number,
	axes: readonly ZeroLineAxis[],
	pad: Padding,
	w: number,
	ch: number,
	dpr: number,
): number {
	const xL = pad.left * dpr;
	const xTip = (w - pad.right + 8) * dpr;
	for (const ax of axes) {
		if (ax.categoryLabels) continue;
		if (!ax.showGrid) continue;
		if (!(ax.min <= 0 && ax.max >= 0 && ax.max > ax.min)) continue;
		const range = ax.max - ax.min;
		const norm = (0 - ax.min) / range;
		const sy = (pad.top + (1 - norm) * ch) * dpr;
		buf[p++] = xL;
		buf[p++] = sy;
		buf[p++] = xTip;
		buf[p++] = sy;
	}
	return p;
}

/**
 * Append the vertical zero line for the first x-axis when its visible range
 * straddles 0 and it is non-categorical with grid enabled. Drawn from the
 * plot's bottom up to a small arrow-tip stub above the plot.
 */
export function writeXZeroLine(
	buf: Float32Array,
	p: number,
	axis: ZeroLineAxis,
	pad: Padding,
	cw: number,
	h: number,
	dpr: number,
): number {
	if (
		!axis.showGrid ||
		axis.categoryLabels ||
		!(axis.min <= 0 && axis.max >= 0 && axis.max > axis.min)
	)
		return p;
	const range = axis.max - axis.min;
	const norm = (0 - axis.min) / range;
	const sx = (pad.left + norm * cw) * dpr;
	const tipY = (pad.top - 8) * dpr;
	buf[p++] = sx;
	buf[p++] = (h - pad.bottom) * dpr;
	buf[p++] = sx;
	buf[p++] = tipY;
	return p;
}

/**
 * Append the plot's "U" frame border: left spine, top spine, and right
 * spine (the bottom is drawn by the x-axis line). 12 floats / 6 vertices.
 */
export function writeFramePlotBorder(
	buf: Float32Array,
	p: number,
	pad: Padding,
	w: number,
	ch: number,
	dpr: number,
): number {
	const xL = pad.left * dpr;
	const xR = (w - pad.right) * dpr;
	const yT = pad.top * dpr;
	const yB = (pad.top + ch) * dpr;
	// Left spine
	buf[p++] = xL;
	buf[p++] = yT;
	buf[p++] = xL;
	buf[p++] = yB;
	// Top spine
	buf[p++] = xL;
	buf[p++] = yT;
	buf[p++] = xR;
	buf[p++] = yT;
	// Right spine
	buf[p++] = xR;
	buf[p++] = yT;
	buf[p++] = xR;
	buf[p++] = yB;
	return p;
}

/**
 * Append every x-axis horizontal line plus its tick marks, stacked below the
 * plot by each axis' cumulative offset. Returns the advanced write index.
 */
export function writeXAxisLines(
	buf: Float32Array,
	p: number,
	axes: readonly XAxisLine[],
	metrics: readonly XAxisMetric[],
	pad: Padding,
	w: number,
	h: number,
	cw: number,
	dpr: number,
): number {
	for (let idx = 0; idx < axes.length; idx++) {
		const ax = axes[idx];
		const m = metrics[idx];
		if (!m) continue;
		const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
		// Axis spine: left edge to right tip
		buf[p++] = pad.left * dpr;
		buf[p++] = yL;
		buf[p++] = (w - pad.right + 8) * dpr;
		buf[p++] = yL;
		if (ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		const tickEnd = yL + 6 * dpr;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sx = (pad.left + norm * cw) * dpr;
			buf[p++] = sx;
			buf[p++] = yL;
			buf[p++] = sx;
			buf[p++] = tickEnd;
		}
	}
	return p;
}

/**
 * Append every y-axis vertical line plus its tick marks, placed left or right
 * of the plot per `position` and stacked outwards by `leftOffsets` /
 * `rightOffsets`. Returns the advanced write index.
 */
export function writeYAxisLines(
	buf: Float32Array,
	p: number,
	axes: readonly YAxisLine[],
	axisLayout: Record<string, YAxisGutter | undefined>,
	leftOffsets: Record<string, number | undefined>,
	rightOffsets: Record<string, number | undefined>,
	pad: Padding,
	w: number,
	h: number,
	ch: number,
	dpr: number,
): number {
	const tipY = (pad.top - 8) * dpr;
	const yBot = (h - pad.bottom) * dpr;
	for (const ax of axes) {
		const isLeft = ax.position === "left";
		const total = axisLayout[ax.id]?.total ?? DEFAULT_GUTTER_TOTAL;
		const xPos = isLeft
			? pad.left - (leftOffsets[ax.id] ?? 0) - total
			: w - pad.right + (rightOffsets[ax.id] ?? 0);
		const lineX = isLeft ? xPos + total : xPos;
		// Axis spine: bottom of plot up to arrow tip
		buf[p++] = lineX * dpr;
		buf[p++] = yBot;
		buf[p++] = lineX * dpr;
		buf[p++] = tipY;
		if (ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		const xa = (isLeft ? lineX - 5 : lineX) * dpr;
		const xb = (isLeft ? lineX : lineX + 5) * dpr;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			buf[p++] = xa;
			buf[p++] = sy;
			buf[p++] = xb;
			buf[p++] = sy;
		}
	}
	return p;
}

/**
 * Append zero-line arrow tips (TRIANGLES) for every straddling y-axis and
 * the first x-axis. Mirrors the predicate of writeYZeroLines/writeXZeroLine.
 */
export function writeZeroLineArrows(
	buf: Float32Array,
	p: number,
	yAxes: readonly ZeroLineAxis[],
	xAxis: ZeroLineAxis | undefined,
	pad: Padding,
	w: number,
	cw: number,
	ch: number,
	dpr: number,
): number {
	const aSize = ARROW_SIZE * dpr;
	for (const ax of yAxes) {
		if (ax.categoryLabels) continue;
		if (!ax.showGrid) continue;
		if (!(ax.min <= 0 && ax.max >= 0 && ax.max > ax.min)) continue;
		const range = ax.max - ax.min;
		const norm = (0 - ax.min) / range;
		const sy = (pad.top + (1 - norm) * ch) * dpr;
		const tipX = (w - pad.right + 8) * dpr;
		buf[p++] = tipX;
		buf[p++] = sy;
		buf[p++] = tipX - aSize;
		buf[p++] = sy - aSize / 2;
		buf[p++] = tipX - aSize;
		buf[p++] = sy + aSize / 2;
	}
	if (
		xAxis &&
		xAxis.showGrid &&
		!xAxis.categoryLabels &&
		xAxis.min <= 0 &&
		xAxis.max >= 0 &&
		xAxis.max > xAxis.min
	) {
		const range = xAxis.max - xAxis.min;
		const norm = (0 - xAxis.min) / range;
		const sx = (pad.left + norm * cw) * dpr;
		const tipY = (pad.top - 8) * dpr;
		buf[p++] = sx;
		buf[p++] = tipY;
		buf[p++] = sx - aSize / 2;
		buf[p++] = tipY + aSize;
		buf[p++] = sx + aSize / 2;
		buf[p++] = tipY + aSize;
	}
	return p;
}

/**
 * Append axis arrow tips (TRIANGLES) for every x-axis row and every y-axis.
 * No straddle/grid guards — these arrows belong to the axis frame itself.
 */
export function writeAxisArrows(
	buf: Float32Array,
	p: number,
	xAxes: readonly XAxisLine[],
	xAxesMetrics: readonly XAxisMetric[],
	yAxes: readonly YAxisLine[],
	axisLayout: Record<string, YAxisGutter | undefined>,
	leftOffsets: Record<string, number | undefined>,
	rightOffsets: Record<string, number | undefined>,
	pad: Padding,
	w: number,
	h: number,
	dpr: number,
): number {
	const aSize = ARROW_SIZE * dpr;
	for (let idx = 0; idx < xAxes.length; idx++) {
		const m = xAxesMetrics[idx];
		if (!m) continue;
		const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
		const tipX = (w - pad.right + 8) * dpr;
		buf[p++] = tipX;
		buf[p++] = yL;
		buf[p++] = (w - pad.right + 8 - 6) * dpr;
		buf[p++] = yL - aSize / 2;
		buf[p++] = (w - pad.right + 8 - 6) * dpr;
		buf[p++] = yL + aSize / 2;
	}
	const tipY = (pad.top - 8) * dpr;
	for (const ax of yAxes) {
		const isLeft = ax.position === "left";
		const total = axisLayout[ax.id]?.total ?? DEFAULT_GUTTER_TOTAL;
		const xPos = isLeft
			? pad.left - (leftOffsets[ax.id] ?? 0) - total
			: w - pad.right + (rightOffsets[ax.id] ?? 0);
		const lineX = isLeft ? xPos + total : xPos;
		buf[p++] = lineX * dpr;
		buf[p++] = tipY;
		buf[p++] = (lineX - 3) * dpr;
		buf[p++] = tipY + aSize;
		buf[p++] = (lineX + 3) * dpr;
		buf[p++] = tipY + aSize;
	}
	return p;
}
