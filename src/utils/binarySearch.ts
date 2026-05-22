/**
 * Binary-search helpers over sorted numeric arrays.
 *
 * `refOffset` lets callers search arrays stored as deltas from a reference value
 * (e.g. Float32 columns with a `refPoint`) without materialising the absolute values.
 */

export function findLastLE(
	arr: ArrayLike<number>,
	target: number,
	refOffset = 0,
	fallback = 0,
): number {
	let lo = 0;
	let hi = arr.length - 1;
	let result = fallback;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (arr[mid] + refOffset <= target) {
			result = mid;
			lo = mid + 1;
		} else {
			hi = mid - 1;
		}
	}
	return result;
}

export function findFirstGE(
	arr: ArrayLike<number>,
	target: number,
	refOffset = 0,
	fallback = arr.length - 1,
): number {
	let lo = 0;
	let hi = arr.length - 1;
	let result = fallback;
	while (lo <= hi) {
		const mid = (lo + hi) >>> 1;
		if (arr[mid] + refOffset >= target) {
			result = mid;
			hi = mid - 1;
		} else {
			lo = mid + 1;
		}
	}
	return result;
}

/** Index of the element whose value is closest to `target`. Returns 0 on empty input. */
export function findClosest(
	arr: ArrayLike<number>,
	target: number,
	refOffset = 0,
): number {
	const n = arr.length;
	if (n === 0) return 0;
	let lo = 0;
	let hi = n - 1;
	while (lo < hi) {
		const mid = (lo + hi) >>> 1;
		if (arr[mid] + refOffset < target) lo = mid + 1;
		else hi = mid;
	}
	if (
		lo > 0 &&
		Math.abs(arr[lo - 1] + refOffset - target) <
			Math.abs(arr[lo] + refOffset - target)
	) {
		return lo - 1;
	}
	return lo;
}

export function findSegmentStartIndex(
	cachedSegments: { start: number; end: number }[],
	sliceStart: number,
): number {
	let segLo = 0;
	let segHi = cachedSegments.length - 1;
	let startSegIdx = 0;
	while (segLo <= segHi) {
		const m = (segLo + segHi) >>> 1;
		if (cachedSegments[m].end >= sliceStart) {
			startSegIdx = m;
			segHi = m - 1;
		} else segLo = m + 1;
	}
	return startSegIdx;
}
