import { describe, expect, it } from "vitest";
import { applyZoomToRange } from "../panZoomMath";

describe("applyZoomToRange", () => {
	it("keeps the range unchanged at zoom factor 1", () => {
		// pivot at the centre (weight 0.5) of [0, 100]
		expect(applyZoomToRange(50, 0, 100, 0.5, 1)).toEqual({ min: 0, max: 100 });
	});

	it("zooms in (factor < 1) around the centre pivot", () => {
		// range 100 -> 90, pivot 50 stays centred
		expect(applyZoomToRange(50, 0, 100, 0.5, 0.9)).toEqual({
			min: 5,
			max: 95,
		});
	});

	it("zooms out (factor > 1) around the centre pivot", () => {
		const r = applyZoomToRange(50, 0, 100, 0.5, 1.1);
		expect(r.min).toBeCloseTo(-5, 10);
		expect(r.max).toBeCloseTo(105, 10);
	});

	it("anchors the left edge when weight is 0", () => {
		// pivot is the range start; min stays, max moves
		const r = applyZoomToRange(0, 0, 100, 0, 0.5);
		expect(r.min).toBe(0);
		expect(r.max).toBe(50);
	});

	it("anchors the right edge when weight is 1", () => {
		// pivot is the range end; max stays, min moves
		const r = applyZoomToRange(100, 0, 100, 1, 0.5);
		expect(r.min).toBe(50);
		expect(r.max).toBe(100);
	});

	it("keeps the pivot fixed in world space regardless of zoom", () => {
		// pivot at weight 0.25 of [10, 30] => world 15
		const pivot = 15;
		const weight = 0.25;
		const zoomedIn = applyZoomToRange(pivot, 10, 30, weight, 0.5);
		// pivot must sit at the same fractional position after zoom
		const fracIn = (pivot - zoomedIn.min) / (zoomedIn.max - zoomedIn.min);
		expect(fracIn).toBeCloseTo(weight, 10);

		const zoomedOut = applyZoomToRange(pivot, 10, 30, weight, 2);
		const fracOut = (pivot - zoomedOut.min) / (zoomedOut.max - zoomedOut.min);
		expect(fracOut).toBeCloseTo(weight, 10);
	});

	it("supports non-zero range offsets", () => {
		// [200, 400], centre pivot 300, zoom out 2x -> [100, 500]
		expect(applyZoomToRange(300, 200, 400, 0.5, 2)).toEqual({
			min: 100,
			max: 500,
		});
	});
});
