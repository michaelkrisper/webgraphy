import { describe, expect, it } from "vitest";
import { sizeCanvasToViewport } from "../canvasSize";
import type { RendererViewport } from "../rendererCore";

/** Canvas stand-in that counts assignments: each one reallocates the buffer. */
function fakeCanvas(width = 0, height = 0) {
	let w = width;
	let h = height;
	const writes = { width: 0, height: 0 };
	const canvas = {
		get width() {
			return w;
		},
		set width(v: number) {
			writes.width++;
			w = v;
		},
		get height() {
			return h;
		},
		set height(v: number) {
			writes.height++;
			h = v;
		},
	};
	return { canvas: canvas as unknown as HTMLCanvasElement, writes };
}

const vp = (v: Partial<RendererViewport>) =>
	({ width: 100, height: 50, dpr: 1, ...v }) as RendererViewport;

describe("sizeCanvasToViewport", () => {
	it("scales the CSS size by the device pixel ratio", () => {
		const { canvas } = fakeCanvas();
		sizeCanvasToViewport(canvas, vp({ width: 101, height: 33, dpr: 1.5 }));
		expect([canvas.width, canvas.height]).toEqual([152, 50]);
	});

	it("prefers exact device-pixel sizes when given", () => {
		const { canvas } = fakeCanvas();
		sizeCanvasToViewport(
			canvas,
			vp({ dpr: 1.5, pixelWidth: 151, pixelHeight: 74 }),
		);
		expect([canvas.width, canvas.height]).toEqual([151, 74]);
	});

	it("never sizes below one pixel", () => {
		const { canvas } = fakeCanvas(5, 5);
		sizeCanvasToViewport(canvas, vp({ width: 0, height: 0, pixelWidth: 0 }));
		expect([canvas.width, canvas.height]).toEqual([1, 1]);
	});

	it("does not touch an already correctly sized canvas", () => {
		const { canvas, writes } = fakeCanvas(200, 100);
		sizeCanvasToViewport(canvas, vp({ dpr: 2 }));
		expect(writes).toEqual({ width: 0, height: 0 });
	});
});
