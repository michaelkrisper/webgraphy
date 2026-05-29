// Data-shape analysis helpers used to prepare a series for WebGL drawing.
// All three are pure (with optional WeakMap caches for repeat lookups by
// Float32Array identity) and have no GL/state dependencies, so they can be
// unit-tested in isolation.

import { findFirstGE, findLastLE } from "../../utils/binarySearch";

/**
 * Returns true when `xData` is monotonically non-decreasing. Each call shares
 * the result across the supplied cache, keyed by Float32Array identity.
 */
export function getOrComputeMonotonicity(
	xData: Float32Array,
	monoCache: WeakMap<Float32Array, boolean>,
): boolean {
	let isMonotonic = monoCache.get(xData);
	if (isMonotonic === undefined) {
		isMonotonic = true;
		for (let i = 1; i < xData.length; i++) {
			if (xData[i] < xData[i - 1]) {
				isMonotonic = false;
				break;
			}
		}
		monoCache.set(xData, isMonotonic);
	}
	return isMonotonic;
}

/**
 * Split a series into contiguous segments. A segment ends whenever the y
 * value is NaN (a gap) or x jumps backwards (an unsorted wrap). Cached on the
 * y array identity since the renderer keys segments by y.
 */
export function getOrComputeSegments(
	xData: Float32Array,
	yData: Float32Array,
	segmentCache: WeakMap<Float32Array, { start: number; end: number }[]>,
): { start: number; end: number }[] {
	let cachedSegments = segmentCache.get(yData);
	if (!cachedSegments) {
		cachedSegments = [];
		let segStart = -1;
		const len = yData.length;
		for (let i = 0; i < len; i++) {
			if (Number.isNaN(yData[i])) {
				if (segStart !== -1) {
					cachedSegments.push({ start: segStart, end: i - 1 });
					segStart = -1;
				}
			} else if (segStart === -1) {
				segStart = i;
			} else if (xData[i] < xData[i - 1]) {
				cachedSegments.push({ start: segStart, end: i - 1 });
				segStart = i;
			}
		}
		if (segStart !== -1) {
			cachedSegments.push({ start: segStart, end: len - 1 });
		}
		segmentCache.set(yData, cachedSegments);
	}
	return cachedSegments;
}

/**
 * Index range of `xData` that covers the visible x window `[xAxisMin,
 * xAxisMax]`, with one extra sample on each side so the renderer can draw
 * the partial segment that enters/leaves the viewport. For non-monotonic
 * data we conservatively return the whole array.
 */
export function computeDataSlice(
	xData: Float32Array,
	xAxisMin: number,
	xAxisMax: number,
	xRef: number,
	isMonotonic: boolean,
): { sliceStart: number; sliceEnd: number } {
	const xDataLen = xData.length;
	let rawStart = 0;
	let rawEnd = xDataLen - 1;
	if (isMonotonic) {
		rawStart = findLastLE(xData, xAxisMin, xRef, 0);
		rawEnd = findFirstGE(xData, xAxisMax, xRef, xDataLen - 1);
	}

	const sliceStart = isMonotonic
		? Math.max(0, rawStart > 0 ? rawStart - 1 : 0)
		: 0;
	const sliceEnd = isMonotonic
		? Math.min(xDataLen - 1, rawEnd < xDataLen - 1 ? rawEnd + 1 : rawEnd)
		: xDataLen - 1;

	return { sliceStart, sliceEnd };
}
