import { describe, expect, it } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
} from "../../../services/persistence";
import { computeYAxisCategoryLabels } from "../categoryLabels";

function makeColumn(categoryLabels?: string[]): DataColumn {
	return {
		isFloat64: false,
		refPoint: 0,
		bounds: { min: 0, max: 0 },
		data: new Float32Array(),
		categoryLabels,
	};
}

function makeDataset(
	id: string,
	columns: Array<{ name: string; categoryLabels?: string[] }>,
): Dataset {
	return {
		id,
		name: id,
		columns: columns.map((c) => c.name),
		data: columns.map((c) => makeColumn(c.categoryLabels)),
		rowCount: 0,
		xAxisColumn: "x",
		xAxisId: "X",
	};
}

function makeSeries(
	id: string,
	sourceId: string,
	yColumn: string,
	yAxisId: string,
): SeriesConfig {
	return {
		id,
		sourceId,
		name: id,
		yColumn,
		yAxisId,
		pointStyle: "none",
		pointColor: "#000",
		lineStyle: "solid",
		lineColor: "#000",
	};
}

describe("computeYAxisCategoryLabels", () => {
	it("returns an empty map when there are no series", () => {
		expect(computeYAxisCategoryLabels([], [])).toEqual(new Map());
	});

	it("resolves labels when the single series' column is categorical", () => {
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "status", categoryLabels: ["new", "in_progress", "done"] },
		]);
		const series = [makeSeries("s1", "ds1", "status", "Y")];
		const result = computeYAxisCategoryLabels(series, [ds]);
		expect(result.get("Y")).toEqual(["new", "in_progress", "done"]);
	});

	it("preserves labels when every series on an axis agrees", () => {
		const labels = ["a", "b", "c"];
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "col1", categoryLabels: labels },
			{ name: "col2", categoryLabels: labels.slice() },
		]);
		const series = [
			makeSeries("s1", "ds1", "col1", "Y"),
			makeSeries("s2", "ds1", "col2", "Y"),
		];
		expect(computeYAxisCategoryLabels(series, [ds]).get("Y")).toEqual(labels);
	});

	it("returns undefined when one series' column lacks categoryLabels", () => {
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "cat", categoryLabels: ["a", "b"] },
			{ name: "num" },
		]);
		const series = [
			makeSeries("s1", "ds1", "cat", "Y"),
			makeSeries("s2", "ds1", "num", "Y"),
		];
		expect(computeYAxisCategoryLabels(series, [ds]).get("Y")).toBeUndefined();
	});

	it("returns undefined when two series' label sets disagree", () => {
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "c1", categoryLabels: ["a", "b"] },
			{ name: "c2", categoryLabels: ["a", "c"] },
		]);
		const series = [
			makeSeries("s1", "ds1", "c1", "Y"),
			makeSeries("s2", "ds1", "c2", "Y"),
		];
		expect(computeYAxisCategoryLabels(series, [ds]).get("Y")).toBeUndefined();
	});

	it("returns undefined when the series' sourceId is missing from datasets", () => {
		const series = [makeSeries("s1", "ghost", "col", "Y")];
		expect(computeYAxisCategoryLabels(series, []).get("Y")).toBeUndefined();
	});

	it("returns undefined when the column name does not resolve in the dataset", () => {
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "real", categoryLabels: ["a", "b"] },
		]);
		const series = [makeSeries("s1", "ds1", "missing", "Y")];
		expect(computeYAxisCategoryLabels(series, [ds]).get("Y")).toBeUndefined();
	});

	it("classifies axes independently", () => {
		const ds = makeDataset("ds1", [
			{ name: "x" },
			{ name: "cat", categoryLabels: ["x", "y"] },
			{ name: "num" },
		]);
		const series = [
			makeSeries("s1", "ds1", "cat", "Ycat"),
			makeSeries("s2", "ds1", "num", "Ynum"),
		];
		const result = computeYAxisCategoryLabels(series, [ds]);
		expect(result.get("Ycat")).toEqual(["x", "y"]);
		expect(result.get("Ynum")).toBeUndefined();
	});
});
