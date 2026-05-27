// Pure pan/zoom range math, extracted from usePanZoom so it can be
// unit-tested in isolation. These helpers operate purely on axis ranges
// and never touch DOM, refs, or React state.

export interface Range {
	min: number;
	max: number;
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
