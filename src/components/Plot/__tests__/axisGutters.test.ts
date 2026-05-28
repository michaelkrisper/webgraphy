import { describe, expect, it } from "vitest";
import {
	DEFAULT_GUTTER_TOTAL,
	computeAxisOffsets,
	gutterTotal,
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
