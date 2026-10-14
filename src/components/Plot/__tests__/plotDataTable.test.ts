import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import { logBucketIndex, m4ByXFloat32 } from "../../../utils/decimation";
import {
	buildPlotDataTable,
	formatTableValue,
	MAX_TABLE_ROWS,
	plotTableToTsv,
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

	it("buckets log-uniformly on a log x axis", () => {
		const logAxes = [
			{ ...xAxes[0], min: 1, max: POINTS, scale: "log" },
		] as XAxisConfig[];
		const [table] = buildPlotDataTable({
			series,
			datasets: [makeDataset()],
			xAxes: logAxes,
		});
		const w = Math.log10(POINTS) / Math.floor((MAX_TABLE_ROWS - 2) / 4);
		const perBucket = new Map<number, number>();
		for (const r of table.rows) {
			const k = logBucketIndex(r.x, w);
			perBucket.set(k, (perBucket.get(k) ?? 0) + 1);
		}
		// Every bucket keeps at most (first, min, max, last).
		for (const count of perBucket.values()) expect(count).toBeLessThanOrEqual(4);
		// Equal-width decades: the low decades get rows, not one linear bucket.
		const decades = [0, 1, 2, 3, 4].map(
			(d) =>
				table.rows.filter((r) => r.x >= 10 ** d && r.x < 10 ** (d + 1)).length,
		);
		for (const c of decades.slice(1)) expect(c).toBeGreaterThan(10);
		expect(decades[0]).toBeGreaterThan(0);
	});

	it("skips a log x axis whose range is not positive", () => {
		const bad = [
			{ ...xAxes[0], min: 0, max: 100, scale: "log" },
		] as XAxisConfig[];
		expect(
			buildPlotDataTable({ series, datasets: [makeDataset()], xAxes: bad }),
		).toEqual([]);
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

describe("refPoint reconstruction", () => {
	const offsetDataset = (): Dataset =>
		({
			id: "ds-1",
			name: "Offset",
			columns: ["time", "value"],
			rowCount: 3,
			xAxisColumn: "time",
			xAxisId: "axis-1",
			data: [
				{
					isFloat64: true,
					refPoint: 1700000000,
					bounds: { min: 1700000000, max: 1700000120 },
					data: new Float32Array([0, 60, 120]),
				},
				{
					isFloat64: false,
					refPoint: 1000.25,
					bounds: { min: 999.75, max: 1001.75 },
					data: new Float32Array([0, -0.5, 1.5]),
				},
			],
		}) as unknown as Dataset;
	const dateAxes = [
		{ ...xAxes[0], min: 1700000000, max: 1700000120, xMode: "date" },
	] as XAxisConfig[];

	it("adds the y column's refPoint back, not only x's", () => {
		const [table] = buildPlotDataTable({
			series,
			datasets: [offsetDataset()],
			xAxes: dateAxes,
		});
		expect(table.rows.map((r) => r.y)).toEqual([1000.25, 999.75, 1001.75]);
	});

	it("serialises the shown rows as TSV with ISO dates", () => {
		const tables = buildPlotDataTable({
			series,
			datasets: [offsetDataset()],
			xAxes: dateAxes,
		});
		expect(plotTableToTsv(tables)).toBe(
			[
				"Time\tValue",
				"2023-11-14T22:13:20.000Z\t1000.25",
				"2023-11-14T22:14:20.000Z\t999.75",
				"2023-11-14T22:15:20.000Z\t1001.75",
				"",
			].join("\n"),
		);
	});

	it("separates series with a blank line and guards their names", () => {
		const two = [
			series[0],
			{ ...series[0], id: "s2", name: "=evil" },
		] as SeriesConfig[];
		const tsv = plotTableToTsv(
			buildPlotDataTable({
				series: two,
				datasets: [offsetDataset()],
				xAxes: dateAxes,
			}),
		);
		const blocks = tsv.split("\n\n");
		expect(blocks).toHaveLength(2);
		expect(blocks[1].split("\n")[0]).toBe("Time\t'=evil");
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
