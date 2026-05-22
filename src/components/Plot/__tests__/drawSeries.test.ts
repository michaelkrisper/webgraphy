import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DecimEntry, SeriesDrawBundle } from "../drawSeries";
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
			vertexAttribPointer: vi.fn(),
			bindBuffer: vi.fn(),
			bufferData: vi.fn(),
			ARRAY_BUFFER: 34962,
			STREAM_DRAW: 35040,
			LINES: 1,
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
			setColor: vi.fn(),
			setPointSize: vi.fn(),
			setLineStyle: vi.fn(),
			setStyle: vi.fn(),
			disableAttribConst2: vi.fn(),
			disableAttribConst1: vi.fn(),
			enableAttrib: vi.fn(),
			setLineWidth: vi.fn(),
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

	it("returns early when lineStyle is 'none'", () => {
		mockBundle.lineStyle = "none";
		drawSeriesLines(
			mockGLStateCache as unknown as GLStateCache,
			mockBundle as unknown as SeriesDrawBundle,
			mockLineDecimCache as Parameters<typeof drawSeriesLines>[2],
			mockLineDecimScratch as Parameters<typeof drawSeriesLines>[3],
			mockSegBuffersRef as Parameters<typeof drawSeriesLines>[4],
			mockSegParamsRef as Parameters<typeof drawSeriesLines>[5],
			"test_key",
		);
		expect(mockGLStateCache.setColor).not.toHaveBeenCalled();
	});

	it("sets basic color and style correctly for solid lines", () => {
		mockBundle.lineStyle = "solid";
		mockBundle.isHighlighted = true;
		mockBundle.dpr = 2;

		drawSeriesLines(
			mockGLStateCache as unknown as GLStateCache,
			mockBundle as unknown as SeriesDrawBundle,
			mockLineDecimCache as Parameters<typeof drawSeriesLines>[2],
			mockLineDecimScratch as Parameters<typeof drawSeriesLines>[3],
			mockSegBuffersRef as Parameters<typeof drawSeriesLines>[4],
			mockSegParamsRef as Parameters<typeof drawSeriesLines>[5],
			"test_key",
		);

		expect(mockGLStateCache.setColor).toHaveBeenCalledWith(1, 0, 0, 1.0);
		expect(mockGLStateCache.setPointSize).toHaveBeenCalledWith(2.5 * 2);
		expect(mockGLStateCache.setLineStyle).toHaveBeenCalledWith(0); // 0 = solid
		expect(mockGLStateCache.setStyle).toHaveBeenCalledWith(-1);
	});

	it("sets basic color and style correctly for dashed lines", () => {
		mockBundle.lineStyle = "dashed";

		drawSeriesLines(
			mockGLStateCache as unknown as GLStateCache,
			mockBundle as unknown as SeriesDrawBundle,
			mockLineDecimCache as Parameters<typeof drawSeriesLines>[2],
			mockLineDecimScratch as Parameters<typeof drawSeriesLines>[3],
			mockSegBuffersRef as Parameters<typeof drawSeriesLines>[4],
			mockSegParamsRef as Parameters<typeof drawSeriesLines>[5],
			"test_key",
		);

		expect(mockGLStateCache.setLineStyle).toHaveBeenCalledWith(1); // 1 = dashed
	});

	it("sets basic color and style correctly for dotted lines", () => {
		mockBundle.lineStyle = "dotted";

		drawSeriesLines(
			mockGLStateCache as unknown as GLStateCache,
			mockBundle as unknown as SeriesDrawBundle,
			mockLineDecimCache as Parameters<typeof drawSeriesLines>[2],
			mockLineDecimScratch as Parameters<typeof drawSeriesLines>[3],
			mockSegBuffersRef as Parameters<typeof drawSeriesLines>[4],
			mockSegParamsRef as Parameters<typeof drawSeriesLines>[5],
			"test_key",
		);

		expect(mockGLStateCache.setLineStyle).toHaveBeenCalledWith(2); // 2 = dotted
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
			} as unknown as WebGLRenderingContext,
			createBuffer,
			bufferData,
		};
	}

	it("returns the same cached entry when called with identical params (no string sig allocation)", () => {
		const { gl, bufferData } = makeMockGl();
		const cache = new WeakMap<Float32Array, DecimEntry>();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		const e1 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		const e2 = getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);

		expect(e2).toBe(e1); // referential equality — cache hit returned the same object
		expect(bufferData).toHaveBeenCalledTimes(2); // only on the first (miss) call: one for x, one for y
	});

	it("recomputes when bucketWidth changes (zoom)", () => {
		const { gl, bufferData } = makeMockGl();
		const cache = new WeakMap<Float32Array, DecimEntry>();
		const scratch = { x: new Float32Array(0), y: new Float32Array(0) };
		const xData = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
		const yData = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

		getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 10, 10, 8, 3);
		// Different xRange (zoom) → new bucketWidth → cache miss
		getOrComputeM4(gl, cache, scratch, xData, yData, 0, 0, 5, 5, 8, 3);

		expect(bufferData).toHaveBeenCalledTimes(4); // 2 calls × 2 buffers each
	});

	it("stores numeric signature fields on the entry", () => {
		const { gl } = makeMockGl();
		const cache = new WeakMap<Float32Array, DecimEntry>();
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
