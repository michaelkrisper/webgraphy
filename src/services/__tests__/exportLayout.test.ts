import { describe, expect, it } from "vitest";
import {
	estimateTextWidth,
	fitText,
	LEGEND,
	type LegendEntry,
	layoutDecorations,
	legendEntries,
	measureLegend,
	measureLegendRows,
	type Padding,
	type Rect,
	rectsIntersect,
	TITLE,
} from "../exportLayout";
import type { SeriesConfig } from "../persistence";

const series = (o: Partial<SeriesConfig> & { id: string }): SeriesConfig => ({
	sourceId: "ds",
	name: o.id,
	yColumn: "y",
	yAxisId: "axis-1",
	pointStyle: "none",
	pointColor: "#000",
	lineStyle: "solid",
	lineColor: "#000",
	...o,
});

const entries = (n: number, name = "Series"): LegendEntry[] =>
	Array.from({ length: n }, (_, i) =>
		series({ id: `s${i}`, name: `${name} ${i}` }),
	);

// Two left axes (2 × 50 px), one right axis (60 px), three stacked x axes.
const AXES = { left: 100, right: 60, xAxes: 3 };
const basePadding: Padding = {
	top: 20,
	right: 20 + AXES.right,
	bottom: 60 + (AXES.xAxes - 1) * 60,
	left: 20 + AXES.left,
};

/** The regions the axes draw into, for the final padding. */
const axisRegions = (width: number, height: number, p: Padding) => {
	const plot: Rect = {
		x: p.left,
		y: p.top,
		width: width - p.left - p.right,
		height: height - p.top - p.bottom,
	};
	return {
		plot,
		leftGutter: {
			x: p.left - AXES.left,
			y: p.top,
			width: AXES.left,
			height: plot.height,
		},
		// Right axes plus the 8 px overhang of axis lines and zero-line arrows.
		rightGutter: {
			x: plot.x + plot.width,
			y: p.top,
			width: Math.max(AXES.right, 8),
			height: plot.height,
		},
		// Ticks, labels and titles of every stacked x axis, plus the arrow above.
		xAxes: {
			x: p.left,
			y: plot.y + plot.height,
			width: plot.width + 8,
			height: p.bottom,
		},
		topArrow: { x: p.left, y: p.top - 8, width: plot.width, height: 8 },
	};
};

const expectClear = (box: Rect, regions: Record<string, Rect>) => {
	for (const [name, r] of Object.entries(regions))
		expect(rectsIntersect(box, r), `overlaps ${name}`).toBe(false);
};

const contains = (outer: Rect, inner: Rect) =>
	inner.x >= outer.x &&
	inner.y >= outer.y &&
	inner.x + inner.width <= outer.x + outer.width &&
	inner.y + inner.height <= outer.y + outer.height;

describe("legendEntries", () => {
	it("lists only drawn series, in order, with their styles", () => {
		const result = legendEntries([
			series({
				id: "a",
				name: "Alpha",
				lineStyle: "dashed",
				pointStyle: "circle",
			}),
			series({ id: "hidden", hidden: true }),
			series({ id: "nothing", lineStyle: "none", pointStyle: "none" }),
			series({
				id: "pts",
				lineStyle: "none",
				pointStyle: "cross",
				pointColor: "#f00",
			}),
		]);
		expect(result).toEqual([
			{
				id: "a",
				name: "Alpha",
				lineColor: "#000",
				lineStyle: "dashed",
				pointColor: "#000",
				pointStyle: "circle",
			},
			{
				id: "pts",
				name: "pts",
				lineColor: "#000",
				lineStyle: "none",
				pointColor: "#f00",
				pointStyle: "cross",
			},
		]);
	});
});

describe("fitText", () => {
	const mono = (t: string, px: number) => t.length * px;
	it("keeps text that fits", () => {
		expect(fitText("abc", 30, mono, 10)).toBe("abc");
	});
	it("shortens with an ellipsis", () => {
		expect(fitText("abcdefgh", 50, mono, 10)).toBe("abcd…");
	});
	it("returns nothing when not even one character fits", () => {
		expect(fitText("abc", 5, mono, 10)).toBe("");
	});
});

describe("measureLegend", () => {
	it("stacks entries in one column while they fit", () => {
		const b = measureLegend(entries(3), 500, estimateTextWidth);
		expect([b.rows, b.columns]).toEqual([3, 1]);
		expect(b.height).toBe(3 * LEGEND.rowHeight + 2 * LEGEND.padY);
		expect(b.width).toBe(b.columnWidth);
	});

	it("flows into further columns when too tall", () => {
		const b = measureLegend(
			entries(10),
			4 * LEGEND.rowHeight + 2 * LEGEND.padY,
			estimateTextWidth,
		);
		expect([b.rows, b.columns]).toEqual([4, 3]);
		expect(b.width).toBe(3 * b.columnWidth);
	});

	it("truncates very long names", () => {
		const b = measureLegend(
			[series({ id: "x", name: "y".repeat(200) })],
			500,
			estimateTextWidth,
		);
		expect(b.items[0].label.endsWith("…")).toBe(true);
		expect(
			estimateTextWidth(b.items[0].label, LEGEND.fontPx),
		).toBeLessThanOrEqual(LEGEND.maxLabelWidth);
	});
});

describe("layoutDecorations", () => {
	const W = 1000;
	const H = 700;
	const run = (o: Partial<Parameters<typeof layoutDecorations>[0]>) =>
		layoutDecorations({
			width: W,
			height: H,
			padding: basePadding,
			rightAxesWidth: AXES.right,
			entries: [],
			legendPosition: null,
			...o,
		});

	it("reserves nothing without title or legend", () => {
		const d = run({ entries: entries(3) });
		expect(d.reserve).toEqual({ top: 0, right: 0 });
		expect(d.padding).toEqual(basePadding);
		expect(d.legend).toBeUndefined();
		expect(d.title).toBeUndefined();
	});

	it("puts the title above the plot without touching any axis", () => {
		const d = run({ title: "  Pressure over time  " });
		expect(d.reserve.top).toBe(TITLE.blockHeight);
		expect(d.title?.text).toBe("Pressure over time");
		const box = d.title?.box as Rect;
		expect(box.y).toBeGreaterThanOrEqual(0);
		expectClear(box, axisRegions(W, H, d.padding));
		// Centred over the plot area.
		const { plot } = axisRegions(W, H, d.padding);
		expect(box.x + box.width / 2).toBeCloseTo(plot.x + plot.width / 2);
	});

	it("keeps an overlong title inside the image", () => {
		const d = run({ title: "T".repeat(400) });
		const box = d.title?.box as Rect;
		expect(d.title?.text.endsWith("…")).toBe(true);
		expect(box.x).toBeGreaterThanOrEqual(0);
		expect(box.x + box.width).toBeLessThanOrEqual(W);
	});

	it.each(["top-right", "top-left", "bottom-right", "bottom-left"] as const)(
		"places a %s legend inside the plot area",
		(pos) => {
			const d = run({ entries: entries(3), legendPosition: pos, title: "T" });
			expect(d.legend?.placement).toBe(pos);
			expect(d.reserve.right).toBe(0);
			const { plot, ...axes } = axisRegions(W, H, d.padding);
			const box = d.legend?.box as Rect;
			expect(contains(plot, box)).toBe(true);
			expectClear(box, axes);
			expect(rectsIntersect(box, d.title?.box as Rect)).toBe(false);
			const inset = LEGEND.inset;
			if (pos.endsWith("left")) expect(box.x).toBe(plot.x + inset);
			else expect(box.x + box.width).toBe(plot.x + plot.width - inset);
			if (pos.startsWith("top")) expect(box.y).toBe(plot.y + inset);
			else expect(box.y + box.height).toBe(plot.y + plot.height - inset);
		},
	);

	it("reserves a column right of the right axes for an outside legend", () => {
		const d = run({
			entries: entries(4),
			legendPosition: "outside-right",
			title: "T",
		});
		const box = d.legend?.box as Rect;
		expect(d.reserve.right).toBe(box.width + LEGEND.gap);
		const regions = axisRegions(W, H, d.padding);
		expectClear(box, regions);
		expect(box.x).toBeGreaterThanOrEqual(regions.rightGutter.x + AXES.right);
		expect(box.x + box.width).toBeLessThanOrEqual(W);
		expect(box.y).toBe(d.padding.top);
		expect(rectsIntersect(box, d.title?.box as Rect)).toBe(false);
	});

	it("auto keeps a small legend top-right, as on screen", () => {
		expect(
			run({ entries: entries(3), legendPosition: "auto" }).legend?.placement,
		).toBe("top-right");
	});

	it("auto moves a legend that would bury the data outside", () => {
		const d = run({ entries: entries(40), legendPosition: "auto" });
		expect(d.legend?.placement).toBe("outside-right");
		expect(d.legend?.block.columns).toBeGreaterThan(1);
		expectClear(d.legend?.box as Rect, axisRegions(W, H, d.padding));
	});

	it.each(["bottom-left", "outside-right", "auto"] as const)(
		"moves a %s legend that does not fit into a band above the plot",
		(pos) => {
			const width = 420;
			const d = run({
				entries: entries(5, "A very long series name that goes on"),
				legendPosition: pos,
				width,
				title: "Narrow figure",
			});
			expect(d.legend?.placement).toBe("top");
			expect(d.reserve.right).toBe(0);
			const box = d.legend?.box as Rect;
			expect(d.reserve.top).toBe(TITLE.blockHeight + box.height);
			expect(box.x).toBeGreaterThanOrEqual(0);
			expect(box.x + box.width).toBeLessThanOrEqual(width);
			expectClear(box, axisRegions(width, H, d.padding));
			expect(rectsIntersect(box, d.title?.box as Rect)).toBe(false);
			// The plot keeps its full width; only its top moves down.
			expect(d.padding.right).toBe(basePadding.right);
		},
	);

	it("flows a top band legend in rows", () => {
		const b = measureLegendRows(entries(5), 250, estimateTextWidth);
		expect(b.flow).toBe("row");
		expect(b.columns).toBe(Math.floor(250 / b.columnWidth));
		expect(b.rows).toBe(Math.ceil(5 / b.columns));
		expect(b.width).toBeLessThanOrEqual(250);
	});

	it("puts a top band at the image top when there is no title", () => {
		const d = run({
			entries: entries(5, "A very long series name that goes on"),
			legendPosition: "top-right",
			width: 420,
		});
		expect(d.legend?.placement).toBe("top");
		expect(d.legend?.box.y).toBe(TITLE.top);
		expectClear(d.legend?.box as Rect, axisRegions(420, H, d.padding));
	});

	it("shows no legend when no series is drawn", () => {
		expect(run({ entries: [], legendPosition: "auto" }).legend).toBeUndefined();
	});
});
