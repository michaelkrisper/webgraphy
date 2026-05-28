import { describe, expect, it } from "vitest";
import {
	DEFAULT_GUTTER_TOTAL,
	computeAxisOffsets,
	gutterTotal,
	measureYAxisGutter,
	sumGutterTotals,
} from "../axisGutters";

const layout = {
	A: { total: 50 },
	B: { total: 30 },
	C: { total: 64 },
};

describe("gutterTotal", () => {
	it("returns the configured total", () => {
		expect(gutterTotal(layout, "A")).toBe(50);
	});

	it("falls back to the default when the axis is missing", () => {
		expect(gutterTotal(layout, "missing")).toBe(DEFAULT_GUTTER_TOTAL);
	});

	it("falls back to the default when total is zero/falsy", () => {
		expect(gutterTotal({ Z: { total: 0 } }, "Z")).toBe(DEFAULT_GUTTER_TOTAL);
	});
});

describe("computeAxisOffsets", () => {
	it("returns an empty map for no axes", () => {
		expect(computeAxisOffsets([], layout)).toEqual({});
	});

	it("places the first axis flush (offset 0) and stacks the rest outward", () => {
		expect(computeAxisOffsets([{ id: "A" }, { id: "B" }, { id: "C" }], layout)).toEqual(
			{ A: 0, B: 50, C: 80 },
		);
	});

	it("uses the default width for axes missing from the layout", () => {
		expect(computeAxisOffsets([{ id: "A" }, { id: "missing" }], layout)).toEqual({
			A: 0,
			missing: 50,
		});
	});
});

describe("sumGutterTotals", () => {
	it("returns 0 for no axes", () => {
		expect(sumGutterTotals([], layout)).toBe(0);
	});

	it("sums the configured gutter widths", () => {
		expect(sumGutterTotals([{ id: "A" }, { id: "B" }], layout)).toBe(80);
	});

	it("includes the default for missing axes", () => {
		expect(sumGutterTotals([{ id: "A" }, { id: "missing" }], layout)).toBe(
			50 + DEFAULT_GUTTER_TOTAL,
		);
	});
});

describe("measureYAxisGutter", () => {
	it("sizes a categorical gutter from the widest category label", () => {
		// widest is "Charlie" (7 chars) -> labelWidth = 7*6 = 42, total = 66
		const r = measureYAxisGutter(
			{ min: 0, max: 2 },
			500,
			["A", "Bee", "Charlie"],
		);
		expect(r).toEqual({ label: 42, total: 66 });
	});

	it("treats empty/undefined category labels as 1 char wide", () => {
		const r = measureYAxisGutter({ min: 0, max: 0 }, 500, []);
		expect(r).toEqual({ label: 6, total: 30 });
	});

	it("caps the categorical label width at 100px", () => {
		const r = measureYAxisGutter({ min: 0, max: 1 }, 500, [
			"a".repeat(50),
		]);
		expect(r).toEqual({ label: 100, total: 124 });
	});

	it("sizes a numeric gutter from the formatted range endpoints", () => {
		const r = measureYAxisGutter({ min: 0, max: 100 }, 500, undefined);
		// integer ticks at this scale -> 3-char endpoint "100"
		expect(r.label % 6).toBe(0);
		expect(r.total).toBe(r.label + 24);
		expect(r.label).toBeGreaterThanOrEqual(6);
		expect(r.label).toBeLessThanOrEqual(100);
	});

	it("grows the numeric gutter when negative endpoints need more chars", () => {
		const narrow = measureYAxisGutter({ min: 0, max: 100 }, 500, undefined);
		const wide = measureYAxisGutter({ min: -1000, max: 100 }, 500, undefined);
		expect(wide.label).toBeGreaterThan(narrow.label);
		expect(wide.total).toBe(wide.label + 24);
	});
});
