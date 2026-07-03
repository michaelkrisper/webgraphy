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
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
		// A second frame before the rAF tick must coalesce into one draw.
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
		await nextFrame();

		expect(gl.clear).toHaveBeenCalledTimes(1);
		expect(gl.drawArraysInstanced).toHaveBeenCalledWith(gl.TRIANGLES, 0, 6, 9);
	});

	it("caches columns by id and redraws series sent without payload", async () => {
		const { gl } = initWorker();
		send({ t: "series", list: [seriesMsg(201, 202, true)] });
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
		await nextFrame();
		gl.drawArraysInstanced.mockClear();

		// Same columns referenced by id only.
		send({ t: "series", list: [seriesMsg(201, 202, false)] });
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
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
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
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
		send({ t: "frame", xAxes: axes, yAxes: axes, interacting: false, highlight: null });
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
		expect(gl.deleteProgram).toHaveBeenCalledTimes(2);
		expect(closeSpy).toHaveBeenCalled();
	});
});
