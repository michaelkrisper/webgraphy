import { describe, expect, it } from "vitest";
import {
	logBucketIndex,
	m4ByLogXFloat32,
	m4ByXFloat32,
	m4ByXSegmentsFloat32,
	m4Float32,
	m4MergeOctave,
} from "../decimation";

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

	it("should not resize the out buffer if it is already large enough when n <= threshold", () => {
		const xData = new Float32Array([1, 2, 3]);
		const yData = new Float32Array([10, 20, 30]);
		const threshold = 5;

		const out = {
			x: new Float32Array(10), // large enough
			y: new Float32Array(10),
		};

		const origBuffer = out.x.buffer;
		const result = m4Float32(xData, yData, threshold, out);
		expect(out.x.buffer).toBe(origBuffer);
		expect(Array.from(result.x)).toEqual([1, 2, 3]);
	});

	it("should handle NaN values in xData", () => {
		const xData = new Float32Array([0, 1, NaN, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 4; // 1 bucket

		const result = m4Float32(xData, yData, threshold);
		// NaN should be included in the output if it's the first NaN in the bucket
		// resulting array: [0, 1, NaN, 4]
		let hasNaN = false;
		for (let i = 0; i < result.x.length; i++) {
			if (Number.isNaN(result.x[i])) {
				hasNaN = true;
				break;
			}
		}
		expect(hasNaN).toBe(true);
		expect(result.y.length).toBeGreaterThan(0);
	});

	it("should not resize the out buffer if it is already large enough when n > threshold", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 4; // 1 bucket, maxPoints = 1 * 5 = 5

		const out = {
			x: new Float32Array(10), // Large enough
			y: new Float32Array(10),
		};

		const origBuffer = out.x.buffer;

		const result = m4Float32(xData, yData, threshold, out);
		expect(out.x.buffer).toBe(origBuffer); // Should not have created a new buffer
		expect(result.x.length).toBe(4);
	});

	it("should handle zero or negative thresholds", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4]);
		const yData = new Float32Array([0, 10, -10, 5, 0]);
		const threshold = 0; // numBuckets = max(1, floor(0/4)) = 1

		const result = m4Float32(xData, yData, threshold);

		expect(result.x.length).toBeGreaterThan(0);
		expect(Array.from(result.x)).toEqual([0, 1, 2, 4]);
	});

	// Same ordering invariant as the x-anchored variant: samples are gathered
	// as (first, min, max, nan, last) and sorted back into index order.
	it("emits indices in ascending order for every extremum arrangement", () => {
		for (let minPos = 1; minPos < 5; minPos++) {
			for (let maxPos = 1; maxPos < 5; maxPos++) {
				if (minPos === maxPos) continue;
				const x = new Float32Array([0, 1, 2, 3, 4, 5]);
				const y = new Float32Array([0, 0, 0, 0, 0, 0]);
				y[minPos] = -100;
				y[maxPos] = 100;

				// threshold 4 -> a single bucket over all six points.
				const r = m4Float32(x, y, 4);

				for (let i = 1; i < r.x.length; i++) {
					expect(r.x[i]).toBeGreaterThanOrEqual(r.x[i - 1]);
				}
				expect(Array.from(r.y)).toContain(-100);
				expect(Array.from(r.y)).toContain(100);
			}
		}
	});

	it("keeps order when a bucket carries first, min, max, NaN and last", () => {
		// The five-entry case: every slot distinct, which is the only path
		// through the three-comparison insertion sort.
		const x = new Float32Array([0, 1, 2, 3, 4, 5, 6]);
		const y = new Float32Array([1, -50, 2, NaN, 80, 3, 4]);

		const r = m4Float32(x, y, 4);

		for (let i = 1; i < r.x.length; i++) {
			expect(r.x[i]).toBeGreaterThanOrEqual(r.x[i - 1]);
		}
		const ys = Array.from(r.y);
		expect(ys).toContain(-50);
		expect(ys).toContain(80);
		// The NaN is deliberately kept so the renderer breaks the line there.
		expect(ys.some((v) => Number.isNaN(v))).toBe(true);
	});

	it("writes a grown buffer back through out when downsampling", () => {
		const n = 500;
		const x = new Float32Array(n);
		const y = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			x[i] = i;
			y[i] = Math.cos(i * 0.2) * 50;
		}
		const out = { x: new Float32Array(4), y: new Float32Array(4) };

		const r = m4Float32(x, y, 128, out);

		// Too small for 128/4 buckets, so a fresh buffer is allocated — and the
		// caller must receive it, otherwise the next frame reallocates again.
		expect(out.x.length).toBeGreaterThan(4);
		expect(out.y.length).toBe(out.x.length);
		expect(r.x.buffer).toBe(out.x.buffer);
		expect(r.x.length).toBeGreaterThan(4);
	});

	it("preserves every bucket's extrema against a full-resolution scan", () => {
		// The defining property of M4: whatever the decimation does, the visible
		// silhouette must not change, so each bucket's true min and max have to
		// appear in the output.
		const n = 2048;
		const threshold = 256;
		const x = new Float32Array(n);
		const y = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			x[i] = i;
			// Deterministic, spiky, and not aligned to the bucket grid.
			y[i] = Math.sin(i * 0.37) * 100 + ((i * 17) % 23);
		}

		const r = m4Float32(x, y, threshold, undefined);
		const emitted = new Set(Array.from(r.y));

		const numBuckets = Math.floor(threshold / 4);
		const bucketSize = n / numBuckets;
		for (let b = 0; b < numBuckets; b++) {
			const start = Math.floor(b * bucketSize);
			const end = Math.min(n - 1, Math.floor((b + 1) * bucketSize) - 1);
			let lo = Infinity;
			let hi = -Infinity;
			for (let i = start; i <= end; i++) {
				if (y[i] < lo) lo = y[i];
				if (y[i] > hi) hi = y[i];
			}
			expect(emitted.has(lo)).toBe(true);
			expect(emitted.has(hi)).toBe(true);
		}
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

	// The per-bucket samples are collected as (first, min, max, last) in
	// discovery order and then insertion-sorted back into index order. If that
	// sort is wrong the renderer draws segments that jump backwards in x —
	// visible as a scribble, not as a crash. These cover all three sort arities.
	it("emits x in non-decreasing order for every extremum arrangement", () => {
		// Within one bucket of five points, walk every position the min and max
		// can occupy relative to first/last. Each arrangement exercises a
		// different bucket length (3, 4 or 5 entries) and sort path.
		for (let minPos = 0; minPos < 5; minPos++) {
			for (let maxPos = 0; maxPos < 5; maxPos++) {
				if (minPos === maxPos) continue;
				const x = new Float32Array([0, 1, 2, 3, 4]);
				const y = new Float32Array([0, 0, 0, 0, 0]);
				y[minPos] = -100;
				y[maxPos] = 100;

				const r = m4ByXFloat32(x, y, 0, 0, 5, 5);

				for (let i = 1; i < r.x.length; i++) {
					expect(r.x[i]).toBeGreaterThanOrEqual(r.x[i - 1]);
				}
				// Whatever the ordering, both extrema must survive.
				expect(Array.from(r.y)).toContain(-100);
				expect(Array.from(r.y)).toContain(100);
			}
		}
	});

	it("skips NaN when picking the leading and trailing continuity anchors", () => {
		// Anchors let the line enter and leave the viewport instead of starting
		// inside it. A NaN anchor would draw a gap at the edge, so the search
		// walks outwards past NaNs.
		const x = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const y = new Float32Array([5, NaN, NaN, 10, 20, NaN, NaN, 9]);

		// Viewport covers only x in [3, 5); indices 1-2 and 5-6 are the NaN runs
		// immediately outside it.
		const r = m4ByXFloat32(x, y, 0, 3, 5, 2);

		const ys = Array.from(r.y);
		expect(ys).not.toContain(NaN);
		// Leading anchor skipped back over the NaNs to index 0...
		expect(ys[0]).toBe(5);
		// ...and the trailing one forward over the NaNs to index 7.
		expect(ys[ys.length - 1]).toBe(9);
	});

	it("reuses a large enough out buffer instead of allocating", () => {
		const x = new Float32Array([0, 1, 2, 3]);
		const y = new Float32Array([1, 2, 3, 4]);
		const out = { x: new Float32Array(64), y: new Float32Array(64) };
		const originalX = out.x;
		const originalY = out.y;

		const r = m4ByXFloat32(x, y, 0, 0, 4, 4, out);

		expect(out.x).toBe(originalX);
		expect(out.y).toBe(originalY);
		expect(r.x.buffer).toBe(originalX.buffer);
		expect(Array.from(r.y)).toContain(1);
	});

	it("grows an undersized out buffer and still returns every sample", () => {
		const n = 400;
		const x = new Float32Array(n);
		const y = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			x[i] = i;
			y[i] = Math.sin(i * 0.3) * 100;
		}
		// Deliberately far too small: the buffer has to be replaced, and the
		// replacement has to be handed back through `out` for the next frame.
		const out = { x: new Float32Array(2), y: new Float32Array(2) };

		const r = m4ByXFloat32(x, y, 0, 0, n, 4, out);

		expect(out.x.length).toBeGreaterThan(2);
		expect(r.x.length).toBeGreaterThan(2);
		expect(r.x.length).toBe(r.y.length);
		for (let i = 0; i < r.y.length; i++) {
			expect(Number.isNaN(r.y[i])).toBe(false);
		}
	});

	it("hands the out buffer back even when the input is degenerate", () => {
		const x = new Float32Array([1, 2, 3]);
		const y = new Float32Array([1, 2, 3]);
		const out = { x: new Float32Array(0), y: new Float32Array(0) };

		// xMax <= xMin: nothing to draw, but the caller still reuses `out`
		// next frame, so it must come back as a usable buffer.
		const r = m4ByXFloat32(x, y, 0, 10, 10, 1, out);

		expect(r.x.length).toBe(0);
		expect(out.x.length).toBeGreaterThan(0);
		expect(out.y.length).toBe(out.x.length);
	});
});

describe("m4MergeOctave", () => {
	// Property: merging an M4 level one octave up must equal a direct M4 pass
	// over the raw data at the coarser bucket width (grids nest at powers of
	// two anchored at world 0).
	function directAndMerged(
		xData: Float32Array,
		yData: Float32Array,
		xRef: number,
		fineWidth: number,
	) {
		const xMin = xData[0] + xRef;
		const xMax = xData[xData.length - 1] + xRef;
		const fine = m4ByXFloat32(xData, yData, xRef, xMin, xMax, fineWidth);
		const merged = m4MergeOctave(fine.x, fine.y, xRef, fineWidth * 2);
		const direct = m4ByXFloat32(xData, yData, xRef, xMin, xMax, fineWidth * 2);
		return { merged, direct };
	}

	it("equals a direct coarse M4 pass on a noisy series", () => {
		const n = 1000;
		const xData = new Float32Array(n);
		const yData = new Float32Array(n);
		let seed = 42;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		for (let i = 0; i < n; i++) {
			xData[i] = i * 0.13;
			yData[i] = Math.sin(i / 7) * 10 + rand() * 5;
		}

		const { merged, direct } = directAndMerged(xData, yData, 0, 2);
		expect(Array.from(merged.x)).toEqual(Array.from(direct.x));
		expect(Array.from(merged.y)).toEqual(Array.from(direct.y));
	});

	it("equals a direct coarse M4 pass with a non-zero xRef", () => {
		const n = 500;
		const xData = new Float32Array(n);
		const yData = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			xData[i] = i * 0.5;
			yData[i] = ((i * 37) % 11) - 5;
		}

		const { merged, direct } = directAndMerged(xData, yData, 1024, 4);
		expect(Array.from(merged.x)).toEqual(Array.from(direct.x));
		expect(Array.from(merged.y)).toEqual(Array.from(direct.y));
	});

	it("survives repeated octave merges (level ladder)", () => {
		const n = 2048;
		const xData = new Float32Array(n);
		const yData = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			xData[i] = i;
			yData[i] = Math.cos(i / 3) * (1 + (i % 13));
		}
		const xMin = xData[0];
		const xMax = xData[n - 1];

		let level = m4ByXFloat32(xData, yData, 0, xMin, xMax, 8);
		for (const w of [16, 32, 64]) {
			level = m4MergeOctave(level.x, level.y, 0, w);
			const direct = m4ByXFloat32(xData, yData, 0, xMin, xMax, w);
			expect(Array.from(level.x)).toEqual(Array.from(direct.x));
			expect(Array.from(level.y)).toEqual(Array.from(direct.y));
		}
	});

	it("handles ties by keeping the earliest extremum like direct M4", () => {
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7]);
		const yData = new Float32Array([1, 5, 5, 1, 1, 5, 5, 1]);

		const { merged, direct } = directAndMerged(xData, yData, 0, 2);
		expect(Array.from(merged.x)).toEqual(Array.from(direct.x));
		expect(Array.from(merged.y)).toEqual(Array.from(direct.y));
	});
});

describe("m4ByXSegmentsFloat32", () => {
	const scratch = () => ({ x: new Float32Array(0), y: new Float32Array(0) });

	// 0..999 with a NaN gap at 400..409 and a single sample at 700 between
	// gaps at 699 and 701.
	function gapped() {
		const n = 1000;
		const x = Float32Array.from({ length: n }, (_, i) => i);
		const y = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.37));
		for (let i = 400; i < 410; i++) y[i] = Number.NaN;
		y[699] = Number.NaN;
		y[701] = Number.NaN;
		const segments = [
			{ start: 0, end: 399 },
			{ start: 410, end: 698 },
			{ start: 700, end: 700 },
			{ start: 702, end: 999 },
		];
		return { x, y, segments };
	}

	it("decimates each segment into its own run, never across a gap", () => {
		const { x, y, segments } = gapped();
		const r = m4ByXSegmentsFloat32(x, y, segments, 0, 0, 999, 16, scratch());

		// Single-sample segment dropped: it draws no line.
		expect(r.runs.length).toBe(3 * 2);
		const bounds = [
			[0, 399],
			[410, 698],
			[702, 999],
		];
		for (let k = 0; k < 3; k++) {
			const start = r.runs[k * 2];
			const count = r.runs[k * 2 + 1];
			const xs = Array.from(r.x.subarray(start, start + count));
			expect(Math.min(...xs)).toBe(bounds[k][0]);
			expect(Math.max(...xs)).toBe(bounds[k][1]);
		}
		expect(r.x.length).toBeLessThan(x.length / 2);
		for (const v of r.y) expect(Number.isNaN(v)).toBe(false);
	});

	it("keeps every segment's extrema", () => {
		const { x, y, segments } = gapped();
		const r = m4ByXSegmentsFloat32(x, y, segments, 0, 0, 999, 16, scratch());
		const kept = new Set(Array.from(r.y));
		for (const seg of [segments[0], segments[1], segments[3]]) {
			const slice = Array.from(y.subarray(seg.start, seg.end + 1));
			expect(kept.has(Math.max(...slice) as number)).toBe(true);
			expect(kept.has(Math.min(...slice) as number)).toBe(true);
		}
	});

	it("matches the single-run M4 on a segment that spans the window", () => {
		const { x, y, segments } = gapped();
		const r = m4ByXSegmentsFloat32(x, y, segments, 0, 450, 650, 4, scratch());
		const direct = m4ByXFloat32(
			x.subarray(410, 699),
			y.subarray(410, 699),
			0,
			450,
			650,
			4,
		);
		expect(r.runs).toEqual([0, direct.x.length]);
		expect(Array.from(r.x)).toEqual(Array.from(direct.x));
		expect(Array.from(r.y)).toEqual(Array.from(direct.y));
	});

	it("skips segments outside the window", () => {
		const { x, y, segments } = gapped();
		const r = m4ByXSegmentsFloat32(x, y, segments, 0, 800, 900, 8, scratch());
		expect(r.runs.length).toBe(2);
		expect(r.x[0]).toBeGreaterThanOrEqual(702);
	});
});

describe("m4ByLogXFloat32", () => {
	const scratch = () => ({ x: new Float32Array(0), y: new Float32Array(0) });

	// Deterministic noise (LCG) so failures reproduce.
	function noisy(n: number, xAt: (i: number) => number) {
		let seed = 7;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		const x = new Float32Array(n);
		const y = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			x[i] = xAt(i);
			y[i] = Math.sin(i / 9) * 10 + rand() * 4;
		}
		return { x, y };
	}

	/**
	 * Brute force: assign every sample to floor(log10(xRef + v) / w), keep
	 * (first, min, max, last) per bucket in index order, plus the nearest
	 * sample on each side of the bucket range as continuity anchors.
	 */
	function reference(
		x: Float32Array,
		y: Float32Array,
		xRef: number,
		xMin: number,
		xMax: number,
		w: number,
	): number[] {
		const kStart = Math.floor(Math.log10(xMin) / w);
		const out: number[] = [];
		const byBucket = new Map<number, number[]>();
		let before = -1;
		let after = -1;
		for (let i = 0; i < x.length; i++) {
			const v = x[i] + xRef;
			if (!(v > 0)) {
				before = i;
				continue;
			}
			const k = Math.floor(Math.log10(v) / w);
			if (k < kStart) before = i;
			else if (10 ** (k * w) >= xMax) {
				if (after === -1) after = i;
			} else {
				const list = byBucket.get(k) ?? [];
				list.push(i);
				byBucket.set(k, list);
			}
		}
		if (before >= 0 && x[before] + xRef > 0) out.push(before);
		for (const k of [...byBucket.keys()].sort((a, b) => a - b)) {
			const idx = byBucket.get(k) as number[];
			let min = idx[0];
			let max = idx[0];
			for (const i of idx) {
				if (y[i] < y[min]) min = i;
				if (y[i] > y[max]) max = i;
			}
			const first = idx[0];
			const last = idx[idx.length - 1];
			const keep = new Set([first, min, max, last]);
			out.push(...[...keep].sort((a, b) => a - b));
		}
		if (after >= 0) out.push(after);
		return out;
	}

	function expectMatchesReference(
		x: Float32Array,
		y: Float32Array,
		xRef: number,
		xMin: number,
		xMax: number,
		w: number,
	) {
		const r = m4ByLogXFloat32(x, y, xRef, xMin, xMax, w);
		const idx = reference(x, y, xRef, xMin, xMax, w);
		expect(Array.from(r.x)).toEqual(idx.map((i) => x[i]));
		expect(Array.from(r.y)).toEqual(idx.map((i) => y[i]));
		return r;
	}

	it("matches a brute-force per-log-bucket (first, min, max, last)", () => {
		// Linearly spaced samples: dense log buckets at the top, sparse
		// (one sample or empty) at the bottom.
		const { x, y } = noisy(20_000, (i) => 1 + i * 0.5);
		const r = expectMatchesReference(x, y, 0, 1, 10_000, 1 / 64);
		expect(r.x.length).toBeLessThan(x.length / 4);
	});

	it("matches the reference inside a zoomed window with edge anchors", () => {
		const { x, y } = noisy(20_000, (i) => 1 + i * 0.5);
		const r = expectMatchesReference(x, y, 0, 300, 2_000, 1 / 256);
		expect(r.x[0]).toBeLessThan(300);
		expect(r.x[r.x.length - 1]).toBeGreaterThanOrEqual(2_000);
	});

	it("compares against absolute x = refPoint + v", () => {
		const { x, y } = noisy(5_000, (i) => i * 2);
		expectMatchesReference(x, y, 1_000, 1_000, 11_000, 1 / 128);
	});

	it("never emits samples a log axis cannot place (x <= 0)", () => {
		// xRef -500 puts the first 251 samples at x <= 0.
		const { x, y } = noisy(2_000, (i) => i * 2);
		const r = expectMatchesReference(x, y, -500, 1e-3, 4_000, 1 / 32);
		for (const v of r.x) expect(v - 500).toBeGreaterThan(0);
	});

	it("keeps every sample when buckets are finer than the spacing", () => {
		// 40 decades, ten samples per decade: the empty buckets in between
		// are skipped by the search instead of being walked one by one.
		const n = 400;
		const x = Float32Array.from({ length: n }, (_, i) => 10 ** (i / 10 - 20));
		const y = Float32Array.from({ length: n }, (_, i) => i % 5);
		const r = m4ByLogXFloat32(x, y, 0, x[0], x[n - 1] * 2, 1 / 1024);
		expect(Array.from(r.x)).toEqual(Array.from(x));
	});

	it("skips NaN y like the linear walk", () => {
		const { x, y } = noisy(1_000, (i) => 1 + i);
		for (let i = 100; i < 200; i++) y[i] = Number.NaN;
		const r = m4ByLogXFloat32(x, y, 0, 1, 1_001, 1 / 64);
		for (const v of r.y) expect(Number.isNaN(v)).toBe(false);
	});

	it("returns an empty result for a window a log axis cannot show", () => {
		const out = { x: new Float32Array(0), y: new Float32Array(0) };
		const x = new Float32Array([1, 2, 3]);
		const y = new Float32Array([1, 2, 3]);
		expect(m4ByLogXFloat32(x, y, 0, 0, 10, 0.1, out).x.length).toBe(0);
		expect(m4ByLogXFloat32(x, y, 0, 5, 5, 0.1, out).x.length).toBe(0);
		expect(out.x.length).toBeGreaterThan(0);
	});

	it("puts a sample on a bucket edge in the bucket that starts there", () => {
		const w = 1 / 4;
		for (const k of [-9, -1, 0, 1, 3, 17]) {
			const edge = 10 ** (k * w);
			expect(logBucketIndex(edge, w)).toBe(k);
			expect(logBucketIndex(edge * (1 - 1e-12), w)).toBe(k - 1);
		}
	});

	it("merges an octave up exactly like a direct log M4 pass", () => {
		const { x, y } = noisy(20_000, (i) => 1 + i * 0.5);
		const xRef = 3;
		const xMin = x[0] + xRef;
		const xMax = x[x.length - 1] + xRef;
		let level = m4ByLogXFloat32(x, y, xRef, xMin, xMax, 1 / 512);
		for (const w of [1 / 256, 1 / 128, 1 / 64]) {
			level = m4MergeOctave(level.x, level.y, xRef, w, true);
			const direct = m4ByLogXFloat32(x, y, xRef, xMin, xMax, w);
			expect(Array.from(level.x)).toEqual(Array.from(direct.x));
			expect(Array.from(level.y)).toEqual(Array.from(direct.y));
		}
	});

	it("decimates gapped series per segment on log buckets", () => {
		const n = 10_000;
		const { x, y } = noisy(n, (i) => 1 + i);
		for (let i = 3_000; i < 3_010; i++) y[i] = Number.NaN;
		const segments = [
			{ start: 0, end: 2_999 },
			{ start: 3_010, end: n - 1 },
		];
		const r = m4ByXSegmentsFloat32(
			x,
			y,
			segments,
			0,
			1,
			n,
			1 / 128,
			scratch(),
			true,
		);
		expect(r.runs.length).toBe(4);
		const firstRun = r.x.subarray(r.runs[0], r.runs[0] + r.runs[1]);
		const secondRun = r.x.subarray(r.runs[2], r.runs[2] + r.runs[3]);
		// The gap stays open: no run crosses it.
		expect(Math.max(...firstRun)).toBe(3_000);
		expect(Math.min(...secondRun)).toBe(3_011);
		expect(r.x.length).toBeLessThan(n / 4);
		// Each run is exactly the single-run log M4 of its segment.
		const direct = m4ByLogXFloat32(
			x.subarray(3_010),
			y.subarray(3_010),
			0,
			3_011,
			n,
			1 / 128,
		);
		expect(Array.from(secondRun)).toEqual(Array.from(direct.x));
	});

	it("treats a segment entirely at x <= 0 as off-axis", () => {
		const x = Float32Array.from({ length: 200 }, (_, i) => i - 100);
		const y = Float32Array.from({ length: 200 }, (_, i) => Math.sin(i));
		y[99] = Number.NaN;
		const segments = [
			{ start: 0, end: 98 },
			{ start: 100, end: 199 },
		];
		const r = m4ByXSegmentsFloat32(
			x,
			y,
			segments,
			0,
			1,
			99,
			1 / 64,
			scratch(),
			true,
		);
		expect(r.runs.length).toBe(2);
		for (const v of r.x) expect(v).toBeGreaterThan(0);
	});
});
