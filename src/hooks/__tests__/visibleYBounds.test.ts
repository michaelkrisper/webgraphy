import { describe, expect, it } from "vitest";
import { visibleYBounds } from "../useAutoScale";

const f32 = (v: number[]) => Float32Array.from(v);

describe("visibleYBounds", () => {
	it("slices sorted x by binary search", () => {
		const x = f32([0, 1, 2, 3, 4, 5]);
		const y = f32([100, 1, 2, 3, 4, -100]);
		expect(visibleYBounds(x, 0, y, 0, 1, 4)).toEqual({ min: 1, max: 4 });
	});

	it("scans unsorted (scatter) x linearly instead of binary-searching", () => {
		// Binary search over this x lands on the wrong slice and misses the
		// visible extremes at indices 0 and 5.
		const x = f32([2, 9, 0, 8, 1, 3]);
		const y = f32([-50, 1000, 7, -1000, 5, 60]);
		expect(visibleYBounds(x, 0, y, 0, 0, 3)).toEqual({ min: -50, max: 60 });
	});

	it("treats NaN x as unsorted and skips those points", () => {
		const x = f32([0, 1, NaN, 3]);
		const y = f32([1, 2, 999, 4]);
		expect(visibleYBounds(x, 0, y, 0, 0, 3)).toEqual({ min: 1, max: 4 });
	});

	it("applies refPoint offsets on both axes", () => {
		const x = f32([5, 1, 3]);
		const y = f32([1, 2, 3]);
		expect(visibleYBounds(x, 1000, y, 10, 1000, 1003)).toEqual({
			min: 12,
			max: 13,
		});
	});

	it("returns null when nothing is visible", () => {
		expect(visibleYBounds(f32([0, 1, 2]), 0, f32([1, 2, 3]), 0, 5, 6)).toBe(null);
		expect(visibleYBounds(f32([2, 0, 1]), 0, f32([1, 2, 3]), 0, 5, 6)).toBe(null);
	});
});
