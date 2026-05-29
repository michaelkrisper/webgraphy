import { describe, expect, it } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import {
	MAX_DERIVED_CATEGORY_LABELS,
	computeXAxisCategoryLabels,
	computeYAxisCategoryLabels,
} from "../categoryLabels";

function makeColumn(
	categoryLabels?: string[],
	data: Float32Array = new Float32Array(),
	refPoint = 0,
): DataColumn {
	return {
		isFloat64: false,
		refPoint,
		bounds: { min: 0, max: 0 },
		data,
		categoryLabels,
	};
}

function makeDataset(
	id: string,
	columns: Array<{
		name: string;
		categoryLabels?: string[];
		data?: Float32Array;
		refPoint?: number;
	}>,
	xOpts: { xAxisId?: string; xAxisColumn?: string } = {},
): Dataset {
	return {
		id,
		name: id,
		columns: columns.map((c) => c.name),
		data: columns.map((c) =>
			makeColumn(c.categoryLabels, c.data, c.refPoint),
		),
		rowCount: 0,
		xAxisColumn: xOpts.xAxisColumn ?? "x",
		xAxisId: xOpts.xAxisId ?? "X",
	};
}

function makeXAxis(
	id: string,
	xMode: "date" | "numeric" | "categorical" = "numeric",
): XAxisConfig {
	return { id, name: id, min: 0, max: 100, showGrid: false, xMode };
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

describe("computeXAxisCategoryLabels", () => {
	it("returns an empty map when there are no active datasets", () => {
		const result = computeXAxisCategoryLabels(new Set(), [], []);
		expect(result.size).toBe(0);
	});

	it("ignores datasets that are not in the active set", () => {
		const ds = makeDataset(
			"inactive",
			[{ name: "x", categoryLabels: ["a"] }],
			{ xAxisId: "X" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(),
			[ds],
			[makeXAxis("X")],
		);
		expect(result.size).toBe(0);
	});

	it("auto-detects labels when the active dataset's x column is categorical", () => {
		const ds = makeDataset(
			"ds1",
			[{ name: "x", categoryLabels: ["A", "B", "C"] }],
			{ xAxisId: "X", xAxisColumn: "x" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(["ds1"]),
			[ds],
			[makeXAxis("X")],
		);
		expect(result.get("X")).toEqual({ labels: ["A", "B", "C"] });
		expect(result.get("X")?.ticks).toBeUndefined();
	});

	it("auto-detects when two datasets agree on the same labels", () => {
		const labels = ["A", "B"];
		const ds1 = makeDataset(
			"ds1",
			[{ name: "x", categoryLabels: labels }],
			{ xAxisId: "X" },
		);
		const ds2 = makeDataset(
			"ds2",
			[{ name: "x", categoryLabels: labels.slice() }],
			{ xAxisId: "X" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(["ds1", "ds2"]),
			[ds1, ds2],
			[makeXAxis("X")],
		);
		expect(result.get("X")).toEqual({ labels });
	});

	it("returns undefined for a non-forced axis when datasets disagree", () => {
		const ds1 = makeDataset(
			"ds1",
			[{ name: "x", categoryLabels: ["A", "B"] }],
			{ xAxisId: "X" },
		);
		const ds2 = makeDataset(
			"ds2",
			[{ name: "x", categoryLabels: ["A", "C"] }],
			{ xAxisId: "X" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(["ds1", "ds2"]),
			[ds1, ds2],
			[makeXAxis("X", "numeric")],
		);
		expect(result.get("X")).toBeUndefined();
	});

	it("returns undefined for a non-forced axis lacking categoryLabels", () => {
		const ds = makeDataset("ds1", [{ name: "x" }], { xAxisId: "X" });
		const result = computeXAxisCategoryLabels(
			new Set(["ds1"]),
			[ds],
			[makeXAxis("X", "numeric")],
		);
		expect(result.get("X")).toBeUndefined();
	});

	it("derives labels for a forced-categorical axis from unique x values", () => {
		const ds = makeDataset(
			"ds1",
			[
				{
					name: "x",
					data: new Float32Array([2, 1, 2, 3, 1]),
				},
			],
			{ xAxisId: "X" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(["ds1"]),
			[ds],
			[makeXAxis("X", "categorical")],
		);
		expect(result.get("X")).toEqual({
			labels: ["1", "2", "3"],
			ticks: [1, 2, 3],
		});
	});

	it("derived labels respect refPoint when reconstructing absolute values", () => {
		const ds = makeDataset(
			"ds1",
			[{ name: "x", data: new Float32Array([0, 1]), refPoint: 100 }],
			{ xAxisId: "X" },
		);
		const result = computeXAxisCategoryLabels(
			new Set(["ds1"]),
			[ds],
			[makeXAxis("X", "categorical")],
		);
		expect(result.get("X")).toEqual({
			labels: ["100", "101"],
			ticks: [100, 101],
		});
	});

	it("caps derived labels at MAX_DERIVED_CATEGORY_LABELS", () => {
		const big = new Float32Array(MAX_DERIVED_CATEGORY_LABELS + 500);
		for (let i = 0; i < big.length; i++) big[i] = i;
		const ds = makeDataset("ds1", [{ name: "x", data: big }], {
			xAxisId: "X",
		});
		const result = computeXAxisCategoryLabels(
			new Set(["ds1"]),
			[ds],
			[makeXAxis("X", "categorical")],
		);
		const info = result.get("X");
		// Loop breaks the first time uniq.size > cap, after one extra insert.
		expect(info?.labels.length).toBe(MAX_DERIVED_CATEGORY_LABELS + 1);
	});
});
