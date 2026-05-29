import { describe, expect, it, vi } from "vitest";
import {
	computeDataSlice,
	computeDrawRanges,
	getOrComputeMonotonicity,
	getOrComputeSegments,
} from "../seriesPrep";

describe("getOrComputeMonotonicity", () => {
	it("returns true for a monotonically non-decreasing array", () => {
		const arr = new Float32Array([1, 2, 3, 3, 5]);
		expect(getOrComputeMonotonicity(arr, new WeakMap())).toBe(true);
	});

	it("returns false when a value drops below its predecessor", () => {
		const arr = new Float32Array([1, 2, 1, 3]);
		expect(getOrComputeMonotonicity(arr, new WeakMap())).toBe(false);
	});

	it("treats single-element and empty arrays as monotonic", () => {
		expect(
			getOrComputeMonotonicity(new Float32Array([42]), new WeakMap()),
		).toBe(true);
		expect(getOrComputeMonotonicity(new Float32Array(), new WeakMap())).toBe(
			true,
		);
	});

	it("memoizes the result by Float32Array identity", () => {
		const arr = new Float32Array([1, 2, 3]);
		const cache = new WeakMap<Float32Array, boolean>();
		getOrComputeMonotonicity(arr, cache);
		const spy = vi.spyOn(cache, "set");
		// Same array -> cache hit, no set
		getOrComputeMonotonicity(arr, cache);
		expect(spy).not.toHaveBeenCalled();
	});
});

describe("getOrComputeSegments", () => {
	it("yields one segment covering the whole array when y has no NaNs", () => {
		const xData = new Float32Array([0, 1, 2, 3]);
		const yData = new Float32Array([10, 20, 30, 40]);
		expect(getOrComputeSegments(xData, yData, new WeakMap())).toEqual([
			{ start: 0, end: 3 },
		]);
	});

	it("splits on NaN gaps in y", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([1, NaN, 3, NaN, 5]);
		expect(getOrComputeSegments(xData, yData, new WeakMap())).toEqual([
			{ start: 0, end: 0 },
			{ start: 2, end: 2 },
			{ start: 4, end: 4 },
		]);
	});

	it("splits on a backward x jump (wrap)", () => {
		const xData = new Float32Array([0, 1, 2, 0, 1]);
		const yData = new Float32Array([1, 2, 3, 4, 5]);
		expect(getOrComputeSegments(xData, yData, new WeakMap())).toEqual([
			{ start: 0, end: 2 },
			{ start: 3, end: 4 },
		]);
	});

	it("closes the trailing segment at the array end", () => {
		const xData = new Float32Array([0, 1, 2]);
		const yData = new Float32Array([NaN, 2, 3]);
		expect(getOrComputeSegments(xData, yData, new WeakMap())).toEqual([
			{ start: 1, end: 2 },
		]);
	});

	it("memoizes by yData identity, not xData", () => {
		const xData = new Float32Array([0, 1, 2]);
		const yData = new Float32Array([1, 2, 3]);
		const cache = new WeakMap<Float32Array, { start: number; end: number }[]>();
		const first = getOrComputeSegments(xData, yData, cache);
		const second = getOrComputeSegments(xData, yData, cache);
		expect(second).toBe(first);
	});
});

describe("computeDataSlice", () => {
	it("returns the full array for non-monotonic data", () => {
		const xData = new Float32Array([0, 5, 2, 10]);
		const r = computeDataSlice(xData, 0, 10, 0, false);
		expect(r).toEqual({ sliceStart: 0, sliceEnd: 3 });
	});

	it("returns a slice covering the visible window plus one sample on each side", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const r = computeDataSlice(xData, 3.5, 6.5, 0, true);
		// findLastLE(3.5) -> idx 3 (value 3), -1 padding -> 2
		// findFirstGE(6.5) -> idx 7 (value 7), +1 padding -> 8
		expect(r).toEqual({ sliceStart: 2, sliceEnd: 8 });
	});

	it("clamps the slice to array bounds", () => {
		const xData = new Float32Array([10, 20, 30]);
		// window covers everything
		expect(computeDataSlice(xData, 0, 100, 0, true)).toEqual({
			sliceStart: 0,
			sliceEnd: 2,
		});
	});

	it("respects xRef offsets when matching the window", () => {
		// stored values are deltas; absolute = stored + ref
		const xData = new Float32Array([0, 1, 2, 3]);
		const ref = 1000;
		// window in absolute coords
		const r = computeDataSlice(xData, 1001, 1002, ref, true);
		// absolute values are [1000, 1001, 1002, 1003]
		// findLastLE(1001) -> idx 1, -1 padding -> 0
		// findFirstGE(1002) -> idx 2, +1 padding -> 3
		expect(r).toEqual({ sliceStart: 0, sliceEnd: 3 });
	});
});

describe("computeDrawRanges", () => {
	it("emits every segment unchanged for non-monotonic data", () => {
		const segments = [
			{ start: 0, end: 3 },
			{ start: 7, end: 9 },
		];
		const out: { start: number; count: number }[] = [];
		computeDrawRanges(segments, false, 0, 0, out);
		expect(out).toEqual([
			{ start: 0, count: 4 },
			{ start: 7, count: 3 },
		]);
	});

	it("clips segments to the visible slice for monotonic data", () => {
		const segments = [{ start: 0, end: 10 }];
		const out: { start: number; count: number }[] = [];
		computeDrawRanges(segments, true, 3, 7, out);
		expect(out).toEqual([{ start: 3, count: 5 }]);
	});

	it("skips segments entirely before the slice", () => {
		const segments = [
			{ start: 0, end: 2 },
			{ start: 5, end: 10 },
		];
		const out: { start: number; count: number }[] = [];
		computeDrawRanges(segments, true, 5, 10, out);
		expect(out).toEqual([{ start: 5, count: 6 }]);
	});

	it("stops scanning after a segment starts past the slice end", () => {
		const segments = [
			{ start: 0, end: 5 },
			{ start: 6, end: 10 },
			{ start: 20, end: 30 },
		];
		const out: { start: number; count: number }[] = [];
		computeDrawRanges(segments, true, 0, 15, out);
		expect(out).toEqual([
			{ start: 0, count: 6 },
			{ start: 6, count: 5 },
		]);
	});

	it("reuses existing scratch slots and truncates trailing entries", () => {
		const out = [
			{ start: 999, count: 999 },
			{ start: 999, count: 999 },
			{ start: 999, count: 999 },
		];
		computeDrawRanges(
			[{ start: 0, end: 5 }],
			true,
			0,
			10,
			out,
		);
		// One range written; scratch truncated to length 1.
		expect(out).toEqual([{ start: 0, count: 6 }]);
	});

	it("returns an empty result when no segments overlap the slice", () => {
		const out: { start: number; count: number }[] = [{ start: 1, count: 1 }];
		computeDrawRanges([{ start: 100, end: 200 }], true, 0, 10, out);
		expect(out).toEqual([]);
	});
});
