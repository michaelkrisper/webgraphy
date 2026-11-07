import { describe, expect, it } from "vitest";
import {
	autoYAxisTitle,
	customYAxisTitle,
	yAxisTitleParts,
	yAxisTitleText,
} from "../yAxisTitle";

const temp = { name: "Temp", yColumn: "t", lineColor: "red" };
const dew = { name: "", yColumn: "Dew", lineColor: "blue" };

describe("yAxisTitle", () => {
	it("joins the series names, falling back to the column", () => {
		expect(autoYAxisTitle([temp, dew])).toBe("Temp / Dew");
		expect(autoYAxisTitle([])).toBe("");
	});

	it("shows a custom title over the automatic one", () => {
		expect(yAxisTitleText("Air", [temp, dew])).toBe("Air");
		expect(yAxisTitleText(undefined, [temp, dew])).toBe("Temp / Dew");
		expect(yAxisTitleText("", [temp])).toBe("Temp");
	});

	it("colours each automatic part by its series", () => {
		expect(yAxisTitleParts(undefined, [temp, dew], "#444")).toEqual([
			{ text: "Temp", color: "red" },
			{ text: "Dew", color: "blue" },
		]);
		expect(
			yAxisTitleParts(undefined, [{ name: "X", yColumn: "x" }], "#444"),
		).toEqual([{ text: "X", color: "#444" }]);
	});

	it("colours a custom title by a shared series colour, else the label colour", () => {
		expect(
			yAxisTitleParts("Air", [temp, { ...dew, lineColor: "red" }], "#444"),
		).toEqual([{ text: "Air", color: "red" }]);
		expect(yAxisTitleParts("Air", [temp, dew], "#444")).toEqual([
			{ text: "Air", color: "#444" },
		]);
		expect(yAxisTitleParts("Air", [], "#444")).toEqual([
			{ text: "Air", color: "#444" },
		]);
	});

	it("stores what was typed unless it is blank or the automatic title", () => {
		expect(customYAxisTitle("  Air ", [temp, dew])).toBe("Air");
		expect(customYAxisTitle("   ", [temp, dew])).toBeUndefined();
		expect(customYAxisTitle("Temp / Dew", [temp, dew])).toBeUndefined();
	});
});
