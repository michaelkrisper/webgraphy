import { describe, expect, it, vi } from "vitest";
import type { DecimCache } from "../decimationCache";
import { getOrComputeM4, releaseDecimSlot } from "../decimationCache";

describe("getOrComputeM4", () => {
	function makeMockGl() {
		const createBuffer = vi.fn(() => ({}));
		const bindBuffer = vi.fn();
		const bufferData = vi.fn();
		return {
			gl: {
				createBuffer,
				bindBuffer,
				bufferData,
				ARRAY_BUFFER: 34962,
				DYNAMIC_DRAW: 35048,
			} as unknown as WebGL2RenderingContext,
			createBuffer,
			bufferData,
		};
	}

	it("returns the same cached entry when called with identical params (no string sig allocation)", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);

		expect(e2).toBe(e1); // referential equality — cache hit returned the same object
		expect(bufferData).toHaveBeenCalledTimes(2); // only on the first (miss) call: one for x, one for y
	});

	it("recomputes when bucketWidth crosses an octave (2x zoom)", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		// Halved xRange → bucketWidth drops an octave → cache miss
		getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 5, 5, 8, 3);

		expect(bufferData).toHaveBeenCalledTimes(4); // 2 calls × 2 buffers each
	});

	it("serves a covering entry within two octaves while interacting", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);
		// 2x zoom-in crosses an octave — strict mode would recompute, but the
		// interacting path tolerates the coarser covered entry.
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			2.5,
			7.5,
			5,
			8,
			3,
			true,
		);
		expect(e2).toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(2);

		// The settle redraw runs strict and recomputes exactly.
		const e3 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			2.5,
			7.5,
			5,
			8,
			3,
		);
		expect(e3).not.toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(4);
	});

	it("recomputes while interacting once the bucket width is more than two octaves off", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);
		// 10x zoom-in: ideal bucket width is 8x finer — beyond the 4x tolerance.
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			4.5,
			5.5,
			1,
			8,
			3,
			true,
		);
		expect(e2).not.toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(4);
	});

	it("reuses the entry while zooming within a bucket-width octave", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);
		// Slight zoom-in: same quantized bucketWidth, viewport still covered.
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0.5,
			9.5,
			9,
			8,
			3,
		);

		expect(e2).toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(2); // only the initial miss uploaded
	});

	it("reuses the entry while panning inside the padded window, recomputes beyond it", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		// Span [-10, 50] is wide enough that a [0,10] viewport stays on the
		// windowed path (window < half the span) instead of becoming a
		// full-span pyramid level.
		const xData = new Float32Array(300);
		const yData = new Float32Array(300);
		for (let i = 0; i < 300; i++) {
			xData[i] = i * 0.2 - 10;
			yData[i] = i;
		}

		// Entry computed for viewport [0,10] covers roughly [-5,15].
		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			4,
			14,
			10,
			8,
			3,
		);
		expect(e2).toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(2);

		// Viewport exits the cached window → recompute.
		const e3 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			8,
			18,
			10,
			8,
			3,
		);
		expect(e3).not.toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(4);
	});

	it("keeps a full-span pyramid level alive across intermediate zooms", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array(64);
		const yData = new Float32Array(64);
		for (let i = 0; i < 64; i++) {
			xData[i] = i;
			yData[i] = (i * 29) % 17;
		}

		// Full view → stored as a full-span level.
		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			64,
			64,
			8,
			3,
		);
		// Deep zoom-in → separate windowed entry.
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			30,
			32,
			2,
			8,
			3,
		);
		expect(e2).not.toBe(e1);

		// Back at full view: the level is served again without any re-upload.
		const calls = bufferData.mock.calls.length;
		const e3 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			64,
			64,
			8,
			3,
		);
		expect(e3).toBe(e1);
		expect(bufferData.mock.calls.length).toBe(calls);
	});

	it("derives coarser zoom-out levels by octave merge, matching a raw scan", () => {
		const { gl } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array(256);
		const yData = new Float32Array(256);
		for (let i = 0; i < 256; i++) {
			xData[i] = i;
			yData[i] = Math.sin(i / 5) * ((i % 7) + 1);
		}

		// Establish a fine full-span level, then zoom out one octave.
		getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 256, 256, 8, 3);
		const merged = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			-128,
			384,
			512,
			8,
			3,
		);

		// A cold cache at the same zoom must produce identical points.
		const cold: DecimCache = new WeakMap();
		const direct = getOrComputeM4(
			gl,
			cold,
			scratch,
			xData,
			yData,
			0,
			-128,
			384,
			512,
			8,
			3,
		);
		expect(Array.from(merged.xArr)).toEqual(Array.from(direct.xArr));
		expect(Array.from(merged.yArr)).toEqual(Array.from(direct.yArr));
	});

	it("keeps separate entries for the same yData under different xData", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
		const xA = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const xB = new Float32Array([0, 2, 4, 6, 8, 10, 12, 14, 16, 18]);

		const eA = getOrComputeM4(gl, cache, scratch, xA, yData, 0, 0, 10, 10, 8, 3);
		const eB = getOrComputeM4(gl, cache, scratch, xB, yData, 0, 0, 20, 20, 8, 3);
		expect(eB).not.toBe(eA);
		expect(bufferData).toHaveBeenCalledTimes(4);

		// Alternating between the two series must not evict either entry.
		expect(
			getOrComputeM4(gl, cache, scratch, xA, yData, 0, 0, 10, 10, 8, 3),
		).toBe(eA);
		expect(
			getOrComputeM4(gl, cache, scratch, xB, yData, 0, 0, 20, 20, 8, 3),
		).toBe(eB);
		expect(bufferData).toHaveBeenCalledTimes(4);
	});

	it("emits identical points for buckets shared across a zoom recompute", () => {
		const { gl } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		// Dense noisy data so each bucket has distinct extrema representatives.
		const n = 4000;
		const xData = new Float32Array(n);
		const yData = new Float32Array(n);
		for (let i = 0; i < n; i++) {
			xData[i] = i * 0.005;
			yData[i] = Math.sin(i * 1.7) * 100 + Math.sin(i * 0.13) * 10;
		}

		const e1 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			20,
			20,
			8,
			3,
		);
		const pts1 = new Map<number, number>();
		for (let i = 0; i < e1.count; i++) pts1.set(e1.xArr[i], e1.yArr[i]);

		// Force a recompute at the same bucket width by moving the viewport far
		// right, then check every point in the overlap region is unchanged —
		// the absolute power-of-two grid must pick the same representatives.
		cache.delete(yData);
		const e2 = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			5,
			25,
			20,
			8,
			3,
		);
		let overlap = 0;
		for (let i = 0; i < e2.count; i++) {
			const x = e2.xArr[i];
			if (x < 5 || x > 15) continue;
			expect(pts1.get(x)).toBe(e2.yArr[i]);
			overlap++;
		}
		expect(overlap).toBeGreaterThan(50);
	});

	it("stores numeric signature fields on the entry", () => {
		const { gl } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e = getOrComputeM4(
			gl,
			cache,
			scratch,
			xData,
			yData,
			0,
			0,
			10,
			10,
			8,
			3,
		);

		expect(typeof e.bucketWidth).toBe("number");
		expect(typeof e.qMin).toBe("number");
		expect(typeof e.qMax).toBe("number");
		expect(e.xRef).toBe(0);
	});

	describe("segmented series", () => {
		// 0..4095 with a NaN gap at 2000..2009.
		function gapped() {
			const n = 4096;
			const xData = Float32Array.from({ length: n }, (_, i) => i);
			const yData = Float32Array.from({ length: n }, (_, i) => Math.sin(i * 0.37));
			for (let i = 2000; i < 2010; i++) yData[i] = Number.NaN;
			const segments = [
				{ start: 0, end: 1999 },
				{ start: 2010, end: 4095 },
			];
			return { xData, yData, segments };
		}

		const runExtents = (e: {
			xArr: Float32Array;
			runs: number[];
		}): [number, number][] => {
			const out: [number, number][] = [];
			for (let r = 0; r < e.runs.length; r += 2) {
				const xs = e.xArr.subarray(e.runs[r], e.runs[r] + e.runs[r + 1]);
				out.push([xs[0], xs[xs.length - 1]]);
			}
			return out;
		};

		it("records one run per segment so the gap is not bridged", () => {
			const { gl } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
			const { xData, yData, segments } = gapped();
			const e = getOrComputeM4(
				gl,
				cache,
				scratch,
				xData,
				yData,
				0,
				0,
				4096,
				4096,
				64,
				3,
				false,
				segments,
			);
			expect(runExtents(e)).toEqual([
				[0, 1999],
				[2010, 4095],
			]);
			expect(e.count).toBeLessThan(xData.length);
		});

		it("keeps the runs through an octave merge, matching a raw scan", () => {
			const { gl } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
			const { xData, yData, segments } = gapped();
			const at = (c: DecimCache, min: number, max: number) =>
				getOrComputeM4(
					gl,
					c,
					scratch,
					xData,
					yData,
					0,
					min,
					max,
					max - min,
					64,
					3,
					false,
					segments,
				);
			at(cache, 0, 4096);
			const merged = at(cache, -2048, 6144);
			const direct = at(new WeakMap(), -2048, 6144);
			expect(merged.runs).toEqual(direct.runs);
			expect(Array.from(merged.xArr)).toEqual(Array.from(direct.xArr));
			expect(Array.from(merged.yArr)).toEqual(Array.from(direct.yArr));
			expect(runExtents(merged)).toEqual([
				[0, 1999],
				[2010, 4095],
			]);
		});

		it("treats an unsegmented series as a single run", () => {
			const { gl } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
			const xData = Float32Array.from({ length: 512 }, (_, i) => i);
			const yData = Float32Array.from({ length: 512 }, (_, i) => i % 7);
			const e = getOrComputeM4(
				gl,
				cache,
				scratch,
				xData,
				yData,
				0,
				0,
				512,
				512,
				8,
				3,
			);
			expect(e.runs).toEqual([0, e.count]);
		});
	});

	describe("log x axis", () => {
		// 1..10000 linearly spaced: 4 decades.
		function series() {
			const n = 10_000;
			const xData = Float32Array.from({ length: n }, (_, i) => i + 1);
			const yData = Float32Array.from(
				{ length: n },
				(_, i) => Math.sin(i / 13) * ((i % 11) + 1),
			);
			return { xData, yData };
		}
		const scratch = () => ({ x: new Float32Array(0), y: new Float32Array(0) });

		it("keys linear and log results separately for the same columns", () => {
			const { gl, bufferData } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const { xData, yData } = series();
			const s = scratch();
			const args = [gl, cache, s, xData, yData, 0] as const;
			const asLog = [false, undefined, true] as const;
			// Both resolve to a bucket width of 2^-6 (data units vs decades),
			// i.e. the same pyramid level key: a shared slot would serve the
			// log level (infinite coverage) to the linear view.
			const lin = getOrComputeM4(...args, 1, 4, 3, 64, 3);
			const log = getOrComputeM4(...args, 1, 10_000, 4, 64, 3, ...asLog);
			expect(lin.bucketWidth).toBe(log.bucketWidth);
			expect(log).not.toBe(lin);
			const slots = cache.get(yData)?.get(xData);
			expect(slots?.linear?.entry).toBe(lin);
			expect(slots?.log?.levels.get(-6)).toBe(log);
			expect(slots?.linear?.levels.size).toBe(0);

			// Toggling back to either scale is a cache hit, no re-upload.
			const uploads = bufferData.mock.calls.length;
			expect(getOrComputeM4(...args, 1, 4, 3, 64, 3)).toBe(lin);
			expect(getOrComputeM4(...args, 1, 10_000, 4, 64, 3, ...asLog)).toBe(log);
			expect(bufferData).toHaveBeenCalledTimes(uploads);
		});

		it("buckets in log10(x): low decades keep every sample, high ones decimate", () => {
			const { gl } = makeMockGl();
			const { xData, yData } = series();
			const e = getOrComputeM4(
				gl,
				new WeakMap(),
				scratch(),
				xData,
				yData,
				0,
				1,
				10_000,
				4,
				64,
				3,
				false,
				undefined,
				true,
			);
			// 192 log buckets over 4 decades: the first decade (9 samples)
			// spans 48 buckets, so all of them survive; the whole output is a
			// small fraction of the input.
			const firstDecade = Array.from(e.xArr).filter((v) => v < 10);
			expect(firstDecade).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
			expect(e.count).toBeLessThan(4 * 192 + 2);
			// A linear grid of the same bucket count would collapse the first
			// decade into a single bucket.
			const lin = getOrComputeM4(
				gl,
				new WeakMap(),
				scratch(),
				xData,
				yData,
				0,
				1,
				10_000,
				9_999,
				64,
				3,
			);
			expect(Array.from(lin.xArr).filter((v) => v < 10).length).toBeLessThan(5);
		});

		it("derives zoom-out log levels by octave merge, matching a raw scan", () => {
			const { gl } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const { xData, yData } = series();
			const s = scratch();
			const log = [false, undefined, true] as const;
			getOrComputeM4(gl, cache, s, xData, yData, 0, 1, 10_000, 4, 64, 3, ...log);
			// Zoom out one octave in decades: [10^-2, 10^6].
			const merged = getOrComputeM4(
				gl,
				cache,
				s,
				xData,
				yData,
				0,
				1e-2,
				1e6,
				8,
				64,
				3,
				...log,
			);
			expect(cache.get(yData)?.get(xData)?.log?.levels.size).toBe(2);
			const direct = getOrComputeM4(
				gl,
				new WeakMap(),
				s,
				xData,
				yData,
				0,
				1e-2,
				1e6,
				8,
				64,
				3,
				...log,
			);
			expect(Array.from(merged.xArr)).toEqual(Array.from(direct.xArr));
			expect(Array.from(merged.yArr)).toEqual(Array.from(direct.yArr));
		});

		it("reuses a zoomed log window while panning inside its padding", () => {
			const { gl } = makeMockGl();
			const cache: DecimCache = new WeakMap();
			const { xData, yData } = series();
			const s = scratch();
			const log = [false, undefined, true] as const;
			// One decade visible, [100, 1000].
			const a = getOrComputeM4(
				gl,
				cache,
				s,
				xData,
				yData,
				0,
				100,
				1000,
				1,
				64,
				3,
				...log,
			);
			expect(a.qMin).toBeLessThanOrEqual(100);
			expect(a.qMax).toBeGreaterThanOrEqual(1000);
			// Pan by a quarter decade: still covered.
			const b = getOrComputeM4(
				gl,
				cache,
				s,
				xData,
				yData,
				0,
				10 ** 2.25,
				10 ** 3.25,
				1,
				64,
				3,
				...log,
			);
			expect(b).toBe(a);
		});

		it("keeps gaps open on log buckets and drops x <= 0", () => {
			const { gl } = makeMockGl();
			const n = 4_000;
			// xRef -100 puts the first 101 samples at x <= 0.
			const xData = Float32Array.from({ length: n }, (_, i) => i);
			const yData = Float32Array.from({ length: n }, (_, i) => Math.cos(i / 7));
			for (let i = 2_000; i < 2_005; i++) yData[i] = Number.NaN;
			const segments = [
				{ start: 0, end: 1_999 },
				{ start: 2_005, end: n - 1 },
			];
			const e = getOrComputeM4(
				gl,
				new WeakMap(),
				scratch(),
				xData,
				yData,
				-100,
				1,
				3_900,
				Math.log10(3_900),
				32,
				3,
				false,
				segments,
				true,
			);
			expect(e.runs.length).toBe(4);
			const first = e.xArr.subarray(e.runs[0], e.runs[0] + e.runs[1]);
			const second = e.xArr.subarray(e.runs[2], e.runs[2] + e.runs[3]);
			expect(Math.max(...first)).toBe(1_999);
			expect(Math.min(...second)).toBe(2_005);
			for (const v of e.xArr) expect(v - 100).toBeGreaterThan(0);
		});
	});

	describe("releaseDecimSlot", () => {
		it("deletes the windowed entry and every pyramid level of both scales", () => {
			const { gl } = makeMockGl();
			let id = 0;
			(gl.createBuffer as ReturnType<typeof vi.fn>).mockImplementation(() => ({
				id: id++,
			}));
			const deleteBuffer = vi.fn();
			(gl as unknown as { deleteBuffer: typeof deleteBuffer }).deleteBuffer =
				deleteBuffer;
			const cache: DecimCache = new WeakMap();
			const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
			const n = 4096;
			const xData = Float32Array.from({ length: n }, (_, i) => i);
			const yData = Float32Array.from({ length: n }, (_, i) => Math.sin(i));
			// Full-span pyramid level, a merged coarser level, and a windowed
			// entry from a deep zoom.
			getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, n, n, 64, 3);
			getOrComputeM4(gl, cache, scratch, xData, yData, 0, -n, 2 * n, 3 * n, 64, 3);
			getOrComputeM4(gl, cache, scratch, xData, yData, 0, 100, 164, 64, 64, 3);
			// ...and the same columns decimated for a log x axis.
			getOrComputeM4(
				gl,
				cache,
				scratch,
				xData,
				yData,
				1,
				1,
				n,
				Math.log10(n),
				64,
				3,
				false,
				undefined,
				true,
			);
			const created = (
				gl.createBuffer as ReturnType<typeof vi.fn>
			).mock.results.map((r) => r.value);
			expect(created.length).toBeGreaterThanOrEqual(6);

			releaseDecimSlot(gl, cache, xData, yData);
			expect(new Set(deleteBuffer.mock.calls.map((c) => c[0]))).toEqual(
				new Set(created),
			);
			expect(cache.get(yData)?.get(xData)).toBeUndefined();

			// Releasing an unknown pair is a no-op.
			releaseDecimSlot(gl, cache, new Float32Array(1), yData);
			expect(deleteBuffer).toHaveBeenCalledTimes(created.length);
		});
	});
});
