import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RendererCore,
	type RendererSeriesInput,
	type RenderLabel,
} from "../rendererCore";
import { makeCanvasMock, makeGl2Mock } from "./glMock";

function makeSeries(
	overrides: Partial<RendererSeriesInput> = {},
): RendererSeriesInput {
	return {
		id: "s1",
		segKey: "seg-ds1-0-1-dyn",
		xAxisId: "axis-1",
		yAxisId: "axis-1",
		hidden: false,
		xData: new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
		yData: new Float32Array([0, 1, 0, 1, 0, 1, 0, 1, 0, 1]),
		xRef: 0,
		yRef: 0,
		lineColorRgba: [1, 0, 0],
		pointColorRgba: [0, 1, 0],
		lineStyle: "solid",
		pointStyle: "none",
		...overrides,
	};
}

const viewport = {
	width: 200,
	height: 100,
	padding: { top: 10, right: 10, bottom: 10, left: 10 },
	dpr: 1,
};

const axes = [{ id: "axis-1", min: 0, max: 10 }];

function makeCore() {
	const gl = makeGl2Mock();
	const core = RendererCore.create(makeCanvasMock(gl));
	expect(core).not.toBeNull();
	return { gl, core: core! };
}

describe("RendererCore", () => {
	it("returns null when WebGL2 is unavailable", () => {
		expect(RendererCore.create(makeCanvasMock(null))).toBeNull();
	});

	it("compiles both programs on creation", () => {
		const { gl } = makeCore();
		// main + line + label program: 3 programs, 6 shaders.
		expect(gl.createProgram).toHaveBeenCalledTimes(3);
		expect(gl.createShader).toHaveBeenCalledTimes(6);
		expect(gl.linkProgram).toHaveBeenCalledTimes(3);
	});

	it("clears and draws a solid series as instanced triangles", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		core.setPlotBg([1, 1, 1]);
		core.setSeries([makeSeries()]);
		core.drawFrame(axes, axes);

		expect(gl.clear).toHaveBeenCalled();
		// 10 points -> 9 segment instances, 6 verts each.
		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 9);
		// No point markers requested.
		expect(gl.drawArrays).not.toHaveBeenCalledWith(
			gl.POINTS,
			expect.anything(),
			expect.anything(),
		);
	});

	it("draws point markers with a halo pass when pointStyle is set", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		core.setSeries([makeSeries({ pointStyle: "circle", lineStyle: "none" })]);
		core.drawFrame(axes, axes);

		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
		// Halo + foreground pass over the single visible range.
		const pointCalls = gl.drawArrays.mock.calls.filter(
			(c) => c[0] === gl.POINTS,
		);
		expect(pointCalls).toHaveLength(2);
		expect(pointCalls[0]).toEqual([gl.POINTS, 0, 10]);
	});

	it("skips hidden series entirely", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		core.setSeries([makeSeries({ hidden: true, pointStyle: "circle" })]);
		core.drawFrame(axes, axes);

		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
		expect(gl.drawArrays).not.toHaveBeenCalled();
	});

	it("skips series bound to unknown axes", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		core.setSeries([makeSeries({ yAxisId: "axis-9" })]);
		core.drawFrame(axes, axes);
		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
	});

	it("does nothing when the chart area is degenerate", () => {
		const { gl, core } = makeCore();
		core.setViewport({ ...viewport, width: 10 }); // padding eats everything
		core.setSeries([makeSeries()]);
		core.drawFrame(axes, axes);
		expect(gl.clear).not.toHaveBeenCalled();
	});

	it("uploads and draws overlay groups", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		core.setSeries([]);
		const packed = new Float32Array([0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 0, 10]);
		core.setOverlay(packed, 12, [
			{
				topology: "TRIANGLES",
				rgba: [1, 1, 1, 1],
				width: 1,
				offset: 0,
				count: 6,
			},
		]);
		core.drawFrame(axes, axes);
		expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);
	});

	it("caches column GPU buffers by array identity across frames", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		const s = makeSeries();
		core.setSeries([s]);
		core.drawFrame(axes, axes);
		const uploads = gl.bufferData.mock.calls.length;
		core.drawFrame(axes, axes);
		// Second frame re-uses the uploaded column buffers.
		expect(gl.bufferData.mock.calls.length).toBe(uploads);
	});

	it("releases GL resources on dispose", () => {
		const { gl, core } = makeCore();
		core.dispose();
		expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
		expect(gl.deleteShader).toHaveBeenCalledTimes(6);
	});

	describe("label pass", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		const mockCanvas2d = () =>
			vi
				.spyOn(HTMLCanvasElement.prototype, "getContext")
				.mockImplementation(
					() =>
						({
							measureText: vi.fn((text: string) => ({
								width: text.length * 5,
								actualBoundingBoxAscent: 7,
								actualBoundingBoxDescent: 2,
							})),
							fillText: vi.fn(),
							clearRect: vi.fn(),
							scale: vi.fn(),
							setTransform: vi.fn(),
							set font(_v: string) {},
							set fillStyle(_v: string) {},
							set textAlign(_v: string) {},
							set textBaseline(_v: string) {},
						}) as unknown as CanvasRenderingContext2D,
				);

		const labels: RenderLabel[] = [
			{
				text: "42",
				color: "#000000",
				font: "9px sans",
				x: 10,
				y: 20,
				align: "center",
				baseline: "alphabetic",
			},
			{
				text: "Jan 2025",
				color: "#111111",
				font: "bold 10px sans",
				x: 30,
				y: 40,
				align: "left",
				baseline: "alphabetic",
				bg: "#222222",
				tick: { x: 28, color: "#111111" },
			},
			{
				text: "",
				color: "#000000",
				font: "bold 12px sans",
				x: 5,
				y: 50,
				align: "center",
				baseline: "middle",
				rot: -1,
				segments: [{ text: "S1", color: "red" }],
			},
		];

		it("uploads each unique label once and draws all as instanced quads", () => {
			mockCanvas2d();
			const { gl, core } = makeCore();
			core.setViewport(viewport);
			core.setSeries([]);
			core.setLabels(labels);
			core.drawFrame(axes, axes);

			expect(gl.texSubImage2D).toHaveBeenCalledTimes(3);
			expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 3);
			// Chrome: bg quad and separator quad in two color groups.
			expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);
			expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 6, 6);

			// Second frame: atlas regions are cached, no re-upload.
			core.drawFrame(axes, axes);
			expect(gl.texSubImage2D).toHaveBeenCalledTimes(3);
		});

		it("skips the label pass entirely when rasterization is unavailable", () => {
			vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
				function (this: HTMLCanvasElement, kind: string) {
					return kind === "2d" ? null : null;
				} as never,
			);
			const { gl, core } = makeCore();
			core.setViewport(viewport);
			core.setSeries([]);
			core.setLabels(labels);
			core.drawFrame(axes, axes);
			expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
		});
	});
});
