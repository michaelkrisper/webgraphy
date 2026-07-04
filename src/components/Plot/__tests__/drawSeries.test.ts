import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecimCache, SeriesDrawBundle } from "../drawSeries";
import { drawSeriesLines, getOrComputeM4 } from "../drawSeries";
import type { GLStateCache } from "../GLStateCache";

type Mock = Record<string, unknown>;

describe("drawSeriesLines", () => {
	let mockGLStateCache: Mock;
	let mockBundle: Mock;
	let mockGl: Mock;
	let mockLineDecimCache: WeakMap<object, unknown>;
	let mockLineDecimScratch: { x: Float32Array; y: Float32Array };
	let mockSegBuffersRef: Map<string, unknown>;
	let mockSegParamsRef: Map<string, unknown>;

	beforeEach(() => {
		mockGl = {
			drawArrays: vi.fn(),
			drawArraysInstanced: vi.fn(),
			vertexAttribPointer: vi.fn(),
			bindBuffer: vi.fn(),
			bufferData: vi.fn(),
			ARRAY_BUFFER: 34962,
			STREAM_DRAW: 35040,
			TRIANGLES: 4,
			FLOAT: 5126,
			createBuffer: vi.fn(() => ({})),
		};

		mockGLStateCache = {
			gl: mockGl,
			locs: {
				xLoc: 1,
				yLoc: 2,
				otherLoc: 3,
				tLoc: 4,
				distStartLoc: 5,
			},
			lineLocs: {
				x0Loc: 0,
				y0Loc: 1,
				x1Loc: 2,
				y1Loc: 3,
				dist0Loc: 4,
			},
			useMain: vi.fn(),
			useLine: vi.fn(),
			setColor: vi.fn(),
			setPointSize: vi.fn(),
			setLineStyle: vi.fn(),
			setStyle: vi.fn(),
			disableAttribConst2: vi.fn(),
			disableAttribConst1: vi.fn(),
			enableAttrib: vi.fn(),
			setLineWidth: vi.fn(),
			lpSetColor: vi.fn(),
			lpSetWidth: vi.fn(),
			lpSetDash: vi.fn(),
			lpSetXScaleOff: vi.fn(),
			lpSetYScaleOff: vi.fn(),
		};

		mockBundle = {
			lineStyle: "solid",
			lineColorRgba: [1, 0, 0, 1],
			isHighlighted: false,
			dpr: 1,
			chartWidth: 100,
			chartHeight: 100,
			xRange: 10,
			yRange: 10,
			xAxisMin: 0,
			xAxisMax: 10,
			xScale: 1,
			xOff: 0,
			yScale: -1,
			yOff: 100,
			xData: new Float32Array([1, 2]),
			yData: new Float32Array([1, 2]),
			sliceStart: 0,
			sliceEnd: 1,
			isMonotonic: true,
			cachedSegments: [{ start: 0, end: 1 }],
			drawRanges: [{ start: 0, count: 2 }],
			xBuffer: {},
			yBuffer: {},
		};

		mockLineDecimCache = new WeakMap();
		mockLineDecimScratch = { x: new Float32Array(0), y: new Float32Array(0) };
		mockSegBuffersRef = new Map();
		mockSegParamsRef = new Map();
	});

	function callDrawSeriesLines() {
		drawSeriesLines(
			mockGLStateCache as unknown as GLStateCache,
			mockBundle as unknown as SeriesDrawBundle,
			mockLineDecimCache as Parameters<typeof drawSeriesLines>[2],
			mockLineDecimScratch as Parameters<typeof drawSeriesLines>[3],
			mockSegBuffersRef as Parameters<typeof drawSeriesLines>[4],
			mockSegParamsRef as Parameters<typeof drawSeriesLines>[5],
			"test_key",
		);
	}

	it("returns early when lineStyle is 'none'", () => {
		mockBundle.lineStyle = "none";
		callDrawSeriesLines();
		expect(mockGLStateCache.useLine).not.toHaveBeenCalled();
		expect(mockGLStateCache.lpSetColor).not.toHaveBeenCalled();
	});

	it("switches to the line program and sets color, transform, and width", () => {
		mockBundle.isHighlighted = true;
		mockBundle.dpr = 2;

		callDrawSeriesLines();

		expect(mockGLStateCache.useLine).toHaveBeenCalled();
		expect(mockGLStateCache.lpSetColor).toHaveBeenCalledWith(1, 0, 0, 1.0);
		expect(mockGLStateCache.lpSetXScaleOff).toHaveBeenCalledWith(1, 0);
		expect(mockGLStateCache.lpSetYScaleOff).toHaveBeenCalledWith(-1, 100);
		// Highlighted stroke: 2.5 CSS px scaled to device px.
		expect(mockGLStateCache.lpSetWidth).toHaveBeenCalledWith(2.5 * 2);
	});

	it("draws solid lines as instanced triangle capsules with dashes off", () => {
		callDrawSeriesLines();

		expect(mockGLStateCache.lpSetDash).toHaveBeenCalledWith(0, 0);
		// 2 points -> 1 segment instance, 6 verts per instance.
		expect(mockGl.drawArraysInstanced).toHaveBeenCalledWith(4, 0, 6, 1);
	});

	it("skips draw ranges with fewer than two points", () => {
		mockBundle.drawRanges = [
			{ start: 0, count: 1 },
			{ start: 1, count: 1 },
		];
		callDrawSeriesLines();
		expect(mockGl.drawArraysInstanced).not.toHaveBeenCalled();
	});

	it("binds per-instance segment endpoints from the column buffers", () => {
		mockBundle.drawRanges = [{ start: 3, count: 2 }];
		callDrawSeriesLines();

		// x0 reads at the range's byte offset, x1 one float later (stride 4).
		expect(mockGl.vertexAttribPointer).toHaveBeenCalledWith(
			0,
			1,
			5126,
			false,
			4,
			12,
		);
		expect(mockGl.vertexAttribPointer).toHaveBeenCalledWith(
			0 + 2,
			1,
			5126,
			false,
			4,
			16,
		);
		// Per-instance divisor on every segment attribute.
		expect(mockGLStateCache.enableAttrib).toHaveBeenCalledWith(0, 1);
		expect(mockGLStateCache.enableAttrib).toHaveBeenCalledWith(2, 1);
	});

	it("sets the dash pattern in device px for dashed lines", () => {
		mockBundle.lineStyle = "dashed";
		mockBundle.dpr = 2;

		callDrawSeriesLines();

		expect(mockGLStateCache.lpSetDash).toHaveBeenCalledWith(16, 12);
	});

	it("sets the dash pattern for dotted lines and draws instanced", () => {
		mockBundle.lineStyle = "dotted";

		callDrawSeriesLines();

		expect(mockGLStateCache.lpSetDash).toHaveBeenCalledWith(2, 4);
		// 1 segment instance from the single 2-point range.
		expect(mockGl.drawArraysInstanced).toHaveBeenCalledWith(4, 0, 6, 1);
	});

	it("builds the dashed instance buffer with 5 floats per segment", () => {
		mockBundle.lineStyle = "dashed";
		mockBundle.xData = new Float32Array([0, 1, 2]);
		mockBundle.yData = new Float32Array([0, 1, 0]);
		mockBundle.drawRanges = [{ start: 0, count: 3 }];

		callDrawSeriesLines();

		const uploaded = (mockGl.bufferData as ReturnType<typeof vi.fn>).mock
			.calls[0][1] as Float32Array;
		expect(uploaded.length).toBe(2 * 5);
		// Segment 0: (0,0) -> (1,1), cumulative distance starts at 0.
		expect(Array.from(uploaded.slice(0, 5))).toEqual([0, 0, 1, 1, 0]);
		// Segment 1 starts where segment 0 ended, with accumulated distance.
		expect(uploaded[5]).toBe(1);
		expect(uploaded[9]).toBeGreaterThan(0);
		expect(mockGl.drawArraysInstanced).toHaveBeenCalledWith(4, 0, 6, 2);
	});

	it("reuses the dashed instance buffer while pan keeps ranges stable", () => {
		mockBundle.lineStyle = "dashed";
		callDrawSeriesLines();
		expect(mockGl.bufferData).toHaveBeenCalledTimes(1);

		// Same ranges/zoom -> cache hit, no rebuild.
		callDrawSeriesLines();
		expect(mockGl.bufferData).toHaveBeenCalledTimes(1);

		// Zoom (xRange change) -> rebuild.
		mockBundle.xRange = 5;
		callDrawSeriesLines();
		expect(mockGl.bufferData).toHaveBeenCalledTimes(2);
	});
});

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

		const e1 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		const e2 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);

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

	it("reuses the entry while zooming within a bucket-width octave", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		// Slight zoom-in: same quantized bucketWidth, viewport still covered.
		const e2 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0.5, 9.5, 9, 8, 3);

		expect(e2).toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(2); // only the initial miss uploaded
	});

	it("reuses the entry while panning inside the padded window, recomputes beyond it", () => {
		const { gl, bufferData } = makeMockGl();
		const cache: DecimCache = new WeakMap();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array(200);
		const yData = new Float32Array(200);
		for (let i = 0; i < 200; i++) {
			xData[i] = i * 0.2 - 10;
			yData[i] = i;
		}

		// Entry computed for viewport [0,10] covers roughly [-5,15].
		const e1 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		const e2 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 4, 14, 10, 8, 3);
		expect(e2).toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(2);

		// Viewport exits the cached window → recompute.
		const e3 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 8, 18, 10, 8, 3);
		expect(e3).not.toBe(e1);
		expect(bufferData).toHaveBeenCalledTimes(4);
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
		expect(getOrComputeM4(gl, cache, scratch, xA, yData, 0, 0, 10, 10, 8, 3)).toBe(eA);
		expect(getOrComputeM4(gl, cache, scratch, xB, yData, 0, 0, 20, 20, 8, 3)).toBe(eB);
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

		const e1 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 20, 20, 8, 3);
		const pts1 = new Map<number, number>();
		for (let i = 0; i < e1.count; i++) pts1.set(e1.xArr[i], e1.yArr[i]);

		// Force a recompute at the same bucket width by moving the viewport far
		// right, then check every point in the overlap region is unchanged —
		// the absolute power-of-two grid must pick the same representatives.
		cache.delete(yData);
		const e2 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 5, 25, 20, 8, 3);
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

		const e = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);

		expect(typeof e.bucketWidth).toBe("number");
		expect(typeof e.qMin).toBe("number");
		expect(typeof e.qMax).toBe("number");
		expect(e.xRef).toBe(0);
	});
});
