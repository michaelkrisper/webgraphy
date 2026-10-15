import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayState } from "../drawOverlay";
import type { SceneContext } from "../frameScene";
import { acquireRenderBackend, releaseRenderBackend } from "../renderBackend";
import type { RendererSeriesInput } from "../rendererCore";
import { makeCanvasMock, makeGl2Mock, makeLoseContextExt } from "./glMock";

const viewport = {
	width: 200,
	height: 100,
	padding: { top: 10, right: 10, bottom: 10, left: 10 },
	dpr: 1,
};

function makeSeries(
	overrides: Partial<RendererSeriesInput> = {},
): RendererSeriesInput {
	return {
		id: "s1",
		xAxisId: "axis-1",
		yAxisId: "axis-1",
		hidden: false,
		xData: new Float32Array([0, 1, 2]),
		yData: new Float32Array([3, 4, 5]),
		xRef: 0,
		yRef: 0,
		lineColorRgba: [1, 0, 0],
		pointColorRgba: [0, 1, 0],
		lineStyle: "solid",
		pointStyle: "none",
		...overrides,
	};
}

class FakeWorker {
	static instances: FakeWorker[] = [];
	postMessage = vi.fn();
	terminate = vi.fn();
	onerror: unknown = null;
	constructor(
		public url: URL,
		public opts: unknown,
	) {
		FakeWorker.instances.push(this);
	}
}

function withOffscreen(canvas: HTMLCanvasElement): HTMLCanvasElement {
	const offscreen = { width: 0, height: 0 };
	(canvas as unknown as Record<string, unknown>).transferControlToOffscreen =
		vi.fn(() => offscreen);
	return canvas;
}

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
	FakeWorker.instances.length = 0;
});

describe("DirectBackend (no OffscreenCanvas support)", () => {
	it("renders on the main thread through a RendererCore", async () => {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		await vi.dynamicImportSettled();

		expect(canvas.getContext).toHaveBeenCalledWith(
			"webgl2",
			expect.objectContaining({ antialias: true }),
		);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(100);

		backend.setSeries([makeSeries()]);
		backend.redraw(
			[{ id: "axis-1", min: 0, max: 10 }],
			[{ id: "axis-1", min: 0, max: 10 }],
			false,
			null,
		);
		expect(gl.clear).toHaveBeenCalled();
		expect(gl.drawArraysInstanced).toHaveBeenCalled();

		releaseRenderBackend(canvas);
	});

	it("resizes the canvas on setViewport", async () => {
		const canvas = makeCanvasMock(makeGl2Mock());
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		await vi.dynamicImportSettled();
		backend.setViewport({ ...viewport, width: 300, dpr: 2 });
		expect(canvas.width).toBe(600);
		expect(canvas.height).toBe(200);
		releaseRenderBackend(canvas);
	});

	it("sizes the canvas from the exact device-pixel size when given", async () => {
		const canvas = makeCanvasMock(makeGl2Mock());
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		await vi.dynamicImportSettled();
		backend.setViewport({
			...viewport,
			dpr: 1.25,
			pixelWidth: 251,
			pixelHeight: 124,
		});
		expect([canvas.width, canvas.height]).toEqual([251, 124]);
		releaseRenderBackend(canvas);
	});

	it("pauses on context loss and redraws the last frame on restore", async () => {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const ext = makeLoseContextExt(canvas);
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		await vi.dynamicImportSettled();
		const xs = [{ id: "axis-1", min: 0, max: 10 }];
		backend.setSeries([makeSeries()]);
		backend.redraw(xs, xs, false, null);

		ext.loseContext();
		vi.clearAllMocks();
		// Inputs keep flowing while lost, but nothing reaches the dead context.
		const series = makeSeries({ id: "s2" });
		backend.setSeries([series]);
		backend.redraw(xs, xs, false, null);
		expect(gl.clear).not.toHaveBeenCalled();

		ext.restoreContext();
		// Programs rebuilt, the latest series' columns re-uploaded, and the
		// last frame drawn again without waiting for the host.
		expect(gl.createProgram).toHaveBeenCalledTimes(3);
		expect(gl.bufferData).toHaveBeenCalledWith(
			gl.ARRAY_BUFFER,
			series.xData,
			gl.STATIC_DRAW,
		);
		expect(gl.clear).toHaveBeenCalledTimes(1);
		expect(gl.drawArraysInstanced).toHaveBeenCalled();

		releaseRenderBackend(canvas);
	});

	it("cancels webglcontextlost so the browser will restore the context", async () => {
		const canvas = makeCanvasMock(makeGl2Mock());
		acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		await vi.dynamicImportSettled();
		const ev = new Event("webglcontextlost", { cancelable: true });
		canvas.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		releaseRenderBackend(canvas);
	});

	it("buffers the latest inputs until the renderer module has loaded", async () => {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		const xs = [{ id: "axis-1", min: 0, max: 10 }];
		backend.setViewport({ ...viewport, width: 300 });
		backend.setSeries([makeSeries()]);
		backend.redraw(xs, xs, false, null);
		// Sized right away so layout never sees a stale backing store.
		expect(canvas.width).toBe(300);
		expect(canvas.getContext).not.toHaveBeenCalled();

		await vi.dynamicImportSettled();
		expect(gl.clear).toHaveBeenCalledTimes(1);
		expect(gl.drawArraysInstanced).toHaveBeenCalled();
		releaseRenderBackend(canvas);
	});

	it("never builds a renderer for a backend disposed while loading", async () => {
		vi.useFakeTimers();
		const canvas = makeCanvasMock(makeGl2Mock());
		acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		releaseRenderBackend(canvas);
		vi.runAllTimers();
		vi.useRealTimers();
		await vi.dynamicImportSettled();
		expect(canvas.getContext).not.toHaveBeenCalled();
	});
});

describe("WorkerBackend protocol", () => {
	function makeWorkerBackend() {
		vi.stubGlobal("Worker", FakeWorker);
		const canvas = withOffscreen(makeCanvasMock(null));
		const backend = acquireRenderBackend(canvas, viewport, [0, 0, 0]);
		const worker = FakeWorker.instances[FakeWorker.instances.length - 1];
		return { backend, worker, canvas };
	}

	function messagesOf(worker: FakeWorker) {
		return worker.postMessage.mock.calls.map((c) => c[0]);
	}

	it("transfers the canvas and sends init", () => {
		const { worker, canvas } = makeWorkerBackend();
		const [init] = messagesOf(worker);
		expect(init.t).toBe("init");
		expect(init.viewport).toEqual(viewport);
		expect(init.plotBg).toEqual([0, 0, 0]);
		expect(
			(
				canvas as unknown as {
					transferControlToOffscreen: ReturnType<typeof vi.fn>;
				}
			).transferControlToOffscreen,
		).toHaveBeenCalledTimes(1);
		releaseRenderBackend(canvas);
	});

	it("sends column data only once per array identity", () => {
		const { backend, worker, canvas } = makeWorkerBackend();
		const s = makeSeries();

		backend.setSeries([s]);
		let seriesMsg = messagesOf(worker).at(-1);
		expect(seriesMsg.t).toBe("series");
		expect(seriesMsg.list[0].xData).toBe(s.xData);
		expect(seriesMsg.list[0].yData).toBe(s.yData);

		// Same arrays again: ids only, no payload.
		backend.setSeries([s]);
		seriesMsg = messagesOf(worker).at(-1);
		expect(seriesMsg.list[0].xData).toBeUndefined();
		expect(seriesMsg.list[0].yData).toBeUndefined();

		// After the columns were pruned (series removed), they are resent.
		backend.setSeries([]);
		backend.setSeries([s]);
		seriesMsg = messagesOf(worker).at(-1);
		expect(seriesMsg.list[0].xData).toBe(s.xData);
		releaseRenderBackend(canvas);
	});

	it("shares one payload when two series use the same column", () => {
		const { backend, worker, canvas } = makeWorkerBackend();
		const shared = new Float32Array([0, 1, 2]);
		const s1 = makeSeries({ id: "a", xData: shared });
		const s2 = makeSeries({ id: "b", xData: shared });

		backend.setSeries([s1, s2]);
		const seriesMsg = messagesOf(worker).at(-1);
		expect(seriesMsg.list[0].xData).toBe(shared);
		expect(seriesMsg.list[1].xData).toBeUndefined();
		expect(seriesMsg.list[0].xColId).toBe(seriesMsg.list[1].xColId);
		releaseRenderBackend(canvas);
	});

	it("bundles the pending overlay into the next frame message with slim axes", () => {
		const { backend, worker, canvas } = makeWorkerBackend();
		const ov: OverlayState = {
			packed: new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]),
			packedLen: 4,
			groups: [
				{ topology: "LINES", rgba: [0, 0, 0, 1], width: 1, offset: 0, count: 2 },
			],
		};
		backend.setOverlay(ov);
		backend.redraw(
			[{ id: "axis-1", min: 0, max: 10, name: "X", showGrid: true } as never],
			[{ id: "axis-1", min: -1, max: 1 }],
			true,
			"s1",
		);

		const frame = messagesOf(worker).at(-1);
		expect(frame.t).toBe("frame");
		expect(frame.interacting).toBe(true);
		expect(frame.highlight).toBe("s1");
		expect(frame.xAxes).toEqual([{ id: "axis-1", min: 0, max: 10 }]);
		expect(frame.overlay.packedLen).toBe(4);
		// Snapshot is truncated to packedLen, not the scratch capacity.
		expect(frame.overlay.packed.length).toBe(4);
		expect(Array.from(frame.overlay.packed)).toEqual([1, 2, 3, 4]);

		// Overlay is consumed: the next frame carries none.
		backend.redraw([], [], false, null);
		expect(messagesOf(worker).at(-1).overlay).toBeUndefined();
		releaseRenderBackend(canvas);
	});

	it("hands the scene context to the worker without a SharedArrayBuffer", () => {
		const { backend, worker, canvas } = makeWorkerBackend();
		// jsdom is not crossOriginIsolated, so this is the postMessage path.
		expect(backend.sceneShared()).toBe(false);

		const ctx = {
			xAxesMeta: [{ id: "axis-1" }],
			yAxesMeta: [{ id: "axis-1" }],
		} as unknown as SceneContext;
		backend.setSceneContext(ctx);

		const sent = messagesOf(worker).at(-1);
		expect(sent.t).toBe("sceneCtx");
		expect(sent.ctx).toBe(ctx);
		expect(sent.version).toBe(1);
		// With a context in the worker, the host stops building the scene.
		expect(backend.sceneShared()).toBe(true);

		backend.redraw([{ id: "axis-1", min: 0, max: 10 }], [], false, null);
		const frame = messagesOf(worker).at(-1);
		expect(frame.t).toBe("frame");
		expect(frame.overlay).toBeUndefined();
		expect(frame.labels).toBeUndefined();
		releaseRenderBackend(canvas);
	});
});

describe("acquire/release lifecycle (StrictMode safety)", () => {
	it("reuses the backend when the same canvas re-acquires before disposal", () => {
		vi.useFakeTimers();
		vi.stubGlobal("Worker", FakeWorker);
		const canvas = withOffscreen(makeCanvasMock(null));

		const b1 = acquireRenderBackend(canvas, viewport, [0, 0, 0]);
		releaseRenderBackend(canvas);
		const b2 = acquireRenderBackend(canvas, viewport, [0, 0, 0]);

		expect(b2).toBe(b1);
		expect(FakeWorker.instances).toHaveLength(1);

		vi.runAllTimers();
		expect(FakeWorker.instances[0].terminate).not.toHaveBeenCalled();
		releaseRenderBackend(canvas);
		vi.runAllTimers();
		expect(FakeWorker.instances[0].terminate).toHaveBeenCalledTimes(1);
	});
});
