import { describe, expect, it } from "vitest";
import { m4Float32 } from "../lttb";

describe("m4Float32", () => {
	it("should pass-through if n <= threshold", () => {
		const xData = new Float32Array([1, 2, 3]);
		const yData = new Float32Array([10, 20, 30]);
		const threshold = 3;

		const result = m4Float32(xData, yData, threshold);

		expect(Array.from(result.x)).toEqual([1, 2, 3]);
		expect(Array.from(result.y)).toEqual([10, 20, 30]);
	});

	it("should handle empty input when n <= threshold", () => {
		const xData = new Float32Array([]);
		const yData = new Float32Array([]);
		const result = m4Float32(xData, yData, 10);
		expect(result.x.length).toBe(0);
		expect(result.y.length).toBe(0);
	});

	it("should downsample when n > threshold", () => {
		// 12 points, threshold 4 -> 1 bucket
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
		const yData = new Float32Array([0, 10, -5, 20, 0, 0, 0, 0, 0, 0, 0, 5]);
		const threshold = 4; // 1 bucket

		const result = m4Float32(xData, yData, threshold);

		// Bucket indices for 1 bucket:
		// start=0, end=11
		// minIdx=2 (value -5), maxIdx=3 (value 20)
		// bucket = [0, 11, 2, 3] -> sorted [0, 2, 3, 11]
		expect(Array.from(result.x)).toEqual([0, 2, 3, 11]);
		expect(Array.from(result.y)).toEqual([0, -5, 20, 5]);
	});

	it("should handle multiple buckets", () => {
		// 8 points, threshold 8 -> 2 buckets of size 4
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const yData = new Float32Array([
			10,
			20,
			0,
			15, // bucket 0: first=10, last=15, min=0, max=20 -> [0, 1, 2, 3]
			5,
			0,
			100,
			50, // bucket 1: first=5, last=50, min=0, max=100 -> [4, 5, 6, 7]
		]);
		const threshold = 8;

		const result = m4Float32(xData, yData, threshold);

		expect(Array.from(result.x)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
		expect(Array.from(result.y)).toEqual([10, 20, 0, 15, 5, 0, 100, 50]);
	});

	it("should deduplicate indices within buckets", () => {
		// 5 points, threshold 4 -> 1 bucket (since 5 > 4)
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 1, 2, 3, 4]); // monotonic, min=first, max=last
		const threshold = 4;

		const result = m4Float32(xData, yData, threshold);

		// Bucket 0: start=0, end=4, minIdx=0, maxIdx=4
		// Set {0, 4, 0, 4} -> [0, 4]
		expect(Array.from(result.x)).toEqual([0, 4]);
		expect(Array.from(result.y)).toEqual([0, 4]);
	});

	it("should correctly handle threshold during downsampling", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 0, 0]);
		const threshold = 4; // 1 bucket

		const result = m4Float32(xData, yData, threshold);

		// Bucket: [0, 4, 2, 1] -> sorted [0, 1, 2, 4]
		expect(Array.from(result.x)).toEqual([0, 1, 2, 4]);
		expect(Array.from(result.y)).toEqual([0, 10, -10, 0]);
	});

	it("should handle threshold < 4 by creating at least one bucket", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 2; // Math.max(1, floor(2/4)) = 1 bucket

		const result = m4Float32(xData, yData, threshold);

		// 1 bucket: [0, 4, 2, 1] -> [0, 1, 2, 4]
		expect(result.x.length).toBeGreaterThan(0);
		expect(Array.from(result.x)).toEqual([0, 1, 2, 4]);
	});

	it("should preserve extrema across multiple buckets", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([
			0,
			100,
			-100,
			0,
			0, // Bucket 0: [0, 4, 2, 1]
			0,
			0,
			500,
			-500,
			0, // Bucket 1: [5, 9, 8, 7]
		]);
		const threshold = 8; // 2 buckets

		const result = m4Float32(xData, yData, threshold);

		expect(Array.from(result.y)).toContain(100);
		expect(Array.from(result.y)).toContain(-100);
		expect(Array.from(result.y)).toContain(500);
		expect(Array.from(result.y)).toContain(-500);
	});
});
