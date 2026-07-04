// Data-shape analysis helpers used to prepare a series for WebGL drawing.
// All three are pure (with optional WeakMap caches for repeat lookups by
// Float32Array identity) and have no GL/state dependencies, so they can be
// unit-tested in isolation.

import {
	findFirstGE,
	findLastLE,
	findSegmentStartIndex,
} from "../../utils/binarySearch";

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
			// Negated >= so NaN x values (comparisons are always false) flag the
			// column as non-monotonic — binary-search slicing and M4 decimation
			// both assume a sorted, NaN-free x column.
			if (!(xData[i] >= xData[i - 1])) {
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

/**
 * Intersect a series' cached segments with the visible slice and write the
 * resulting draw ranges into `drawRangesScratch` in place, reusing existing
 * slots and truncating to the new length so per-frame allocation stays at
 * zero.
 *
 * For non-monotonic data every segment is emitted as-is; for monotonic data
 * segments are clipped to `[sliceStart, sliceEnd]` and scanned starting from
 * the first segment whose `end >= sliceStart` (via binary search).
 */
export function computeDrawRanges(
	cachedSegments: readonly { start: number; end: number }[],
	isMonotonic: boolean,
	sliceStart: number,
	sliceEnd: number,
	drawRangesScratch: { start: number; count: number }[],
): void {
	let drCount = 0;
	const pushRange = (start: number, count: number) => {
		if (drCount < drawRangesScratch.length) {
			drawRangesScratch[drCount].start = start;
			drawRangesScratch[drCount].count = count;
		} else {
			drawRangesScratch.push({ start, count });
		}
		drCount++;
	};

	if (isMonotonic) {
		const startSegIdx = findSegmentStartIndex(
			cachedSegments as { start: number; end: number }[],
			sliceStart,
		);
		for (let i = startSegIdx; i < cachedSegments.length; i++) {
			const seg = cachedSegments[i];
			if (seg.start > sliceEnd) break;
			const segS = Math.max(seg.start, sliceStart);
			const segE = Math.min(seg.end, sliceEnd);
			if (segE >= segS) pushRange(segS, segE - segS + 1);
		}
	} else {
		for (const seg of cachedSegments) {
			pushRange(seg.start, seg.end - seg.start + 1);
		}
	}
	drawRangesScratch.length = drCount;
}
