import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GlLabelAtlas } from "../labelAtlas";
import { makeGl2Mock } from "./glMock";

const fillText = vi.fn();

function makeFake2d() {
	return {
		measureText: vi.fn((text: string) => ({
			width: text.length * 5,
			actualBoundingBoxAscent: 7,
			actualBoundingBoxDescent: 2,
		})),
		fillText,
		clearRect: vi.fn(),
		scale: vi.fn(),
		setTransform: vi.fn(),
		set font(_v: string) {},
		set fillStyle(_v: string) {},
		set textAlign(_v: string) {},
		set textBaseline(_v: string) {},
	} as unknown as CanvasRenderingContext2D;
}

describe("GlLabelAtlas", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() => makeFake2d(),
		);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("rasterizes a label once and returns a cached region afterwards", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext & {
			texSubImage2D: ReturnType<typeof vi.fn>;
		};
		const atlas = new GlLabelAtlas(gl);
		atlas.setDpr(1);

		const r1 = atlas.ensure([{ text: "42", color: "#000" }], "9px sans");
		expect(r1).not.toBeNull();
		// width 10 + 2*2 pad = 14, height 9 + 4 = 13
		expect(r1?.wPx).toBe(14);
		expect(r1?.hPx).toBe(13);
		expect(r1?.cssWidth).toBe(10);
		expect(r1?.ascent).toBe(7);
		expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
		expect(fillText).toHaveBeenCalledWith("42", 2, 9);

		const r2 = atlas.ensure([{ text: "42", color: "#000" }], "9px sans");
		expect(r2).toBe(r1);
		expect(gl.texSubImage2D).toHaveBeenCalledTimes(1);
	});

	it("packs subsequent labels side by side and scales regions by dpr", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext;
		const atlas = new GlLabelAtlas(gl);
		atlas.setDpr(2);

		const a = atlas.ensure([{ text: "aa", color: "#000" }], "9px sans");
		const b = atlas.ensure([{ text: "bb", color: "#000" }], "9px sans");
		expect(a?.wPx).toBe(28); // (10 + 4) * dpr 2
		expect(a?.u0).toBe(0);
		expect(b?.u0).toBeCloseTo(28 / 2048);
		expect(b?.v0).toBe(0);
	});

	it("rasterizes multi-color composites as one region", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext;
		const atlas = new GlLabelAtlas(gl);
		atlas.setDpr(1);

		const r = atlas.ensure(
			[
				{ text: "S1", color: "red" },
				{ text: " / ", color: "#444" },
				{ text: "S2", color: "blue" },
			],
			"bold 12px sans",
		);
		expect(r?.cssWidth).toBe(2 * 5 + 3 * 5 + 2 * 5);
		expect(fillText).toHaveBeenCalledTimes(3);
		// Segments advance x by the previous segment widths (pad 2 start).
		expect(fillText.mock.calls.map((c) => c[1])).toEqual([2, 12, 27]);
	});

	it("re-rasterizes everything after a dpr change", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext & {
			texSubImage2D: ReturnType<typeof vi.fn>;
		};
		const atlas = new GlLabelAtlas(gl);
		atlas.setDpr(1);
		atlas.ensure([{ text: "a", color: "#000" }], "9px sans");
		atlas.setDpr(2);
		const r = atlas.ensure([{ text: "a", color: "#000" }], "9px sans");
		expect(gl.texSubImage2D).toHaveBeenCalledTimes(2);
		expect(r?.u0).toBe(0); // packing restarted at the origin
	});

	it("returns null for labels wider than the atlas", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext;
		const atlas = new GlLabelAtlas(gl);
		atlas.setDpr(1);
		const r = atlas.ensure(
			[{ text: "x".repeat(500), color: "#000" }],
			"9px sans",
		);
		expect(r).toBeNull();
	});

	it("falls back to null when no 2D context is available", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext;
		const atlas = new GlLabelAtlas(gl);
		expect(atlas.ensure([{ text: "a", color: "#000" }], "9px sans")).toBeNull();
	});

	it("releases its texture on dispose", () => {
		const gl = makeGl2Mock() as unknown as WebGL2RenderingContext & {
			deleteTexture: ReturnType<typeof vi.fn>;
		};
		const atlas = new GlLabelAtlas(gl);
		atlas.dispose();
		expect(gl.deleteTexture).toHaveBeenCalled();
		expect(atlas.texture).toBeNull();
	});
});
