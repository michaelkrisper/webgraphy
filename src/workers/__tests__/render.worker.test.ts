/**
 * Drives the render worker's message handler directly: importing the module
 * registers `self.onmessage` (self === window under jsdom), and each test
 * feeds it protocol messages with a mocked WebGL2 OffscreenCanvas.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	makeCanvasMock,
	makeGl2Mock,
} from "../../components/Plot/__tests__/glMock";
import type { SceneContext } from "../../components/Plot/frameScene";
import {
	VIEWPORT_SAB_BYTES,
	ViewportWriter,
} from "../../components/Plot/viewportChannel";
import type { RenderWorkerRequest } from "../render.worker";
import "../render.worker";

function send(data: RenderWorkerRequest) {
	const handler = window.onmessage as unknown as (ev: MessageEvent) => void;
	expect(typeof handler).toBe("function");
	handler(new MessageEvent("message", { data }));
}

function nextFrame(): Promise<void> {
	return new Promise((resolve) => {
		requestAnimationFrame(() => resolve());
	});
}

const viewport = {
	width: 200,
	height: 100,
	padding: { top: 10, right: 10, bottom: 10, left: 10 },
	dpr: 1,
};

const axes = [{ id: "axis-1", min: 0, max: 10 }];

function initWorker() {
	const gl = makeGl2Mock();
	const canvas = makeCanvasMock(gl);
	send({
		t: "init",
		canvas: canvas as unknown as OffscreenCanvas,
		viewport,
		plotBg: [1, 1, 1],
	});
	// Start every test from an empty series/column state.
	send({ t: "series", list: [] });
	return { gl, canvas };
}

function seriesMsg(
	xColId: number,
	yColId: number,
	withData: boolean,
	overrides: Record<string, unknown> = {},
) {
	return {
		id: "s1",
		segKey: "seg-ds1-0-1-dyn",
		xAxisId: "axis-1",
		yAxisId: "axis-1",
		hidden: false,
		xColId,
		yColId,
		xData: withData
			? new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
			: undefined,
		yData: withData
			? new Float32Array([0, 1, 0, 1, 0, 1, 0, 1, 0, 1])
			: undefined,
		xRef: 0,
		yRef: 0,
		lineColorRgba: [1, 0, 0],
		pointColorRgba: [0, 1, 0],
		lineStyle: "solid" as const,
		pointStyle: "none" as const,
		...overrides,
	};
}

describe("render.worker", () => {
	beforeEach(() => {
		vi.restoreAllMocks();
	});

	it("initializes, sizes the canvas, and draws a coalesced frame", async () => {
		const { gl, canvas } = initWorker();
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(100);

		send({ t: "series", list: [seriesMsg(101, 102, true)] });
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		// A second frame before the rAF tick must coalesce into one draw.
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();

		expect(gl.clear).toHaveBeenCalledTimes(1);
		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 9);
	});

	it("caches columns by id and redraws series sent without payload", async () => {
		const { gl } = initWorker();
		send({ t: "series", list: [seriesMsg(201, 202, true)] });
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();
		gl.drawArraysInstanced.mockClear();

		// Same columns referenced by id only.
		send({ t: "series", list: [seriesMsg(201, 202, false)] });
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();
		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 9);
	});

	it("prunes columns no longer referenced and skips unresolvable series", async () => {
		const { gl } = initWorker();
		send({ t: "series", list: [seriesMsg(301, 302, true)] });
		// Empty series message prunes the cached columns...
		send({ t: "series", list: [] });
		// ...so an id-only reference cannot be resolved and is skipped.
		send({ t: "series", list: [seriesMsg(301, 302, false)] });
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();

		expect(gl.clear).toHaveBeenCalled();
		expect(gl.drawArraysInstanced).not.toHaveBeenCalled();
	});

	it("applies overlay geometry carried by a frame message", async () => {
		const { gl } = initWorker();
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
			overlay: {
				packed: new Float32Array([0, 0, 10, 0, 10, 10, 0, 0, 10, 10, 0, 10]),
				packedLen: 12,
				groups: [
					{
						topology: "TRIANGLES",
						rgba: [1, 1, 1, 1],
						width: 1,
						offset: 0,
						count: 6,
					},
				],
			},
		});
		await nextFrame();
		expect(gl.drawArrays).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6);
	});

	it("resizes and redraws on viewport messages", async () => {
		const { gl, canvas } = initWorker();
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();
		gl.clear.mockClear();

		send({ t: "viewport", viewport: { ...viewport, width: 400, dpr: 2 } });
		expect(canvas.width).toBe(800);
		expect(canvas.height).toBe(200);
		await nextFrame();
		expect(gl.clear).toHaveBeenCalledTimes(1);
	});

	it("tears down on dispose", () => {
		const { gl } = initWorker();
		const closeSpy = vi
			.spyOn(window, "close")
			.mockImplementation(() => undefined);
		send({ t: "dispose" });
		expect(gl.deleteProgram).toHaveBeenCalledTimes(3);
		expect(closeSpy).toHaveBeenCalled();
	});

	it("redraws on plotBg and highlight messages", async () => {
		const { gl } = initWorker();
		send({
			t: "frame",
			xAxes: axes,
			yAxes: axes,
			interacting: false,
			highlight: null,
		});
		await nextFrame();

		gl.clear.mockClear();
		send({ t: "plotBg", rgb: [0, 0, 0] });
		await nextFrame();
		expect(gl.clear).toHaveBeenCalledTimes(1);

		gl.clear.mockClear();
		send({ t: "highlight", id: "s1" });
		await nextFrame();
		// highlight alone does not queue a frame draw; it only marks the shared
		// scene dirty for the SAB loop.
		expect(gl.clear).not.toHaveBeenCalled();
	});
});

/**
 * When the page is crossOriginIsolated the host hands the worker a
 * SharedArrayBuffer and stops sending per-frame messages entirely: the worker
 * polls the viewport itself and derives the whole scene. That path never runs
 * in the message-driven tests above, so it is driven explicitly here.
 */
describe("render.worker — SharedArrayBuffer viewport path", () => {
	const sceneCtx: SceneContext = {
		width: 200,
		height: 100,
		padding: { top: 10, right: 10, bottom: 10, left: 10 },
		axisLayout: { "axis-1": { total: 40, label: 30 } },
		xAxesMetrics: [
			{
				id: "axis-1",
				height: 50,
				labelBottom: 10,
				secLabelBottom: 25,
				titleBottom: 40,
				cumulativeOffset: 0,
			},
		],
		leftOffsets: {},
		rightOffsets: {},
		axisColor: "#3a3a35",
		zeroLineColor: "#a09c93",
		gridColor: "#ececea",
		plotBg: "#ffffff",
		labelColor: "#6b6760",
		secLabelBg: "rgba(255,255,255,0.93)",
		fontFamily: "sans-serif",
		seriesByXAxisId: {},
		seriesByYAxisId: {
			"axis-1": [{ name: "Temp", yColumn: "t", lineColor: "#4589ff" }],
		},
		xAxesMeta: [
			{
				id: "axis-1",
				name: "",
				showGrid: true,
				xMode: "numeric",
				columnNames: ["Time"],
			},
		],
		yAxesMeta: [
			{
				id: "axis-1",
				name: "Axis 1",
				color: "#475569",
				position: "left",
				showGrid: true,
			},
		],
	};

	function initShared() {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const sab = new ArrayBuffer(VIEWPORT_SAB_BYTES);
		send({
			t: "init",
			canvas: canvas as unknown as OffscreenCanvas,
			viewport,
			plotBg: [1, 1, 1],
			// ViewportReader accepts a plain ArrayBuffer, which keeps the test
			// independent of crossOriginIsolated / COOP+COEP headers.
			viewportSab: sab as unknown as SharedArrayBuffer,
		});
		send({ t: "series", list: [] });
		return { gl, canvas, writer: new ViewportWriter(sab) };
	}

	it("draws a frame from the shared viewport once the scene version matches", async () => {
		const { gl, writer } = initShared();
		send({ t: "sceneCtx", ctx: sceneCtx, version: 7 });

		writer.write(7, true, [{ min: 0, max: 10 }], [{ min: 0, max: 50 }]);
		send({ t: "wake" });
		await nextFrame();
		await nextFrame();

		expect(gl.clear).toHaveBeenCalled();
	});

	it("ignores snapshots whose version does not match the current scene", async () => {
		const { gl, writer } = initShared();
		send({ t: "sceneCtx", ctx: sceneCtx, version: 7 });
		await nextFrame();
		await nextFrame();
		gl.clear.mockClear();

		// Host published a viewport for a scene the worker has not received
		// yet. Drawing it would mix new ranges with stale axis metadata.
		writer.write(99, false, [{ min: 0, max: 10 }], [{ min: 0, max: 50 }]);
		send({ t: "wake" });
		await nextFrame();
		await nextFrame();

		expect(gl.clear).not.toHaveBeenCalled();
	});

	it("clamps the axis count to the scene metadata", async () => {
		const { gl, writer } = initShared();
		send({ t: "sceneCtx", ctx: sceneCtx, version: 3 });

		// Four axes published, but the scene only knows about one of each. The
		// extra slots must be dropped rather than read past the metadata array.
		writer.write(
			3,
			false,
			[
				{ min: 0, max: 10 },
				{ min: 10, max: 20 },
			],
			[
				{ min: 0, max: 5 },
				{ min: 5, max: 9 },
			],
		);
		send({ t: "wake" });
		await nextFrame();
		await nextFrame();

		expect(gl.clear).toHaveBeenCalled();
	});

	it("keeps redrawing as the host publishes new viewports", async () => {
		const { gl, writer } = initShared();
		send({ t: "sceneCtx", ctx: sceneCtx, version: 11 });
		send({ t: "wake" });

		// Each published snapshot must produce its own draw — this is the pan
		// path, where the host writes once per frame and sends nothing else.
		for (let i = 0; i < 3; i++) {
			gl.clear.mockClear();
			writer.write(
				11,
				true,
				[{ min: i, max: 10 + i }],
				[{ min: 0, max: 50 }],
			);
			await nextFrame();
			await nextFrame();
			expect(gl.clear).toHaveBeenCalled();
		}

		// A tick with no new snapshot must not redraw.
		gl.clear.mockClear();
		await nextFrame();
		await nextFrame();
		expect(gl.clear).not.toHaveBeenCalled();
	});
});
