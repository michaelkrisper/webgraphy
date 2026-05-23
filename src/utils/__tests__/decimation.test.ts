import { describe, expect, it } from "vitest";
import { m4ByXFloat32, m4Float32 } from "../decimation";

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

	it("should handle NaN values in data", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, NaN, -10, NaN, 0]);
		const threshold = 4; // 1 bucket

		const result = m4Float32(xData, yData, threshold);
		// NaN should be included in the output if it's the first NaN in the bucket
		expect(Number.isNaN(result.y[1])).toBe(true);
		expect(result.x.length).toBeGreaterThan(0);
	});

	it("should reuse the out buffer if provided", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 4;

		const out = {
			x: new Float32Array(10),
			y: new Float32Array(10),
		};

		const result = m4Float32(xData, yData, threshold, out);
		expect(result.x.buffer).toBe(out.x.buffer);
		expect(result.y.buffer).toBe(out.y.buffer);
	});

	it("should resize the out buffer if it is too small", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 4;

		const out = {
			x: new Float32Array(1), // Too small, needs maxPoints = 1 * 5 = 5
			y: new Float32Array(1),
		};

		const origBuffer = out.x.buffer;

		const result = m4Float32(xData, yData, threshold, out);
		expect(result.x.buffer).not.toBe(origBuffer); // Should have created a new buffer
		expect(out.x.length).toBeGreaterThanOrEqual(5);
	});

	it("should resize the out buffer if it is too small when n <= threshold", () => {
		const xData = new Float32Array([1, 2, 3]);
		const yData = new Float32Array([10, 20, 30]);
		const threshold = 5;

		const out = {
			x: new Float32Array(1), // Too small, needs n = 3
			y: new Float32Array(1),
		};

		const result = m4Float32(xData, yData, threshold, out);
		expect(out.x.length).toBeGreaterThanOrEqual(3);
		expect(Array.from(result.x)).toEqual([1, 2, 3]);
	});
});

describe("m4ByXFloat32", () => {
	it("preserves min, max, first, and last values when points exceed threshold", () => {
		// All points fall into a single bucket [0, 10).
		const x = new Float32Array([1, 2, 3, 4, 5, 6, 7]);
		const y = new Float32Array([10, 5, 100, 20, -50, 15, 30]);

		// First: y=10 (idx 0)
		// Max: y=100 (idx 2)
		// Min: y=-50 (idx 4)
		// Last: y=30 (idx 6)
		const r = m4ByXFloat32(x, y, 0, 0, 10, 10);

		// Output indices should be sorted: 0, 2, 4, 6
		expect(Array.from(r.x)).toEqual([1, 3, 5, 7]);
		expect(Array.from(r.y)).toEqual([10, 100, -50, 30]);
	});

	it("returns empty for empty input", () => {
		const x = new Float32Array([]);
		const y = new Float32Array([]);
		const r = m4ByXFloat32(x, y, 0, 0, 10, 2.5);
		expect(r.x.length).toBe(0);
	});

	it("emits start/min/max/end per pixel-anchored bucket", () => {
		const x = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const y = new Float32Array([10, 20, 0, 15, 5, 0, 100, 50]);
		// 2 buckets across [0, 8): bucket0=x<4 (idx 0..3), bucket1=x<8 (idx 4..7)
		const r = m4ByXFloat32(x, y, 0, 0, 8, 4);
		expect(Array.from(r.y)).toEqual([10, 20, 0, 15, 5, 0, 100, 50]);
	});

	it("preserves extrema across buckets", () => {
		const x = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const y = new Float32Array([0, 100, -100, 0, 0, 0, 0, 500, -500, 0]);
		const r = m4ByXFloat32(x, y, 0, 0, 10, 5);
		const ys = Array.from(r.y);
		expect(ys).toContain(100);
		expect(ys).toContain(-100);
		expect(ys).toContain(500);
		expect(ys).toContain(-500);
	});

	it("bucket boundaries are stable under slice change", () => {
		// Same world-X buckets must pick same extrema regardless of how many points are in slice
		const xFull = new Float32Array(1000);
		const yFull = new Float32Array(1000);
		for (let i = 0; i < 1000; i++) {
			xFull[i] = i;
			yFull[i] = Math.sin(i * 0.1) * 100;
		}
		const r1 = m4ByXFloat32(xFull, yFull, 0, 100, 200, 10);
		// Slice subarray covering same world range [100, 200) plus boundary points
		const xSub = xFull.subarray(99, 201);
		const ySub = yFull.subarray(99, 201);
		const r2 = m4ByXFloat32(xSub, ySub, 0, 100, 200, 10);
		expect(Array.from(r2.y)).toEqual(Array.from(r1.y));
	});

	it("bucket boundaries are stable under pan (world-grid anchored)", () => {
		// Same bucketWidth + zoom but pan-shifted window must pick same extrema in overlap.
		const xFull = new Float32Array(1000);
		const yFull = new Float32Array(1000);
		for (let i = 0; i < 1000; i++) {
			xFull[i] = i;
			yFull[i] = Math.sin(i * 0.13) * 100 + Math.cos(i * 0.07) * 50;
		}
		const bw = 7;
		const a = m4ByXFloat32(xFull, yFull, 0, 100, 300, bw);
		const b = m4ByXFloat32(xFull, yFull, 0, 103, 303, bw);
		// Find overlap of bucket grids: any aligned bucket in both windows must produce
		// identical x-samples (same extrema indices).
		const setA = new Set(Array.from(a.x));
		const setB = new Set(Array.from(b.x));
		let shared = 0;
		for (const xv of setA) if (setB.has(xv)) shared++;
		expect(shared).toBeGreaterThan(20);
	});

	it("respects xRef offset", () => {
		const x = new Float32Array([0, 1, 2, 3]);
		const y = new Float32Array([1, 2, 3, 4]);
		// xRef=1000 → world X = 1000..1003
		const r = m4ByXFloat32(x, y, 1000, 1000, 1004, 2);

		expect(r.x.length).toBeGreaterThan(0);
		expect(Array.from(r.y)).toContain(1);
		expect(Array.from(r.y)).toContain(4);
	});

	it("skips empty buckets", () => {
		const x = new Float32Array([0, 1, 9]);
		const y = new Float32Array([1, 2, 3]);
		// 5 buckets across [0,10): bucket 1..3 empty
		const r = m4ByXFloat32(x, y, 0, 0, 10, 2);
		expect(Array.from(r.y).sort()).toEqual([1, 2, 3]);
	});

	it("ignores NaN y values", () => {
		const x = new Float32Array([0, 1, 2, 3]);
		const y = new Float32Array([1, NaN, 3, NaN]);
		const r = m4ByXFloat32(x, y, 0, 0, 4, 4);
		const ys = Array.from(r.y);
		expect(ys).not.toContain(NaN);
		expect(ys).toContain(1);
		expect(ys).toContain(3);
	});
});
