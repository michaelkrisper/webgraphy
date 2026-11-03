import { describe, expect, it } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../../services/persistence";
import { buildSeriesMetadata, buildXAxisNames } from "../seriesMetadata";

const col = (values: number[]): DataColumn => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min: Math.min(...values), max: Math.max(...values) },
	data: new Float32Array(values),
});

const dataset = (id: string, over: Partial<Dataset> = {}): Dataset => ({
	id,
	name: id,
	columns: ["t", "a", "b"],
	data: [col([0, 1, 2]), col([3, 4, 5]), col([6, 7, 8])],
	rowCount: 3,
	xAxisColumn: "t",
	xAxisId: "axis-1",
	...over,
});

const series = (
	id: string,
	over: Partial<SeriesConfig> = {},
): SeriesConfig => ({
	id,
	sourceId: "d1",
	name: id,
	yColumn: "a",
	yAxisId: "axis-1",
	pointStyle: "none",
	pointColor: "#000",
	lineStyle: "solid",
	lineColor: "#000",
	...over,
});

const xAxes = ["axis-1", "axis-2"].map(
	(id): XAxisConfig => ({
		id,
		name: id,
		min: 0,
		max: 1,
		showGrid: false,
		xMode: "numeric",
	}),
);
const yAxes = ["axis-1", "axis-2"].map(
	(id): YAxisConfig => ({
		id,
		name: id,
		min: 0,
		max: 1,
		position: "left",
		color: "#000",
		showGrid: false,
	}),
);

describe("buildSeriesMetadata", () => {
	it("resolves dataset, axes and columns of each visible series", () => {
		const d1 = dataset("d1", { xAxisId: "axis-2" });
		const [m] = buildSeriesMetadata(
			[series("s", { yColumn: "b", yAxisId: "axis-2" })],
			[d1],
			xAxes,
			yAxes,
		);
		expect(m.ds).toBe(d1);
		expect(m.axis).toBe(yAxes[1]);
		expect(m.xAxis).toBe(xAxes[1]);
		expect([m.xIdx, m.yIdx]).toEqual([0, 2]);
		expect(m.xCol).toBe(d1.data[0]);
		expect(m.yCol).toBe(d1.data[2]);
	});

	it("uses the default x axis when the dataset has none", () => {
		const [m] = buildSeriesMetadata(
			[series("s")],
			[dataset("d1", { xAxisId: "" })],
			xAxes,
			yAxes,
		);
		expect(m.xAxis).toBe(xAxes[0]);
	});

	it("matches prefixed column names like the rest of the app", () => {
		const d1 = dataset("d1", { columns: ["t", "file: a", "b"] });
		const [m] = buildSeriesMetadata([series("s")], [d1], xAxes, yAxes);
		expect(m.yIdx).toBe(1);
	});

	it("skips hidden series and anything that does not resolve", () => {
		const d1 = dataset("d1");
		const out = buildSeriesMetadata(
			[
				series("hidden", { hidden: true }),
				series("no-dataset", { sourceId: "missing" }),
				series("no-axis", { yAxisId: "axis-7" }),
				series("no-column", { yColumn: "zzz" }),
				series("ok"),
			],
			[d1],
			xAxes,
			yAxes,
		);
		expect(out.map((m) => m.series.id)).toEqual(["ok"]);
	});
});

describe("buildXAxisNames", () => {
	it("joins distinct x column names per axis", () => {
		expect(
			buildXAxisNames([
				dataset("d1", { xAxisColumn: "time" }),
				dataset("d2", { xAxisColumn: "time" }),
				dataset("d3", { xAxisColumn: "date" }),
				dataset("d4", { xAxisColumn: "x", xAxisId: "axis-2" }),
				dataset("d5", { xAxisColumn: "t", xAxisId: "" }),
			]),
		).toEqual({ "axis-1": "time / date / t", "axis-2": "x" });
	});
});
