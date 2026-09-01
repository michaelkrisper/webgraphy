import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import { m4ByXFloat32 } from "../../../utils/decimation";
import {
	buildPlotDataTable,
	formatTableValue,
	MAX_TABLE_ROWS,
} from "../plotDataTable";

const POINTS = 100_000;

function makeDataset(): Dataset {
	const x = new Float32Array(POINTS);
	const y = new Float32Array(POINTS);
	for (let i = 0; i < POINTS; i++) {
		x[i] = i;
		y[i] = Math.sin(i / 500);
	}
	return {
		id: "ds-1",
		name: "Big",
		columns: ["time", "value"],
		rowCount: POINTS,
		xAxisColumn: "time",
		xAxisId: "axis-1",
		data: [
			{
				isFloat64: false,
				refPoint: 0,
				bounds: { min: 0, max: POINTS - 1 },
				data: x,
			},
			{ isFloat64: false, refPoint: 0, bounds: { min: -1, max: 1 }, data: y },
		],
	} as unknown as Dataset;
}

const series = [
	{
		id: "s1",
		sourceId: "ds-1",
		name: "Value",
		yColumn: "value",
		yAxisId: "axis-1",
		hidden: false,
	},
] as unknown as SeriesConfig[];

const xAxes = [
	{
		id: "axis-1",
		name: "Time",
		min: 0,
		max: 1000,
		showGrid: true,
		xMode: "numeric",
	},
] as XAxisConfig[];

describe("buildPlotDataTable", () => {
	it("bounds the row count regardless of dataset size", () => {
		const [table] = buildPlotDataTable({
			series,
			datasets: [makeDataset()],
			xAxes,
		});
		expect(table.rows.length).toBeGreaterThan(0);
		expect(table.rows.length).toBeLessThanOrEqual(MAX_TABLE_ROWS);
	});

	it("covers the current viewport, not the whole column", () => {
		const [table] = buildPlotDataTable({
			series,
			datasets: [makeDataset()],
			xAxes,
		});
		// Only the two continuity anchors may sit outside the axis range.
		const outside = table.rows.filter((r) => r.x < 0 || r.x > 1000);
		expect(outside.length).toBeLessThanOrEqual(2);
	});

	it("emits the same points the renderer decimates", () => {
		const ds = makeDataset();
		const [table] = buildPlotDataTable({ series, datasets: [ds], xAxes });
		const { x, y } = m4ByXFloat32(
			ds.data[0].data,
			ds.data[1].data,
			0,
			0,
			1000,
			1000 / Math.floor((MAX_TABLE_ROWS - 2) / 4),
		);
		expect(table.rows.length).toBe(Math.min(x.length, MAX_TABLE_ROWS));
		expect(table.rows[0]).toEqual({ x: x[0], y: y[0] });
		const last = table.rows.length - 1;
		expect(table.rows[last]).toEqual({ x: x[last], y: y[last] });
	});

	it("skips hidden series", () => {
		const hidden = [{ ...series[0], hidden: true }] as SeriesConfig[];
		expect(
			buildPlotDataTable({
				series: hidden,
				datasets: [makeDataset()],
				xAxes,
			}),
		).toEqual([]);
	});

	it("skips a series whose axis has collapsed to zero width", () => {
		const collapsed = [{ ...xAxes[0], min: 5, max: 5 }] as XAxisConfig[];
		expect(
			buildPlotDataTable({
				series,
				datasets: [makeDataset()],
				xAxes: collapsed,
			}),
		).toEqual([]);
	});
});

describe("formatTableValue", () => {
	it("renders a placeholder for gaps", () => {
		expect(formatTableValue(Number.NaN)).toBe("—");
	});

	it("formats a date axis as a date", () => {
		expect(formatTableValue(0, "date")).toMatch(/1970/);
	});
});
