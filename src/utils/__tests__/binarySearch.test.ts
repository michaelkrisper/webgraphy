import { describe, expect, it } from "vitest";
import { findClosest, findFirstGE, findLastLE } from "../binarySearch";

describe("findLastLE", () => {
	it("returns last index whose value <= target", () => {
		const arr = [0, 1, 2, 5, 8];
		expect(findLastLE(arr, 5)).toBe(3);
		expect(findLastLE(arr, 6)).toBe(3);
		expect(findLastLE(arr, 0)).toBe(0);
	});

	it("respects refOffset", () => {
		const arr = new Float32Array([0, 1, 2, 5, 8]);
		// values shifted by 10 -> [10,11,12,15,18]; target 12 -> idx 2
		expect(findLastLE(arr, 12, 10)).toBe(2);
	});

	it("returns fallback when no element matches", () => {
		expect(findLastLE([5, 6, 7], 3, 0, -1)).toBe(-1);
	});
});

describe("findFirstGE", () => {
	it("returns first index whose value >= target", () => {
		const arr = [0, 1, 2, 5, 8];
		expect(findFirstGE(arr, 3)).toBe(3);
		expect(findFirstGE(arr, 0)).toBe(0);
		expect(findFirstGE(arr, 8)).toBe(4);
	});

	it("respects refOffset", () => {
		const arr = new Float32Array([0, 1, 2, 5, 8]);
		// shifted +10 -> first >= 13 is idx 3 (value 15)
		expect(findFirstGE(arr, 13, 10)).toBe(3);
	});

	it("returns fallback when no element matches", () => {
		expect(findFirstGE([1, 2, 3], 10, 0, -1)).toBe(-1);
	});
});

describe("findClosest", () => {
	it("returns nearest index", () => {
		const arr = [0, 10, 20, 30];
		expect(findClosest(arr, 12)).toBe(1);
		expect(findClosest(arr, 16)).toBe(2);
		expect(findClosest(arr, -5)).toBe(0);
		expect(findClosest(arr, 100)).toBe(3);
	});

	it("respects refOffset", () => {
		const arr = new Float32Array([0, 10, 20]);
		// shifted +5 -> [5,15,25]; closest to 14 is idx 1
		expect(findClosest(arr, 14, 5)).toBe(1);
	});

	it("returns 0 on empty input", () => {
		expect(findClosest([], 5)).toBe(0);
	});
});
