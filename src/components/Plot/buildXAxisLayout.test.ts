import { describe, it, expect, vi } from "vitest";
import { buildXAxisLayout } from "./buildXAxisLayout";
import type { Dataset, XAxisConfig } from "../../services/persistence";
import { calcNumericStep } from "../../utils/axisCalculations";

vi.mock("../../utils/axisCalculations", () => ({
	calcCategoricalTicks: vi.fn(() => [1, 2, 3]),
	calcNumericStep: vi.fn((r, w) => 10),
	calcNumericPrecision: vi.fn(() => 1),
	calcNumericTicks: vi.fn(() => [0, 10, 20]),
}));

vi.mock("../../utils/time", () => ({
	getTimeStep: vi.fn(() => ({ unit: "hour", step: 1 })),
	generateTimeTicks: vi.fn(() => [{ value: 0, label: "12:00" }]),
	generateSecondaryLabels: vi.fn(() => [{ value: 0, label: "Jan 1" }]),
}));

describe("buildXAxisLayout", () => {
	const defaultAxis: XAxisConfig = {
		id: "x-axis-1",
		min: 0,
		max: 100,
		xMode: "numeric",
		showGrid: true,
		name: "",
	};

	const defaultDatasets = [
		{ xAxisColumn: "time" } as Dataset,
	];

	it("handles zero range or zero width", () => {
		const result1 = buildXAxisLayout({ ...defaultAxis, min: 100, max: 100 }, 500, "red", undefined, undefined, defaultDatasets);
		expect(result1.ticks.result).toEqual([]);

		const result2 = buildXAxisLayout(defaultAxis, 0, "red", undefined, undefined, defaultDatasets);
		expect(result2.ticks.result).toEqual([]);
	});

	it("handles categorical labels with provided ticks", () => {
		const result = buildXAxisLayout(defaultAxis, 500, "red", ["A", "B", "C"], [0, 50, 150], defaultDatasets);
		expect(result.ticks.result).toEqual([0, 50]); // 150 is filtered out
		expect(result.categoryLabels).toEqual(["A", "B", "C"]);
	});

	it("handles categorical labels without provided ticks", () => {
		const result = buildXAxisLayout(defaultAxis, 500, "red", ["A", "B", "C"], undefined, defaultDatasets);
		expect(result.ticks.result).toEqual([1, 2, 3]); // from mock
	});

	it("handles numeric layout", () => {
		const result = buildXAxisLayout(defaultAxis, 500, "red", undefined, undefined, defaultDatasets);
		expect(result.ticks.result).toEqual([0, 10, 20]); // from mock
		expect(result.ticks.isXDate).toBe(false);
	});

	it("handles date layout", () => {
		const result = buildXAxisLayout({ ...defaultAxis, xMode: "date" }, 500, "red", undefined, undefined, defaultDatasets);
		expect(result.ticks.result).toEqual([{ value: 0, label: "12:00" }]); // from mock
		expect(result.ticks.isXDate).toBe(true);
	});

    it("handles explicit axis name", () => {
        const result = buildXAxisLayout({ ...defaultAxis, name: "Custom Name" }, 500, "red", undefined, undefined, defaultDatasets);
        expect(result.title).toBe("Custom Name");
    });

    it("handles multiple unique columns for default title", () => {
        const datasets = [
            { xAxisColumn: "col1" } as Dataset,
            { xAxisColumn: "col2" } as Dataset,
            { xAxisColumn: "col1" } as Dataset,
        ];
        const result = buildXAxisLayout(defaultAxis, 500, "red", undefined, undefined, datasets);
        expect(result.title).toBe("col1 / col2");
    });

	it("handles non-date layout with step <= 0", () => {
		vi.mocked(calcNumericStep).mockReturnValueOnce(0);
		const result = buildXAxisLayout(defaultAxis, 500, "red", undefined, undefined, defaultDatasets);
		expect(result.ticks.result).toEqual([]);
		expect(result.ticks.step).toBe(1);
	});

	it("handles fallback to empty title when no columns exist", () => {
		const result = buildXAxisLayout(defaultAxis, 500, "red", undefined, undefined, []);
		expect(result.title).toBe("");
	});
});
