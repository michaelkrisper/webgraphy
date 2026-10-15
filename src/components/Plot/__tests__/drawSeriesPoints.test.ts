import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SeriesDrawBundle } from "../drawSeries";
import { drawSeriesLines, drawSeriesPoints } from "../drawSeries";
import type { GLStateCache } from "../GLStateCache";

type Fn = ReturnType<typeof vi.fn>;

function makeGl() {
	return {
		drawArrays: vi.fn(),
		drawArraysInstanced: vi.fn(),
		vertexAttribPointer: vi.fn(),
		bindBuffer: vi.fn(),
		bufferData: vi.fn(),
		bufferSubData: vi.fn(),
		deleteBuffer: vi.fn(),
		ARRAY_BUFFER: 34962,
		STREAM_DRAW: 35040,
		STATIC_DRAW: 35044,
		DYNAMIC_DRAW: 35048,
		TRIANGLES: 4,
		POINTS: 0,
		FLOAT: 5126,
		createBuffer: vi.fn(() => ({})),
	};
}

function makeState(gl: ReturnType<typeof makeGl>, withLineProgram = true) {
	return {
		gl,
		locs: { xLoc: 1, yLoc: 2, otherLoc: 3, tLoc: 4, distStartLoc: 5 },
		lineLocs: withLineProgram
			? { x0Loc: 0, y0Loc: 1, x1Loc: 2, y1Loc: 3, dist0Loc: 4 }
			: null,
		useMain: vi.fn(),
		useLine: vi.fn(),
		setColor: vi.fn(),
		setPointSize: vi.fn(),
		setStyle: vi.fn(),
		disableAttribConst2: vi.fn(),
		disableAttribConst1: vi.fn(),
		enableAttrib: vi.fn(),
		lpSetColor: vi.fn(),
		lpSetWidth: vi.fn(),
		lpSetDash: vi.fn(),
		lpSetXScaleOff: vi.fn(),
		lpSetYScaleOff: vi.fn(),
		lpSetLogRef: vi.fn(),
	};
}

function makeBundle(over: Record<string, unknown> = {}) {
	return {
		lineStyle: "none",
		pointStyle: "circle",
		lineColorRgba: [1, 0, 0, 1],
		pointColorRgba: [0, 0, 1, 1],
		plotBgRgba: [1, 1, 1, 1],
		isHighlighted: false,
		dpr: 1,
		chartWidth: 100,
		chartHeight: 100,
		xRange: 10,
		yRange: 10,
		xAxisMin: 0,
		xAxisMax: 10,
		xRef: 0,
		xScale: 1,
		xOff: 0,
		yScale: -1,
		yOff: 100,
		xData: new Float32Array([1, 2, 3]),
		yData: new Float32Array([1, 2, 3]),
		sliceStart: 0,
		sliceEnd: 2,
		isMonotonic: true,
		cachedSegments: [{ start: 0, end: 2 }],
		drawRanges: [{ start: 0, count: 3 }],
		xBuffer: { name: "x" },
		yBuffer: { name: "y" },
		...over,
	};
}

function dense(n: number) {
	const xData = Float32Array.from({ length: n }, (_, i) => i);
	const yData = Float32Array.from({ length: n }, (_, i) => Math.sin(i));
	return {
		xData,
		yData,
		xAxisMin: 0,
		xAxisMax: n - 1,
		xRange: n - 1,
		sliceStart: 0,
		sliceEnd: n - 1,
		cachedSegments: [{ start: 0, end: n - 1 }],
		drawRanges: [{ start: 0, count: n }],
	};
}

describe("drawSeriesPoints", () => {
	let gl: ReturnType<typeof makeGl>;
	let st: ReturnType<typeof makeState>;

	beforeEach(() => {
		gl = makeGl();
		st = makeState(gl);
	});

	const draw = (bundle: ReturnType<typeof makeBundle>, interacting = false) =>
		drawSeriesPoints(
			st as unknown as GLStateCache,
			bundle as unknown as SeriesDrawBundle,
			new WeakMap() as unknown as Parameters<typeof drawSeriesPoints>[2],
			{ x: new Float32Array(0), y: new Float32Array(0) },
			interacting,
		);

	it("does nothing for a series without markers", () => {
		draw(makeBundle({ pointStyle: "none" }));
		expect(st.useMain).not.toHaveBeenCalled();
		expect(gl.drawArrays).not.toHaveBeenCalled();
	});

	it("draws a background halo pass and then the coloured marker pass", () => {
		draw(makeBundle());
		expect(gl.drawArrays.mock.calls).toEqual([
			[0, 0, 3],
			[0, 0, 3],
		]);
		expect((st.setColor as Fn).mock.calls).toEqual([
			[1, 1, 1, 1],
			[0, 0, 1, 1],
		]);
		// Halo is 2px larger than the 6px marker.
		expect((st.setPointSize as Fn).mock.calls).toEqual([[8], [6]]);
	});

	it.each([
		["circle", 0],
		["square", 1],
		["cross", 2],
	])("selects the %s shader style", (pointStyle, code) => {
		draw(makeBundle({ pointStyle }));
		expect(st.setStyle).toHaveBeenCalledWith(code);
	});

	it("enlarges highlighted markers and scales by the device pixel ratio", () => {
		draw(makeBundle({ pointStyle: "cross", isHighlighted: true, dpr: 2 }));
		// Cross halo gets 3 CSS px extra instead of 2.
		expect((st.setPointSize as Fn).mock.calls).toEqual([[22], [16]]);
	});

	it("draws each gap-separated range and skips empty ones", () => {
		draw(
			makeBundle({
				drawRanges: [
					{ start: 0, count: 1 },
					{ start: 1, count: 0 },
					{ start: 2, count: 1 },
				],
			}),
		);
		expect(gl.drawArrays.mock.calls).toEqual([
			[0, 0, 1],
			[0, 2, 1],
			[0, 0, 1],
			[0, 2, 1],
		]);
	});

	it("decimates a dense series while interacting", () => {
		const n = 20_000;
		draw(makeBundle(dense(n)), true);
		const counts = gl.drawArrays.mock.calls.map((c) => c[2] as number);
		expect(counts).toHaveLength(2);
		expect(counts[0]).toBe(counts[1]);
		expect(counts[0]).toBeLessThan(n / 10);
		// Draws from the decimated buffers, not the raw column buffers.
		expect(gl.bindBuffer).not.toHaveBeenCalledWith(gl.ARRAY_BUFFER, {
			name: "x",
		});
	});

	it("draws every raw point once interaction settles", () => {
		const n = 20_000;
		draw(makeBundle(dense(n)), false);
		expect(gl.drawArrays.mock.calls).toEqual([
			[0, 0, n],
			[0, 0, n],
		]);
	});

	it("does not decimate a non-monotonic series", () => {
		const n = 20_000;
		draw(makeBundle({ ...dense(n), isMonotonic: false }), true);
		expect(gl.drawArrays.mock.calls[0]).toEqual([0, 0, n]);
	});
});

describe("drawSeriesLines guards", () => {
	const drawLines = (
		st: ReturnType<typeof makeState>,
		bundle: ReturnType<typeof makeBundle>,
	) =>
		drawSeriesLines(
			st as unknown as GLStateCache,
			bundle as unknown as SeriesDrawBundle,
			new WeakMap() as unknown as Parameters<typeof drawSeriesLines>[2],
			{ x: new Float32Array(0), y: new Float32Array(0) },
			new Map(),
			new Map(),
			"key",
		);

	it("skips lines entirely without a line program", () => {
		const gl = makeGl();
		const st = makeState(gl, false);
		drawLines(st, makeBundle({ lineStyle: "solid" }));
		expect(st.useLine).not.toHaveBeenCalled();
		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
	});

	it("draws no dashes when there is no segment to dash", () => {
		const gl = makeGl();
		const st = makeState(gl);
		drawLines(
			st,
			makeBundle({ lineStyle: "dashed", drawRanges: [{ start: 0, count: 1 }] }),
		);
		expect(gl.createBuffer).not.toHaveBeenCalled();
		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
	});

	it("gives up on dashes when the instance buffer cannot be created", () => {
		const gl = makeGl();
		gl.createBuffer.mockReturnValue(null as never);
		const st = makeState(gl);
		drawLines(st, makeBundle({ lineStyle: "dotted" }));
		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
	});
});
