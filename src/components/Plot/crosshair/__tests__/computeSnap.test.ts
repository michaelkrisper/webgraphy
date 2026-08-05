import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../../services/persistence";
import { computeSnap } from "../computeSnap";
import type { SeriesMetadata } from "../types";

/**
 * The crosshair decides which sample the user is pointing at and what the
 * tooltip claims that sample is. A wrong pick reads as correct data, so the
 * snapping is checked against hand-computed expectations rather than snapshots.
 */

const PADDING = { top: 10, right: 10, bottom: 10, left: 10 };
const WIDTH = 210;
const HEIGHT = 110;

const xAxis = (over: Partial<XAxisConfig> = {}): XAxisConfig =>
	({
		id: "axis-1",
		min: 0,
		max: 10,
		xMode: "numeric",
		showGrid: true,
		name: "",
		...over,
	}) as XAxisConfig;

const yAxis = (over: Partial<YAxisConfig> = {}): YAxisConfig =>
	({
		id: "axis-1",
		min: 0,
		max: 100,
		showGrid: true,
		name: "Y",
		position: "left",
		color: "#000",
		...over,
	}) as YAxisConfig;

const dataset = (id: string): Dataset => ({ id }) as Dataset;

const seriesConfig = (over: Partial<SeriesConfig> = {}): SeriesConfig =>
	({
		id: "s1",
		name: "Temp",
		yColumn: "t",
		sourceId: "ds-1",
		yAxisId: "axis-1",
		lineColor: "#ff0000",
		pointStyle: "circle",
		...over,
	}) as SeriesConfig;

function meta(over: Partial<SeriesMetadata> = {}): SeriesMetadata {
	return {
		series: seriesConfig(),
		ds: dataset("ds-1"),
		axis: yAxis(),
		xAxis: xAxis(),
		xIdx: 0,
		yIdx: 1,
		xCol: { data: Float32Array.from([0, 2, 4, 6, 8, 10]), refPoint: 0 },
		yCol: { data: Float32Array.from([0, 20, 40, 60, 80, 100]), refPoint: 0 },
		...over,
	};
}

/** Screen x for a world x under the fixture's axis and padding. */
const screenX = (worldX: number) =>
	PADDING.left + ((worldX - 0) / 10) * (WIDTH - PADDING.left - PADDING.right);

const base = {
	seriesMetadata: [meta()],
	xAxisNameById: { "axis-1": "Time" },
	width: WIDTH,
	height: HEIGHT,
	padding: PADDING,
};

describe("computeSnap", () => {
	it("returns null when there is nothing to snap to", () => {
		expect(
			computeSnap({ ...base, pos: { x: 50, y: 50 }, seriesMetadata: [] }),
		).toBeNull();
	});

	it("returns null when the series has no x axis", () => {
		const withoutAxis = meta({ xAxis: undefined as unknown as XAxisConfig });
		expect(
			computeSnap({
				...base,
				pos: { x: 50, y: 50 },
				seriesMetadata: [withoutAxis],
			}),
		).toBeNull();
	});

	it("snaps to the nearest sample, not the nearest pixel", () => {
		// Pointer sits at world x = 3.4, between samples at 2 and 4.
		const result = computeSnap({ ...base, pos: { x: screenX(3.4), y: 50 } });

		expect(result).not.toBeNull();
		expect(result?.snapScreenX).toBeCloseTo(screenX(4), 5);
		expect(result?.entries).toHaveLength(1);
		expect(result?.entries[0].items[0].value).toBe(40);
	});

	it("snaps to the left sample when the pointer is just past it", () => {
		const result = computeSnap({ ...base, pos: { x: screenX(2.4), y: 50 } });
		expect(result?.entries[0].items[0].value).toBe(20);
	});

	it("clamps to the first and last sample outside the data range", () => {
		const left = computeSnap({ ...base, pos: { x: screenX(-5), y: 50 } });
		const right = computeSnap({ ...base, pos: { x: screenX(50), y: 50 } });

		expect(left?.entries[0].items[0].value).toBe(0);
		expect(right?.entries[0].items[0].value).toBe(100);
	});

	it("applies the column reference point to the reported values", () => {
		// Timestamps are stored as small deltas plus a reference point; reading
		// the deltas alone would report values off by the reference.
		const shifted = meta({
			xCol: { data: Float32Array.from([0, 2, 4]), refPoint: 1_000_000 },
			yCol: { data: Float32Array.from([1, 2, 3]), refPoint: 500 },
			xAxis: xAxis({ min: 1_000_000, max: 1_000_004 }),
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [shifted],
			pos: { x: screenX(5), y: 50 },
		});

		expect(result?.entries[0].items[0].value).toBe(502);
		expect(result?.entries[0].xLabel).toContain("1,000,002");
	});

	it("groups series that share an x value and axis into one entry", () => {
		const second = meta({
			series: seriesConfig({ id: "s2", name: "Humidity", lineColor: "#00ff00" }),
			yCol: { data: Float32Array.from([5, 15, 25, 35, 45, 55]), refPoint: 0 },
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [meta(), second],
			pos: { x: screenX(4), y: 50 },
		});

		expect(result?.entries).toHaveLength(1);
		expect(result?.entries[0].items.map((i) => i.label)).toEqual([
			"Temp",
			"Humidity",
		]);
	});

	it("keeps series on different x axes in separate groups", () => {
		const other = meta({
			series: seriesConfig({ id: "s2", name: "Other", sourceId: "ds-2" }),
			ds: dataset("ds-2"),
			xAxis: xAxis({ id: "axis-2" }),
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [meta(), other],
			xAxisNameById: { "axis-1": "Time", "axis-2": "Distance" },
			pos: { x: screenX(4), y: 50 },
		});

		expect(result?.entries).toHaveLength(2);
		expect(result?.entries.map((e) => e.xAxisName)).toEqual(["Time", "Distance"]);
	});

	it("falls back to a placeholder for an axis with no registered name", () => {
		const result = computeSnap({
			...base,
			xAxisNameById: {},
			pos: { x: screenX(4), y: 50 },
		});
		expect(result?.entries[0].xAxisName).toBe("Unknown Axis");
	});

	it("formats a date axis as a full date rather than a number", () => {
		const t0 = Math.floor(new Date(2026, 0, 1).getTime() / 1000);
		const dated = meta({
			xCol: { data: Float32Array.from([0, 3600, 7200]), refPoint: t0 },
			xAxis: xAxis({ xMode: "date", min: t0, max: t0 + 7200 }),
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [dated],
			pos: { x: WIDTH / 2, y: 50 },
		});

		// Not a bare number: the date formatter produced something else.
		expect(result?.entries[0].xLabel).not.toMatch(/^[\d,.]+$/);
	});

	it("uses category labels for both axes when present", () => {
		const categorical = meta({
			xCol: {
				data: Float32Array.from([0, 1, 2]),
				refPoint: 0,
				categoryLabels: ["Mon", "Tue", "Wed"],
			},
			yCol: {
				data: Float32Array.from([0, 1, 2]),
				refPoint: 0,
				categoryLabels: ["low", "mid", "high"],
			},
			xAxis: xAxis({ xMode: "categorical", min: 0, max: 2 }),
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [categorical],
			pos: { x: screenX(10), y: 50 },
		});

		expect(result?.entries[0].xLabel).toBe("Wed");
		expect(result?.entries[0].items[0].valueLabel).toBe("high");
	});

	it("falls back to the column name when a series has no name", () => {
		const unnamed = meta({ series: seriesConfig({ name: "", yColumn: "raw" }) });
		const result = computeSnap({
			...base,
			seriesMetadata: [unnamed],
			pos: { x: screenX(4), y: 50 },
		});
		expect(result?.entries[0].items[0].label).toBe("raw");
	});

	it("falls back to a default colour when the series has none", () => {
		const colourless = meta({
			series: seriesConfig({ lineColor: "" as unknown as string }),
		});
		const result = computeSnap({
			...base,
			seriesMetadata: [colourless],
			pos: { x: screenX(4), y: 50 },
		});
		expect(result?.entries[0].items[0].color).toBe("#333");
	});

	it("places the item at the screen position of its own y axis", () => {
		// Two series on y axes with different ranges must not land on the same
		// pixel just because their raw values match.
		const wideAxis = meta({
			series: seriesConfig({ id: "s2", name: "Wide" }),
			axis: yAxis({ id: "axis-2", min: 0, max: 1000 }),
		});

		const result = computeSnap({
			...base,
			seriesMetadata: [meta(), wideAxis],
			pos: { x: screenX(4), y: 50 },
		});

		const [narrow, wide] = result!.entries[0].items;
		expect(narrow.value).toBe(wide.value);
		expect(narrow.yScreen).not.toBeCloseTo(wide.yScreen, 3);
	});
});
