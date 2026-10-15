import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import { useChartLayout } from "../useChartLayout";

function col(values: number[], categoryLabels?: string[]): DataColumn {
	return {
		isFloat64: false,
		refPoint: 0,
		bounds: { min: Math.min(...values), max: Math.max(...values) },
		data: new Float32Array(values),
		categoryLabels,
	};
}

function dataset(id: string, xAxisId: string, yCol?: DataColumn): Dataset {
	return {
		id,
		name: id,
		columns: ["x", "y"],
		data: [col([0, 1, 2]), yCol ?? col([3, 4, 5])],
		rowCount: 3,
		xAxisColumn: "x",
		xAxisId,
	};
}

function series(id: string, sourceId: string, yAxisId: string): SeriesConfig {
	return {
		id,
		sourceId,
		name: id,
		yColumn: "y",
		yAxisId,
		pointStyle: "none",
		pointColor: "#000",
		lineStyle: "solid",
		lineColor: "#000",
	};
}

const xAxis = (id: string, xMode: XAxisConfig["xMode"] = "numeric") =>
	({
		id,
		name: id,
		min: 0,
		max: 10,
		showGrid: true,
		xMode,
	}) satisfies XAxisConfig;

const yAxis = (id: string, position: "left" | "right" = "left") =>
	({
		id,
		name: id,
		min: 0,
		max: 10,
		position,
		color: "#000",
		showGrid: true,
	}) satisfies YAxisConfig;

const X_AXES = [xAxis("axis-1"), xAxis("axis-2", "date"), xAxis("axis-3")];
const Y_AXES = [
	yAxis("axis-1"),
	yAxis("axis-2", "right"),
	yAxis("axis-3"),
	yAxis("axis-4", "right"),
];

describe("useChartLayout", () => {
	it("only lays out axes referenced by series", () => {
		const { result } = renderHook(() =>
			useChartLayout(
				[series("s1", "d1", "axis-1"), series("s2", "d1", "axis-2")],
				[dataset("d1", "axis-1"), dataset("d2", "axis-3")],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		);
		const r = result.current;
		expect([...r.activeDsIdsSet]).toEqual(["d1"]);
		expect(r.activeYAxes.map((a) => a.id)).toEqual(["axis-1", "axis-2"]);
		expect(r.leftAxes.map((a) => a.id)).toEqual(["axis-1"]);
		expect(r.rightAxes.map((a) => a.id)).toEqual(["axis-2"]);
		expect(r.activeXAxesUsed.map((a) => a.id)).toEqual(["axis-1"]);
		expect(Object.keys(r.axisLayout).sort()).toEqual(["axis-1", "axis-2"]);
	});

	it("stacks same-side gutters outward and widens the padding by their sum", () => {
		const { result } = renderHook(() =>
			useChartLayout(
				[series("s1", "d1", "axis-1"), series("s2", "d1", "axis-3")],
				[dataset("d1", "axis-1")],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		);
		const r = result.current;
		const g1 = r.axisLayout["axis-1"].total;
		const g3 = r.axisLayout["axis-3"].total;
		expect(r.leftOffsets).toEqual({ "axis-1": 0, "axis-3": g1 });
		expect(r.rightOffsets).toEqual({});
		expect(r.padding.left).toBe(20 + g1 + g3);
		expect(r.padding.right).toBe(20);
		expect(r.chartWidth).toBe(800 - r.padding.left - r.padding.right);
		expect(r.chartHeight).toBe(600 - r.padding.top - r.padding.bottom);
	});

	it("orders x-axis rows by the first dataset that uses them", () => {
		const { result } = renderHook(() =>
			useChartLayout(
				[
					series("s1", "d1", "axis-1"),
					series("s2", "d2", "axis-1"),
					series("s3", "d3", "axis-1"),
				],
				[dataset("d1", "axis-3"), dataset("d2", "axis-2"), dataset("d3", "axis-3")],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		);
		const r = result.current;
		expect(r.activeXAxesUsed.map((a) => a.id)).toEqual(["axis-3", "axis-2"]);
		expect(r.xAxesMetrics.map((m) => m.id)).toEqual(["axis-3", "axis-2"]);
		// The bottom padding is the sum of the stacked x-axis row heights.
		const rows = r.xAxesMetrics.reduce((s, m) => s + m.height, 0);
		expect(r.padding.bottom).toBe(rows);
		expect(r.xAxesMetrics[1].cumulativeOffset).toBe(r.xAxesMetrics[0].height);
	});

	it("falls back to the default x-axis when a dataset has none", () => {
		const { result } = renderHook(() =>
			useChartLayout(
				[series("s1", "d1", "axis-1")],
				[dataset("d1", "")],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		);
		expect(result.current.activeXAxesUsed.map((a) => a.id)).toEqual(["axis-1"]);
	});

	it("uses the base padding and clamps sizes at zero with no series", () => {
		const { result } = renderHook(() =>
			useChartLayout([], [dataset("d1", "axis-1")], X_AXES, Y_AXES, 10, 10),
		);
		const r = result.current;
		expect(r.activeYAxes).toEqual([]);
		expect(r.xAxesMetrics).toEqual([]);
		expect(r.padding).toEqual({ top: 20, right: 20, bottom: 60, left: 20 });
		expect(r.chartWidth).toBe(0);
		expect(r.chartHeight).toBe(0);
	});

	it("sizes a categorical y gutter from its widest label", () => {
		const short = renderHook(() =>
			useChartLayout(
				[series("s1", "d1", "axis-1")],
				[dataset("d1", "axis-1", col([0, 1], ["a", "b"]))],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		).result.current;
		const long = renderHook(() =>
			useChartLayout(
				[series("s1", "d1", "axis-1")],
				[
					dataset("d1", "axis-1", col([0, 1], ["a", "a much longer category name"])),
				],
				X_AXES,
				Y_AXES,
				800,
				600,
			),
		).result.current;
		expect(short.yAxisCategoryLabels.get("axis-1")).toEqual(["a", "b"]);
		expect(long.axisLayout["axis-1"].label).toBeGreaterThan(
			short.axisLayout["axis-1"].label,
		);
	});

	it("keeps derived values referentially stable across identical renders", () => {
		const s = [series("s1", "d1", "axis-1")];
		const d = [dataset("d1", "axis-1")];
		const { result, rerender } = renderHook(() =>
			useChartLayout(s, d, X_AXES, Y_AXES, 800, 600),
		);
		const first = result.current;
		rerender();
		expect(result.current.padding).toBe(first.padding);
		expect(result.current.axisLayout).toBe(first.axisLayout);
	});
});
