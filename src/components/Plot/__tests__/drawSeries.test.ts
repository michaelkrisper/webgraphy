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

