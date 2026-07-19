import { afterEach, describe, expect, it, vi } from "vitest";
import type { OverlayState } from "../drawOverlay";
import { acquireRenderBackend, releaseRenderBackend } from "../renderBackend";
import type { RendererSeriesInput } from "../rendererCore";
import { makeCanvasMock, makeGl2Mock } from "./glMock";

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
		segKey: "seg-ds1-0-1-dyn",
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
	it("renders on the main thread through a RendererCore", () => {
		const gl = makeGl2Mock();
		const canvas = makeCanvasMock(gl);
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);

		expect(canvas.getContext).toHaveBeenCalledWith(
			"webgl2",
			expect.objectContaining({ antialias: true }),
		);
		expect(canvas.width).toBe(200);
		expect(canvas.height).toBe(100);

		backend.setSeries([makeSeries()]);
		backend.redraw([{ id: "axis-1", min: 0, max: 10 }], [
			{ id: "axis-1", min: 0, max: 10 },
		], false, null);
		expect(gl.clear).toHaveBeenCalled();
		expect(gl.drawArraysInstanced).toHaveBeenCalled();

		releaseRenderBackend(canvas);
	});

	it("resizes the canvas on setViewport", () => {
		const canvas = makeCanvasMock(makeGl2Mock());
		const backend = acquireRenderBackend(canvas, viewport, [1, 1, 1]);
		backend.setViewport({ ...viewport, width: 300, dpr: 2 });
		expect(canvas.width).toBe(600);
		expect(canvas.height).toBe(200);
		releaseRenderBackend(canvas);
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
			(canvas as unknown as { transferControlToOffscreen: ReturnType<typeof vi.fn> })
				.transferControlToOffscreen,
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
