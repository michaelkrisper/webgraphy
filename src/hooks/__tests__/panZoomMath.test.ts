import { describe, expect, it } from "vitest";
import {
	applyZoomBoxToAxes,
	applyZoomToRange,
	panRangeByPixels,
} from "../panZoomMath";

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

describe("panRangeByPixels", () => {
	it("leaves the range unchanged for a zero pixel delta", () => {
		expect(panRangeByPixels(0, 100, 0, 500)).toEqual({ min: 0, max: 100 });
	});

	it("preserves the range width while shifting both edges", () => {
		// span 500px, range 100 -> 1 world unit per 5px; +50px shift = +10 world
		const r = panRangeByPixels(0, 100, 50, 500);
		expect(r).toEqual({ min: 10, max: 110 });
		expect(r.max - r.min).toBe(100);
	});

	it("shifts in the opposite direction for a negative delta", () => {
		expect(panRangeByPixels(0, 100, -50, 500)).toEqual({ min: -10, max: 90 });
	});

	it("scales the world shift by the range size", () => {
		// wider range moves more world units for the same pixel delta
		expect(panRangeByPixels(0, 1000, 50, 500)).toEqual({ min: 100, max: 1100 });
	});

	it("supports non-zero range offsets", () => {
		expect(panRangeByPixels(200, 400, 25, 100)).toEqual({ min: 250, max: 450 });
	});
});

describe("applyZoomBoxToAxes", () => {
	const padding = { top: 0, right: 0, bottom: 0, left: 0 };
	const width = 100;
	const height = 100;
	const xAxis = { id: "X", min: 0, max: 100 };
	const yAxis = { id: "Y", min: 0, max: 100 };

	it("converts a screen box into per-axis ranges for X and Y by default", () => {
		const tx: Record<string, { min: number; max: number }> = {};
		const ty: Record<string, { min: number; max: number }> = {};
		applyZoomBoxToAxes(
			{ minX: 25, maxX: 75, minY: 25, maxY: 75 },
			[xAxis],
			[yAxis],
			width,
			height,
			padding,
			tx,
			ty,
			false,
		);
		expect(tx.X).toEqual({ min: 25, max: 75 });
		expect(ty.Y).toEqual({ min: 25, max: 75 });
	});

	it("skips Y axes when xOnly is true (shift-drag)", () => {
		const tx: Record<string, { min: number; max: number }> = {};
		const ty: Record<string, { min: number; max: number }> = {};
		applyZoomBoxToAxes(
			{ minX: 25, maxX: 75, minY: 25, maxY: 75 },
			[xAxis],
			[yAxis],
			width,
			height,
			padding,
			tx,
			ty,
			true,
		);
		expect(tx.X).toEqual({ min: 25, max: 75 });
		expect(ty.Y).toBeUndefined();
	});

	it("writes a target entry for every supplied axis", () => {
		const x2 = { id: "X2", min: 0, max: 1000 };
		const y2 = { id: "Y2", min: 0, max: 500 };
		const tx: Record<string, { min: number; max: number }> = {};
		const ty: Record<string, { min: number; max: number }> = {};
		applyZoomBoxToAxes(
			{ minX: 50, maxX: 50, minY: 50, maxY: 50 },
			[xAxis, x2],
			[yAxis, y2],
			width,
			height,
			padding,
			tx,
			ty,
			false,
		);
		expect(Object.keys(tx).sort()).toEqual(["X", "X2"]);
		expect(Object.keys(ty).sort()).toEqual(["Y", "Y2"]);
	});

	it("leaves Y targets untouched when no x-axes are supplied", () => {
		const tx: Record<string, { min: number; max: number }> = {};
		const ty: Record<string, { min: number; max: number }> = {};
		applyZoomBoxToAxes(
			{ minX: 25, maxX: 75, minY: 25, maxY: 75 },
			[],
			[yAxis],
			width,
			height,
			padding,
			tx,
			ty,
			false,
		);
		expect(ty.Y).toBeUndefined();
	});

	it("uses each axis' own min/max as the screen-to-world viewport", () => {
		const ax = { id: "A", min: 100, max: 200 };
		const tx: Record<string, { min: number; max: number }> = {};
		const ty: Record<string, { min: number; max: number }> = {};
		applyZoomBoxToAxes(
			{ minX: 25, maxX: 75, minY: 0, maxY: 0 },
			[ax],
			[],
			width,
			height,
			padding,
			tx,
			ty,
			false,
		);
		// box covers 25%..75% of the chart width -> 25% and 75% of [100,200] => [125,175]
		expect(tx.A.min).toBeCloseTo(125, 5);
		expect(tx.A.max).toBeCloseTo(175, 5);
	});
});
