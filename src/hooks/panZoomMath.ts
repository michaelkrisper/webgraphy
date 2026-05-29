// Pure pan/zoom range math, extracted from usePanZoom so it can be
// unit-tested in isolation. These helpers operate purely on axis ranges
// and never touch DOM, refs, or React state.

import { screenToWorld } from "../utils/coords";

export interface Range {
	min: number;
	max: number;
}

interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

/**
 * Zoom an axis range around a fixed world-space pivot.
 *
 * The pivot is the world coordinate under the pointer, and `weight` is the
 * pivot's fractional position across the chart (0 = range start edge,
 * 1 = range end edge). The pivot stays put while the range is scaled by
 * `zoomFactor` (>1 zooms out, <1 zooms in).
 */
export function applyZoomToRange(
	pivotWorld: number,
	min: number,
	max: number,
	weight: number,
	zoomFactor: number,
): Range {
	const newRange = (max - min) * zoomFactor;
	return {
		min: pivotWorld - weight * newRange,
		max: pivotWorld + (1 - weight) * newRange,
	};
}

/**
 * Translate an axis range by a pointer movement measured in pixels.
 *
 * `deltaPx` is the signed pixel movement already oriented for the axis
 * (callers negate it where the data should move opposite to the pointer),
 * and `chartSpanPx` is the axis' on-screen length in pixels. The range width
 * is preserved; both edges shift by the equivalent world distance.
 */
export function panRangeByPixels(
	min: number,
	max: number,
	deltaPx: number,
	chartSpanPx: number,
): Range {
	const worldShift = (deltaPx * (max - min)) / chartSpanPx;
	return { min: min + worldShift, max: max + worldShift };
}

interface AxisRange {
	id: string;
	min: number;
	max: number;
}

interface ZoomBox {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

/**
 * Convert a screen-space drag selection box into per-axis world ranges and
 * write them into the supplied interactive target buffers.
 *
 * Each x-axis maps the box's x-extent through its own axis-viewport. Y-axes
 * are mapped from the box's y-extent unless `xOnly` is set (shift-drag), in
 * which case the Y targets are left unchanged.
 */
export function applyZoomBoxToAxes(
	box: ZoomBox,
	xAxes: readonly AxisRange[],
	yAxes: readonly AxisRange[],
	width: number,
	height: number,
	padding: Padding,
	targetXAxes: Record<string, { min: number; max: number }>,
	targetYs: Record<string, { min: number; max: number }>,
	xOnly: boolean,
): void {
	const { minX, maxX, minY, maxY } = box;
	for (const axis of xAxes) {
		const vp = {
			xMin: axis.min,
			xMax: axis.max,
			yMin: 0,
			yMax: 100,
			width,
			height,
			padding,
		};
		const w1 = screenToWorld(minX, maxY, vp);
		const w2 = screenToWorld(maxX, minY, vp);
		targetXAxes[axis.id] = { min: w1.x, max: w2.x };
	}
	if (xOnly || xAxes.length === 0) return;
	const xRef = xAxes[0];
	for (const axis of yAxes) {
		const avp = {
			xMin: xRef.min,
			xMax: xRef.max,
			yMin: axis.min,
			yMax: axis.max,
			width,
			height,
			padding,
		};
		const a1 = screenToWorld(minX, maxY, avp);
		const a2 = screenToWorld(maxX, minY, avp);
		targetYs[axis.id] = { min: a1.y, max: a2.y };
	}
}
