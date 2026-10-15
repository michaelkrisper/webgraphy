import { describe, expect, it } from "vitest";
import {
	firstFreeYAxisSlot,
	ownsYAxisRow,
	usedYAxes,
	yAxisSlot,
} from "../yAxisSlots";

const s = (id: string, yAxisId: string, name: string, lineColor: string) => ({
	id,
	yAxisId,
	name,
	yColumn: `col-${id}`,
	lineColor,
});

describe("yAxisSlots", () => {
	it("parses the slot number from an axis id", () => {
		expect(yAxisSlot("axis-7")).toBe(7);
		expect(yAxisSlot("bogus")).toBe(1);
	});

	it("lists only used axes by slot, titled like the chart", () => {
		const series = [
			s("a", "axis-3", "Wind", "#0f0"),
			s("b", "axis-1", "Temp", "#f00"),
			s("c", "axis-1", "", "#00f"),
			s("d", "axis-1", "Dew", "#f00"),
		];
		expect(usedYAxes(series)).toEqual([
			{
				slot: 1,
				id: "axis-1",
				title: "Temp / col-c / Dew",
				colors: ["#f00", "#00f"],
			},
			{ slot: 3, id: "axis-3", title: "Wind", colors: ["#0f0"] },
		]);
	});

	it("finds the first free slot, or null when all nine are used", () => {
		expect(firstFreeYAxisSlot([])).toBe(1);
		expect(
			firstFreeYAxisSlot([{ yAxisId: "axis-1" }, { yAxisId: "axis-3" }]),
		).toBe(2);
		const full = Array.from({ length: 9 }, (_, i) => ({
			yAxisId: `axis-${i + 1}`,
		}));
		expect(firstFreeYAxisSlot(full)).toBeNull();
	});

	it("gives axis controls to the first row on each axis only", () => {
		const series = [
			{ id: "a", yAxisId: "axis-2" },
			{ id: "b", yAxisId: "axis-1" },
			{ id: "c", yAxisId: "axis-2" },
		];
		expect(ownsYAxisRow(series, series[0])).toBe(true);
		expect(ownsYAxisRow(series, series[1])).toBe(true);
		expect(ownsYAxisRow(series, series[2])).toBe(false);
		// A row not (yet) in the list owns its axis.
		expect(ownsYAxisRow(series, { id: "z", yAxisId: "axis-5" })).toBe(true);
	});
});
