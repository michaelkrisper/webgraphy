import { describe, expect, it } from "vitest";
import { computeXAxesMetrics, getXAxisRowMetrics } from "../xAxisMetrics";

describe("getXAxisRowMetrics", () => {
	it("returns the taller layout for date axes (room for the secondary row)", () => {
		expect(getXAxisRowMetrics("date")).toEqual({
			height: 70,
			labelBottom: 22,
			secLabelBottom: 38,
			titleBottom: 60,
		});
	});

	it("returns the compact layout for numeric axes", () => {
		expect(getXAxisRowMetrics("numeric")).toEqual({
			height: 50,
			labelBottom: 26,
			secLabelBottom: 0,
			titleBottom: 40,
		});
	});

	it("treats categorical axes like numeric (no secondary row)", () => {
		expect(getXAxisRowMetrics("categorical")).toEqual(
			getXAxisRowMetrics("numeric"),
		);
	});
});

describe("computeXAxesMetrics", () => {
	it("returns an empty array when there are no axes", () => {
		expect(computeXAxesMetrics([])).toEqual([]);
	});

	it("places the first axis flush against the plot (offset 0)", () => {
		const [m] = computeXAxesMetrics([{ id: "X", xMode: "numeric" }]);
		expect(m.id).toBe("X");
		expect(m.cumulativeOffset).toBe(0);
		expect(m.height).toBe(50);
	});

	it("stacks each axis by its preceding heights", () => {
		const result = computeXAxesMetrics([
			{ id: "A", xMode: "date" }, // height 70
			{ id: "B", xMode: "numeric" }, // height 50
			{ id: "C", xMode: "categorical" }, // height 50
		]);
		expect(result.map((m) => m.cumulativeOffset)).toEqual([0, 70, 120]);
		expect(result.map((m) => m.id)).toEqual(["A", "B", "C"]);
	});

	it("preserves the per-axis label baselines from getXAxisRowMetrics", () => {
		const [date, num] = computeXAxesMetrics([
			{ id: "A", xMode: "date" },
			{ id: "B", xMode: "numeric" },
		]);
		expect(date.labelBottom).toBe(22);
		expect(date.secLabelBottom).toBe(38);
		expect(num.labelBottom).toBe(26);
		expect(num.secLabelBottom).toBe(0);
	});
});
