import { describe, expect, it } from "vitest";
import type {
	Dataset,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import {
	computeXAxesLayoutCached,
	computeYAxesLayoutCached,
	createAxesLayoutCache,
} from "../computeAxesLayout";
import type { XAxisLayout, YAxisLayout } from "../chartTypes";

function makeXAxis(
	id: string,
	overrides: Partial<XAxisConfig> = {},
): XAxisConfig {
	return {
		id,
		name: id,
		min: 0,
		max: 100,
		showGrid: false,
		xMode: "numeric",
		...overrides,
	};
}

function makeYAxis(
	id: string,
	overrides: Partial<YAxisConfig> = {},
): YAxisConfig {
	return {
		id,
		name: id,
		min: 0,
		max: 100,
		position: "left",
		color: "#000",
		showGrid: false,
		...overrides,
	};
}

function makeDataset(id: string, xAxisId: string): Dataset {
	return {
		id,
		name: id,
		columns: ["x", "y"],
		data: [],
		rowCount: 0,
		xAxisColumn: "x",
		xAxisId,
	};
}

describe("createAxesLayoutCache", () => {
	it("returns an empty cache with no deps key", () => {
		const cache = createAxesLayoutCache<XAxisLayout>();
		expect(cache.entries.size).toBe(0);
		expect(cache.depsKey).toBe("");
	});
});

describe("computeXAxesLayoutCached", () => {
	const baseParams = () => ({
		liveXAxes: [makeXAxis("X")],
		activeXAxesUsed: [makeXAxis("X")],
		datasets: [makeDataset("ds1", "X")],
		activeDsIdsSet: new Set(["ds1"]),
		chartWidth: 800,
		labelColor: "#111",
		xAxisCategoryLabels: new Map(),
		cache: createAxesLayoutCache<XAxisLayout>(),
	});

	it("returns an empty array when liveXAxes is empty", () => {
		const params = baseParams();
		params.liveXAxes = [];
		expect(computeXAxesLayoutCached(params)).toEqual([]);
	});

	it("filters out axes not in activeXAxesUsed", () => {
		const params = baseParams();
		params.liveXAxes = [makeXAxis("X"), makeXAxis("Y")];
		params.activeXAxesUsed = [makeXAxis("X")];
		const out = computeXAxesLayoutCached(params);
		expect(out.map((l) => l.id)).toEqual(["X"]);
	});

	it("returns the same layout object on cache hit", () => {
		const params = baseParams();
		const first = computeXAxesLayoutCached(params);
		const second = computeXAxesLayoutCached(params);
		expect(second[0]).toBe(first[0]);
	});

	it("rebuilds a layout when the axis fields change", () => {
		const params = baseParams();
		const first = computeXAxesLayoutCached(params);
		params.liveXAxes = [makeXAxis("X", { min: 10 })];
		const second = computeXAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
		expect(second[0].min).toBe(10);
	});

	it("invalidates the entire cache when chartWidth changes", () => {
		const params = baseParams();
		params.liveXAxes = [makeXAxis("X"), makeXAxis("X2")];
		params.activeXAxesUsed = [makeXAxis("X"), makeXAxis("X2")];
		const first = computeXAxesLayoutCached(params);
		params.chartWidth = 1000;
		const second = computeXAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
		expect(second[1]).not.toBe(first[1]);
		expect(params.cache.entries.size).toBe(2);
	});

	it("invalidates the entire cache when labelColor changes", () => {
		const params = baseParams();
		const first = computeXAxesLayoutCached(params);
		params.labelColor = "#fff";
		const second = computeXAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
	});

	it("invalidates the entire cache when dataset count changes", () => {
		const params = baseParams();
		const first = computeXAxesLayoutCached(params);
		params.datasets = [makeDataset("ds1", "X"), makeDataset("ds2", "X")];
		params.activeDsIdsSet = new Set(["ds1", "ds2"]);
		const second = computeXAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
	});
});

describe("computeYAxesLayoutCached", () => {
	const baseParams = () => ({
		liveYAxes: [makeYAxis("Y")],
		usedYAxisIdsSet: new Set(["Y"]),
		chartHeight: 600,
		yAxisCategoryLabels: new Map<string, string[] | undefined>(),
		cache: createAxesLayoutCache<YAxisLayout>(),
	});

	it("returns an empty array when liveYAxes is empty", () => {
		const params = baseParams();
		params.liveYAxes = [];
		expect(computeYAxesLayoutCached(params)).toEqual([]);
	});

	it("filters out axes not in usedYAxisIdsSet", () => {
		const params = baseParams();
		params.liveYAxes = [makeYAxis("Y"), makeYAxis("Z")];
		params.usedYAxisIdsSet = new Set(["Y"]);
		const out = computeYAxesLayoutCached(params);
		expect(out.map((l) => l.id)).toEqual(["Y"]);
	});

	it("returns the same layout object on cache hit", () => {
		const params = baseParams();
		const first = computeYAxesLayoutCached(params);
		const second = computeYAxesLayoutCached(params);
		expect(second[0]).toBe(first[0]);
	});

	it("rebuilds a layout when axis fields change", () => {
		const params = baseParams();
		const first = computeYAxesLayoutCached(params);
		params.liveYAxes = [makeYAxis("Y", { position: "right" })];
		const second = computeYAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
		expect(second[0].position).toBe("right");
	});

	it("invalidates the entire cache when chartHeight changes", () => {
		const params = baseParams();
		const first = computeYAxesLayoutCached(params);
		params.chartHeight = 400;
		const second = computeYAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
	});

	it("invalidates the entire cache when the used-axis set size changes", () => {
		const params = baseParams();
		const first = computeYAxesLayoutCached(params);
		params.liveYAxes = [makeYAxis("Y"), makeYAxis("Y2")];
		params.usedYAxisIdsSet = new Set(["Y", "Y2"]);
		const second = computeYAxesLayoutCached(params);
		expect(second[0]).not.toBe(first[0]);
	});

	it("forwards category labels onto the layout", () => {
		const params = baseParams();
		params.yAxisCategoryLabels = new Map([["Y", ["A", "B", "C"]]]);
		const [layout] = computeYAxesLayoutCached(params);
		expect(layout.categoryLabels).toEqual(["A", "B", "C"]);
	});
});
