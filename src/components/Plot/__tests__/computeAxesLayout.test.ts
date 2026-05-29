import { describe, expect, it } from "vitest";
import type {
	Dataset,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import {
	buildXAxisLayoutFor,
	buildYAxisLayoutFor,
	computeXAxesLayoutCached,
	computeYAxesLayoutCached,
	createAxesLayoutCache,
	groupActiveDatasetsByXAxis,
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

describe("groupActiveDatasetsByXAxis", () => {
	it("returns an empty object when there are no datasets", () => {
		expect(groupActiveDatasetsByXAxis([], new Set())).toEqual({});
	});

	it("skips datasets not in the active set", () => {
		const ds = makeDataset("ds1", "X");
		expect(groupActiveDatasetsByXAxis([ds], new Set())).toEqual({});
	});

	it("groups active datasets by their xAxisId", () => {
		const a1 = makeDataset("a1", "X");
		const a2 = makeDataset("a2", "X");
		const b = makeDataset("b", "Y");
		const out = groupActiveDatasetsByXAxis(
			[a1, a2, b],
			new Set(["a1", "a2", "b"]),
		);
		expect(out.X).toEqual([a1, a2]);
		expect(out.Y).toEqual([b]);
	});

	it("falls back to the default x-axis id when xAxisId is empty", () => {
		const d = { ...makeDataset("d", "X"), xAxisId: "" };
		const out = groupActiveDatasetsByXAxis([d], new Set(["d"]));
		// fallback id comes from axisCalculations.DEFAULT_X_AXIS_ID
		const ids = Object.keys(out);
		expect(ids).toHaveLength(1);
		expect(out[ids[0]]).toEqual([d]);
	});
});

describe("buildXAxisLayoutFor", () => {
	it("builds a layout for a numeric axis", () => {
		const axis = makeXAxis("X");
		const layout = buildXAxisLayoutFor(axis, 800, "#000", new Map(), {});
		expect(layout.id).toBe("X");
		expect(layout.min).toBe(0);
		expect(layout.max).toBe(100);
	});

	it("forwards category labels from the supplied map", () => {
		const axis = makeXAxis("X", { xMode: "categorical" });
		const layout = buildXAxisLayoutFor(
			axis,
			800,
			"#000",
			new Map([["X", { labels: ["A", "B", "C"] }]]),
			{},
		);
		expect(layout.categoryLabels).toEqual(["A", "B", "C"]);
	});

	it("uses an empty dataset list when the axis has none in dsByX", () => {
		const axis = makeXAxis("X");
		// No throw, just returns a layout
		expect(() =>
			buildXAxisLayoutFor(axis, 800, "#000", new Map(), {}),
		).not.toThrow();
	});
});

describe("buildYAxisLayoutFor", () => {
	it("builds a layout with computed ticks for a numeric axis", () => {
		const axis = makeYAxis("Y");
		const layout = buildYAxisLayoutFor(axis, 600, new Map());
		expect(layout.id).toBe("Y");
		expect(layout.ticks.length).toBeGreaterThan(0);
		expect(layout.categoryLabels).toBeUndefined();
	});

	it("forwards category labels and forces step 1 when categorical", () => {
		const axis = makeYAxis("Y");
		const layout = buildYAxisLayoutFor(
			axis,
			600,
			new Map([["Y", ["A", "B", "C"]]]),
		);
		expect(layout.categoryLabels).toEqual(["A", "B", "C"]);
	});

	it("preserves the original axis fields via spread", () => {
		const axis = makeYAxis("Y", { name: "Pressure", position: "right" });
		const layout = buildYAxisLayoutFor(axis, 600, new Map());
		expect(layout.name).toBe("Pressure");
		expect(layout.position).toBe("right");
	});
});
