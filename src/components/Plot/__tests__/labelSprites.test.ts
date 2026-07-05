import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LabelSpriteCache } from "../labelSprites";

// Records every fillText into the shared atlas so tests can assert how often
// labels were (re)rendered.
const atlasFillText = vi.fn();

function makeAtlasCtx() {
	return {
		setTransform: vi.fn(),
		clearRect: vi.fn(),
		fillText: atlasFillText,
		measureText: vi.fn((text: string) => ({
			width: text.length * 5,
			actualBoundingBoxAscent: 7,
			actualBoundingBoxDescent: 2,
		})),
		set font(_v: string) {},
		set fillStyle(_v: string) {},
		set textAlign(_v: string) {},
		set textBaseline(_v: string) {},
	} as unknown as CanvasRenderingContext2D;
}

function makeTargetCtx() {
	return {
		drawImage: vi.fn(),
		fillText: vi.fn(),
		measureText: vi.fn(() => ({ width: 99 })),
		set font(_v: string) {},
		set fillStyle(_v: string) {},
		set textAlign(_v: string) {},
		set textBaseline(_v: string) {},
	} as unknown as CanvasRenderingContext2D & {
		drawImage: ReturnType<typeof vi.fn>;
		fillText: ReturnType<typeof vi.fn>;
	};
}

describe("LabelSpriteCache", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
			() => makeAtlasCtx(),
		);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	it("renders a label once into the atlas and blits it afterwards", () => {
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		cache.draw(ctx, "42", "9px sans", "#000", 10, 20, "left", "alphabetic");
		cache.draw(ctx, "42", "9px sans", "#000", 30, 20, "left", "alphabetic");

		expect(atlasFillText).toHaveBeenCalledTimes(1);
		expect(atlasFillText).toHaveBeenCalledWith("42", 2, 2 + 7);
		expect(ctx.drawImage).toHaveBeenCalledTimes(2);
		expect(ctx.fillText).not.toHaveBeenCalled();
	});

	it("anchors like fillText for center/alphabetic and right/middle", () => {
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(2);
		// cssWidth = 30, ascent = 7, descent = 2, pad = 2
		// → source rect 68x26 device px at dpr 2, dest 34x13 CSS px.
		cache.draw(ctx, "abcdef", "9px sans", "#000", 100, 50, "center", "alphabetic");
		expect(ctx.drawImage).toHaveBeenLastCalledWith(
			expect.any(HTMLCanvasElement),
			0,
			0,
			68,
			26,
			100 - 2 - 15,
			50 - 7 - 2,
			34,
			13,
		);
		cache.draw(ctx, "abcdef", "9px sans", "#000", 100, 50, "right", "middle");
		expect(ctx.drawImage).toHaveBeenLastCalledWith(
			expect.any(HTMLCanvasElement),
			0,
			0,
			68,
			26,
			100 - 2 - 30,
			50 - 4.5 - 2,
			34,
			13,
		);
	});

	it("packs subsequent labels side by side in the atlas", () => {
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		cache.draw(ctx, "aa", "9px sans", "#000", 0, 0, "left", "alphabetic");
		cache.draw(ctx, "bb", "9px sans", "#000", 0, 0, "left", "alphabetic");
		// First label: width 10 + 2*2 pad = 14 device px → second starts at x=14.
		expect(ctx.drawImage).toHaveBeenLastCalledWith(
			expect.any(HTMLCanvasElement),
			14,
			0,
			14,
			13,
			expect.any(Number),
			expect.any(Number),
			14,
			13,
		);
	});

	it("resets the atlas when it runs out of space and re-renders on demand", () => {
		// Tiny atlas: fits exactly one 14x13 label per row and two rows.
		const cache = new LabelSpriteCache(16, 26);
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		cache.draw(ctx, "aa", "9px sans", "#000", 0, 0, "left", "alphabetic");
		cache.draw(ctx, "bb", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(2);

		// Third label overflows → atlas resets → renders at origin again.
		cache.draw(ctx, "cc", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(3);
		expect(ctx.drawImage).toHaveBeenLastCalledWith(
			expect.any(HTMLCanvasElement),
			0,
			0,
			14,
			13,
			expect.any(Number),
			expect.any(Number),
			14,
			13,
		);

		// Previously cached labels were dropped and re-render lazily.
		cache.draw(ctx, "aa", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(4);
	});

	it("measure returns the cached label width", () => {
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		expect(cache.measure(ctx, "abcd", "9px sans", "#000")).toBe(20);
		// Measuring and then drawing the same label reuses one entry.
		cache.draw(ctx, "abcd", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(1);
	});

	it("invalidates the atlas when the devicePixelRatio changes", () => {
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		cache.draw(ctx, "a", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(1);

		cache.beginFrame(2);
		cache.draw(ctx, "a", "9px sans", "#000", 0, 0, "left", "alphabetic");
		expect(atlasFillText).toHaveBeenCalledTimes(2);
	});

	it("falls back to fillText when the atlas has no 2D context", () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		const cache = new LabelSpriteCache();
		const ctx = makeTargetCtx();
		cache.beginFrame(1);
		cache.draw(ctx, "42", "9px sans", "#000", 10, 20, "center", "middle");
		expect(ctx.fillText).toHaveBeenCalledWith("42", 10, 20);
		expect(ctx.drawImage).not.toHaveBeenCalled();
		expect(cache.measure(ctx, "42", "9px sans", "#000")).toBe(99);
	});
});
