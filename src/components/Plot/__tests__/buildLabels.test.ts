import { describe, expect, it } from "vitest";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "../chartTypes";
import {
	buildLabels,
	createLabelStringCache,
	type LabelBuildContext,
} from "../buildLabels";

const xAxesMetrics: XAxisMetrics[] = [
	{
		id: "x1",
		cumulativeOffset: 0,
		labelBottom: 10,
		secLabelBottom: 25,
		titleBottom: 40,
		height: 50,
		total: 50,
	} as unknown as XAxisMetrics,
];

const baseCtx: LabelBuildContext = {
	width: 800,
	height: 600,
	padding: { top: 10, right: 10, bottom: 10, left: 10 },
	axisLayout: { y1: { total: 40, label: 30 } },
	xAxesMetrics,
	labelColor: "#444",
	secLabelBg: "#555",
	fontFamily: "sans-serif",
	leftOffsets: {},
	rightOffsets: {},
	seriesByXAxisId: {},
	seriesByYAxisId: {},
};

const xAxis = (over: Partial<XAxisLayout> = {}): XAxisLayout =>
	({
		id: "x1",
		position: "bottom",
		min: 0,
		max: 100,
		ticks: { result: [0, 50, 100], precision: 0 },
		title: "X Axis Title",
		color: "",
		showGrid: false,
		...over,
	}) as unknown as XAxisLayout;

const yAxis = (over: Partial<YAxisLayout> = {}): YAxisLayout =>
	({
		id: "y1",
		position: "left",
		min: 0,
		max: 100,
		ticks: [0, 50, 100],
		precision: 0,
		name: "Y",
		color: "#888",
		showGrid: false,
		...over,
	}) as unknown as YAxisLayout;

describe("buildLabels", () => {
	it("emits tick labels and titles for x and y axes", () => {
		const cache = createLabelStringCache();
		const labels = buildLabels([xAxis()], [yAxis()], baseCtx, cache);

		const texts = labels.map((l) => l.text);
		expect(texts).toContain("X Axis Title");
		expect(texts.filter((t) => t === "50")).toHaveLength(2); // x + y tick

		const xTitle = labels.find((l) => l.text === "X Axis Title");
		expect(xTitle?.align).toBe("center");
		expect(xTitle?.font).toBe("bold 12px sans-serif");

		const yTick = labels.find((l) => l.baseline === "middle" && l.text === "50");
		expect(yTick?.align).toBe("right"); // left-positioned axis
	});

	it("filters ticks outside the visible range", () => {
		const cache = createLabelStringCache();
		const labels = buildLabels(
			[xAxis({ ticks: { result: [-50, 150], precision: 0 } as XAxisLayout["ticks"] })],
			[yAxis({ ticks: [-50, 150] })],
			baseCtx,
			cache,
		);
		const texts = labels.map((l) => l.text);
		expect(texts).not.toContain("-50");
		expect(texts).not.toContain("150");
	});

	it("emits secondary labels with background and separator chrome", () => {
		const cache = createLabelStringCache();
		const labels = buildLabels(
			[
				xAxis({
					ticks: {
						result: [0, 50, 100],
						precision: 0,
						secondaryLabels: [
							{ timestamp: 0, label: "Jan 1" },
							{ timestamp: 60, label: "Jan 2" },
						],
					} as XAxisLayout["ticks"],
				}),
			],
			[],
			baseCtx,
			cache,
		);
		const jan1 = labels.find((l) => l.text === "Jan 1");
		const jan2 = labels.find((l) => l.text === "Jan 2");
		expect(jan1?.bg).toBe("#555");
		expect(jan1?.tick).toBeUndefined(); // starts at the left edge
		expect(jan2?.bg).toBe("#555");
		expect(jan2?.tick?.x).toBeGreaterThan(baseCtx.padding.left);
		expect(jan1?.font).toBe("bold 10px sans-serif");
	});

	it("maps category ticks to their names", () => {
		const cache = createLabelStringCache();
		const labels = buildLabels(
			[
				xAxis({
					min: 0,
					max: 2,
					ticks: { result: [0, 1, 2], precision: 0 } as XAxisLayout["ticks"],
					categoryLabels: ["CatA", "CatB", "CatC"],
					categoryTicks: [0, 1, 2],
				}),
			],
			[
				yAxis({
					min: 0,
					max: 2,
					ticks: [0, 1, 2],
					categoryLabels: ["CatY1", "CatY2", "CatY3"],
				}),
			],
			baseCtx,
			cache,
		);
		const texts = labels.map((l) => l.text);
		expect(texts).toContain("CatB");
		expect(texts).toContain("CatY2");
	});

	it("builds a rotated multi-color composite y title from its series", () => {
		const cache = createLabelStringCache();
		const ctx: LabelBuildContext = {
			...baseCtx,
			seriesByYAxisId: {
				y1: [
					{ name: "S1", lineColor: "red", yColumn: "c1" },
					{ name: "S2", lineColor: "blue", yColumn: "c2" },
				] as LabelBuildContext["seriesByYAxisId"]["y1"],
			},
		};
		const labels = buildLabels([], [yAxis()], ctx, cache);
		const title = labels.find((l) => l.segments);
		expect(title?.rot).toBe(-1); // left axis reads bottom-up
		expect(title?.segments?.map((s) => s.text)).toEqual(["S1", " / ", "S2"]);
		expect(title?.segments?.map((s) => s.color)).toEqual([
			"red",
			"#444",
			"blue",
		]);

		const right = buildLabels(
			[],
			[yAxis({ position: "right" })],
			ctx,
			cache,
		).find((l) => l.segments);
		expect(right?.rot).toBe(1);
	});

	it("colors the x title by the single series color on that axis", () => {
		const cache = createLabelStringCache();
		const ctx: LabelBuildContext = {
			...baseCtx,
			seriesByXAxisId: {
				x1: [
					{ name: "S1", lineColor: "red", yColumn: "c1" },
				] as LabelBuildContext["seriesByXAxisId"]["x1"],
			},
		};
		const labels = buildLabels([xAxis()], [], ctx, cache);
		expect(labels.find((l) => l.text === "X Axis Title")?.color).toBe("red");
	});

	it("evicts stale label-string cache entries between frames", () => {
		const cache = createLabelStringCache();
		buildLabels([xAxis()], [], baseCtx, cache);
		expect(cache.byAxis.has("x:x1|0")).toBe(true);

		buildLabels(
			[xAxis({ ticks: { result: [0, 50, 100], precision: 1 } as XAxisLayout["ticks"] })],
			[],
			baseCtx,
			cache,
		);
		expect(cache.byAxis.has("x:x1|0")).toBe(false);
		expect(cache.byAxis.has("x:x1|1")).toBe(true);
	});
});
