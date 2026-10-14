import { afterEach, describe, expect, it, vi } from "vitest";
import {
	RendererCore,
	type RendererSeriesInput,
	type RenderLabel,
	sizeCanvasToViewport,
} from "../rendererCore";
import { makeCanvasMock, makeGl2Mock } from "./glMock";

function makeSeries(
	overrides: Partial<RendererSeriesInput> = {},
): RendererSeriesInput {
	return {
		id: "s1",
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
		const pointCalls = gl.drawArrays.mock.calls.filter((c) => c[0] === gl.POINTS);
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

	it("skips only the series whose column upload fails", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		// Call 1 is the overlay buffer, call 2 the first series' x column.
		let calls = 0;
		gl.createBuffer.mockImplementation(() => (++calls === 2 ? null : {}));
		core.setSeries([
			makeSeries({ id: "broken" }),
			makeSeries({
				id: "ok",
				xData: new Float32Array([0, 5, 10]),
				yData: new Float32Array([0, 1, 0]),
			}),
		]);
		core.drawFrame(axes, axes);

		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 2);
		expect(gl.disable).toHaveBeenCalledWith(gl.SCISSOR_TEST);
	});

	it("deletes column and decimation buffers when their series go away", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		let id = 0;
		gl.createBuffer.mockImplementation(() => ({ id: id++ }));
		// Dense enough (vs. a 180px plot) to go through M4 decimation.
		const n = 20_000;
		const big = makeSeries({
			xData: Float32Array.from({ length: n }, (_, i) => i),
			yData: Float32Array.from({ length: n }, (_, i) => Math.sin(i)),
		});
		const wide = [{ id: "axis-1", min: 0, max: n }];
		core.setSeries([big]);
		core.drawFrame(wide, wide);
		const created = gl.createBuffer.mock.results.map((r) => r.value);
		// overlay + 2 columns + at least one decimated x/y pair.
		expect(created.length).toBeGreaterThanOrEqual(5);
		expect(gl.deleteBuffer).not.toHaveBeenCalled();

		core.setSeries([]);
		const deleted = new Set(gl.deleteBuffer.mock.calls.map((c) => c[0]));
		// Everything but the overlay scratch buffer is freed.
		expect(deleted.size).toBe(created.length - 1);
		expect(deleted.has(created[0])).toBe(false);
	});

	it("keeps buffers of columns that stay referenced", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		const s = makeSeries();
		core.setSeries([s]);
		core.drawFrame(axes, axes);
		core.setSeries([{ ...s, lineColorRgba: [0, 0, 1] }]);
		expect(gl.deleteBuffer).not.toHaveBeenCalled();
	});

	it("rebuilds a dashed series when its id is re-pointed at another column", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		const a = makeSeries({ lineStyle: "dashed" });
		core.setSeries([a]);
		core.drawFrame(axes, axes);
		const dashUploads = () =>
			gl.bufferData.mock.calls.filter(
				(c) => c[1] instanceof Float32Array && c[1].length === 9 * 5,
			);
		expect(dashUploads()).toHaveLength(1);

		// Same id and shape, different y column — what removing a calculated
		// column does when it shifts the indices of the ones after it.
		const yB = new Float32Array([5, 5, 5, 5, 5, 5, 5, 5, 5, 5]);
		core.setSeries([{ ...a, yData: yB }]);
		core.drawFrame(axes, axes);
		const uploads = dashUploads();
		expect(uploads).toHaveLength(2);
		expect((uploads[1][1] as Float32Array)[1]).toBe(5);
	});

	it("frees a dashed series' instance buffer once the series is removed", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		let id = 0;
		gl.createBuffer.mockImplementation(() => ({ id: id++ }));
		core.setSeries([makeSeries({ lineStyle: "dashed" })]);
		core.drawFrame(axes, axes);
		// overlay, x column, y column, dash instances.
		const dashBuf = gl.createBuffer.mock.results[3].value;
		core.setSeries([]);
		expect(gl.deleteBuffer).toHaveBeenCalledWith(dashBuf);
	});

	it("decimates a gapped dense series per segment without bridging the gap", () => {
		const { gl, core } = makeCore();
		core.setViewport(viewport);
		const n = 20_000;
		const yData = Float32Array.from({ length: n }, (_, i) => Math.sin(i));
		yData[n / 2] = Number.NaN;
		core.setSeries([
			makeSeries({
				xData: Float32Array.from({ length: n }, (_, i) => i),
				yData,
			}),
		]);
		const wide = [{ id: "axis-1", min: 0, max: n }];
		core.drawFrame(wide, wide);

		const draws = gl.drawArraysInstanced.mock.calls;
		// One draw per side of the gap, each far below the raw sample count.
		expect(draws).toHaveLength(2);
		const total = draws.reduce((sum, c) => sum + (c[3] as number), 0);
		expect(total).toBeLessThan(n / 4);
	});

	it("releases GL resources on dispose", () => {
		const { gl, core } = makeCore();
		core.dispose();
		expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
		expect(gl.deleteShader).toHaveBeenCalledTimes(6);
	});

	it("restores onto a fresh context with its inputs and empty GPU caches", () => {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const lost = RendererCore.create(canvas)!;
		lost.setViewport(viewport);
		lost.setPlotBg([0.5, 0.25, 0]);
		lost.setSeries([makeSeries()]);
		lost.setHighlight("s1");
		lost.drawFrame(axes, axes);
		vi.clearAllMocks();

		const core = RendererCore.restore(canvas, lost);
		expect(core).not.toBeNull();
		expect(core).not.toBe(lost);
		// All three programs are rebuilt on the restored context.
		expect(gl.createProgram).toHaveBeenCalledTimes(3);

		core!.drawFrame(axes, axes);
		expect(gl.clearColor).toHaveBeenCalledWith(0.5, 0.25, 0, 1);
		// The old column buffers died with the context: both columns upload
		// again, even though the Float32Arrays are the same objects.
		const s = makeSeries();
		const columnUploads = gl.bufferData.mock.calls.filter(
			(c) =>
				c[1] instanceof Float32Array &&
				c[1].length === s.xData.length &&
				c[2] === gl.STATIC_DRAW,
		);
		expect(columnUploads).toHaveLength(2);
		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 9);
	});

	it("returns null from restore when the context cannot be re-acquired", () => {
		const { core } = makeCore();
		expect(RendererCore.restore(makeCanvasMock(null), core)).toBeNull();
	});

	it("uses the exact device-pixel size for the GL viewport when given", () => {
		const { gl, core } = makeCore();
		core.setViewport({
			...viewport,
			dpr: 1.25,
			pixelWidth: 251,
			pixelHeight: 124,
		});
		core.setSeries([]);
		core.drawFrame(axes, axes);
		// round(200 * 1.25) = 250, but the measured backing store is 251.
		expect(gl.viewport).toHaveBeenCalledWith(0, 0, 251, 124);
	});

	describe("label pass", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		const mockCanvas2d = () =>
			vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
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

		it("snaps label quads to whole device pixels and samples NEAREST", () => {
			mockCanvas2d();
			const { gl, core } = makeCore();
			core.setViewport({ ...viewport, dpr: 1.5 });
			core.setSeries([]);
			core.setLabels([
				{ ...labels[0], x: 10.3, y: 20.7 },
				{ ...labels[2], x: 5.4, y: 50.2 },
			]);
			core.drawFrame(axes, axes);

			const inst = gl.bufferData.mock.calls.at(-1)?.[1] as Float32Array;
			for (let l = 0; l < 2; l++) {
				for (let k = 0; k < 4; k++) {
					expect(Number.isInteger(inst[l * 11 + k])).toBe(true);
				}
			}
			expect(gl.texParameteri).toHaveBeenCalledWith(
				gl.TEXTURE_2D,
				gl.TEXTURE_MAG_FILTER,
				gl.NEAREST,
			);
			expect(gl.texParameteri).not.toHaveBeenCalledWith(
				gl.TEXTURE_2D,
				expect.anything(),
				gl.LINEAR,
			);
		});

		it("restarts the label pass when the atlas resets mid-frame", () => {
			mockCanvas2d();
			const { gl, core } = makeCore();
			core.setViewport(viewport);
			core.setSeries([]);
			// 400 chars * 5px + padding fills a 2048px atlas row by itself, and
			// 13px rows give 78 rows per atlas.
			const wide = (i: number): RenderLabel => ({
				text: `${String(i).padStart(3, "0")}${"x".repeat(397)}`,
				color: "#000000",
				font: "9px sans",
				x: 0,
				y: 0,
				align: "left",
				baseline: "alphabetic",
			});
			core.setLabels(Array.from({ length: 70 }, (_, i) => wide(i)));
			core.drawFrame(axes, axes);

			// 50 cached labels plus 20 new ones: the 9th new label overflows the
			// atlas, whose reset reuses rows the cached labels were handed.
			const frame2 = [
				...Array.from({ length: 50 }, (_, i) => wide(i)),
				...Array.from({ length: 20 }, (_, i) => wide(100 + i)),
			];
			core.setLabels(frame2);
			core.drawFrame(axes, axes);

			const inst = gl.bufferData.mock.calls.at(-1)?.[1] as Float32Array;
			expect(inst.length).toBe(frame2.length * 11);
			// v0 per label: no two labels may share an atlas row.
			const rows = new Set<number>();
			for (let i = 0; i < frame2.length; i++) rows.add(inst[i * 11 + 7]);
			expect(rows.size).toBe(frame2.length);
		});

		it("skips the label pass entirely when rasterization is unavailable", () => {
			vi
				.spyOn(HTMLCanvasElement.prototype, "getContext")
				.mockImplementation(function (this: HTMLCanvasElement, kind: string) {
					return kind === "2d" ? null : null;
				} as never);
			const { gl, core } = makeCore();
			core.setViewport(viewport);
			core.setSeries([]);
			core.setLabels(labels);
			core.drawFrame(axes, axes);
			expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
		});

		it("re-rasterizes labels into a new atlas after a context restore", () => {
			mockCanvas2d();
			const gl = makeGl2Mock();
			const canvas = makeCanvasMock(gl);
			const lost = RendererCore.create(canvas)!;
			lost.setViewport(viewport);
			lost.setSeries([]);
			lost.setLabels(labels);
			lost.drawFrame(axes, axes);
			vi.clearAllMocks();

			RendererCore.restore(canvas, lost)!.drawFrame(axes, axes);
			expect(gl.createTexture).toHaveBeenCalledTimes(1);
			expect(gl.texSubImage2D).toHaveBeenCalledTimes(3);
			expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 3);
		});

		it("re-rasterizes labels when the DPR changes", () => {
			mockCanvas2d();
			const { gl, core } = makeCore();
			core.setViewport(viewport);
			core.setSeries([]);
			core.setLabels(labels);
			core.drawFrame(axes, axes);
			expect(gl.texSubImage2D).toHaveBeenCalledTimes(3);

			core.setViewport({ ...viewport, dpr: 2 });
			core.drawFrame(axes, axes);
			expect(gl.texSubImage2D).toHaveBeenCalledTimes(6);
		});
	});
});

describe("sizeCanvasToViewport", () => {
	it("sizes from css * dpr, or from the exact device-pixel size", () => {
		const canvas = makeCanvasMock(null);
		sizeCanvasToViewport(canvas, { ...viewport, dpr: 1.5 });
		expect([canvas.width, canvas.height]).toEqual([300, 150]);
		sizeCanvasToViewport(canvas, {
			...viewport,
			dpr: 1.5,
			pixelWidth: 301,
			pixelHeight: 149,
		});
		expect([canvas.width, canvas.height]).toEqual([301, 149]);
		sizeCanvasToViewport(canvas, { ...viewport, width: 0, height: 0 });
		expect([canvas.width, canvas.height]).toEqual([1, 1]);
	});
});
