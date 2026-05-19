import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeriesDrawBundle } from "../drawSeries";
import { drawSeriesLines } from "../drawSeries";
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
