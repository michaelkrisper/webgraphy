import { describe, expect, it } from "vitest";
import type { XAxisConfig } from "../../../services/persistence";
import {
	buildLabels,
	createLabelStringCache,
	type LabelBuildContext,
} from "../buildLabels";
import { buildXAxisLayout } from "../buildXAxisLayout";
import {
	cullLabels,
	LABEL_MIN_GAP,
	LabelCuller,
	labelExtent,
} from "../labelCollision";
import type { RenderLabel } from "../rendererCore";
import { computeXAxesMetrics } from "../xAxisMetrics";

const fontSize = (l: RenderLabel) =>
	Number.parseFloat(/(\d+(?:\.\d+)?)px/.exec(l.font)?.[1] ?? "10");

// Deliberately generous width estimate (wider than real sans-serif digits) so
// the assertions hold for any plausible font.
const measure = (l: RenderLabel) =>
	l.text.length * fontSize(l) * (l.font.startsWith("bold") ? 0.68 : 0.62);

/** Full on-screen box of a label incl. chrome, mirroring rendererCore. */
function box(l: RenderLabel) {
	const [left, right] = labelExtent(l, measure(l));
	const f = fontSize(l);
	const top = l.bg ? l.y - 12 : l.y - 0.8 * f;
	const bottom = l.bg ? l.y + 2 : l.y + 0.25 * f;
	return { left, right, top, bottom, text: l.text };
}

function overlapping(labels: RenderLabel[]): string[] {
	const boxes = labels.map(box);
	const hits: string[] = [];
	for (let i = 0; i < boxes.length; i++) {
		for (let j = i + 1; j < boxes.length; j++) {
			const a = boxes[i];
			const b = boxes[j];
			if (
				a.left < b.right &&
				b.left < a.right &&
				a.top < b.bottom &&
				b.top < a.bottom
			) {
				hits.push(`${a.text} x ${b.text}`);
			}
		}
	}
	return hits;
}

const ts = (...args: [number, number, number, number?, number?]) =>
	new Date(...(args as [number, number, number, number, number])).getTime() /
	1000;

const WIDTH = 1060;
const HEIGHT = 900;

function sceneLabels(
	axes: { min: number; max: number; title: string }[],
	padding = { top: 20, right: 150, bottom: 0, left: 182 },
) {
	const metrics = computeXAxesMetrics(
		axes.map((_, i) => ({ id: `axis-${i + 1}`, xMode: "date" as const })),
	);
	const pad = {
		...padding,
		bottom: metrics.reduce((s, m) => s + m.height, 0),
	};
	const chartWidth = WIDTH - pad.left - pad.right;
	const layouts = axes.map((a, i) =>
		buildXAxisLayout(
			{
				id: `axis-${i + 1}`,
				name: a.title,
				min: a.min,
				max: a.max,
				showGrid: false,
				xMode: "date",
			} as XAxisConfig,
			chartWidth,
			"#444",
			undefined,
			undefined,
			[],
		),
	);
	const ctx: LabelBuildContext = {
		width: WIDTH,
		height: HEIGHT,
		padding: pad,
		axisLayout: {},
		xAxesMetrics: metrics,
		labelColor: "#444",
		secLabelBg: "#fff",
		fontFamily: "sans-serif",
		leftOffsets: {},
		rightOffsets: {},
		seriesByXAxisId: {},
		seriesByYAxisId: {},
	};
	return buildLabels(layouts, [], ctx, createLabelStringCache());
}

const texts = (labels: RenderLabel[]) => labels.map((l) => l.text);

describe("labelExtent", () => {
	it("anchors by alignment", () => {
		const base = { x: 100, y: 0 };
		expect(labelExtent({ ...base, align: "left" }, 40)).toEqual([100, 140]);
		expect(labelExtent({ ...base, align: "center" }, 40)).toEqual([80, 120]);
		expect(labelExtent({ ...base, align: "right" }, 40)).toEqual([60, 100]);
	});

	it("includes background padding and the separator stroke", () => {
		expect(
			labelExtent(
				{ x: 105, align: "left", bg: "#fff", tick: { x: 100, color: "#000" } },
				40,
			),
		).toEqual([99, 147]);
	});
});

describe("LabelCuller", () => {
	const lbl = (x: number, cullGroup?: string): RenderLabel => ({
		text: "",
		color: "#000",
		font: "10px sans-serif",
		x,
		y: 0,
		align: "left",
		baseline: "alphabetic",
		cullGroup,
	});

	it("drops a later label that comes within the minimum gap of a kept one", () => {
		const c = new LabelCuller();
		expect(c.accept(lbl(0, "g"), 50)).toBe(true);
		expect(c.accept(lbl(50 + LABEL_MIN_GAP - 1, "g"), 50)).toBe(false);
		expect(c.accept(lbl(50 + LABEL_MIN_GAP, "g"), 50)).toBe(true);
	});

	it("only culls within a group and never ungrouped labels", () => {
		const c = new LabelCuller();
		expect(c.accept(lbl(0, "a"), 50)).toBe(true);
		expect(c.accept(lbl(10, "b"), 50)).toBe(true);
		expect(c.accept(lbl(10), 50)).toBe(true);
		expect(c.accept(lbl(10), 50)).toBe(true);
	});

	it("forgets accepted labels on reset", () => {
		const c = new LabelCuller();
		expect(c.accept(lbl(0, "g"), 50)).toBe(true);
		c.reset();
		expect(c.accept(lbl(10, "g"), 50)).toBe(true);
	});
});

describe("x-axis period labels never overlap", () => {
	it("hides the pinned leading month when the next boundary is too close (12/2025|01/2026)", () => {
		// Auto-scale padding puts the axis start a few hours before the first
		// month boundary, so "12/2025" would be pinned right next to "01/2026".
		const raw = sceneLabels([
			{ min: ts(2025, 11, 31, 18), max: ts(2026, 0, 8, 6), title: "Timestamp" },
		]);
		expect(texts(raw)).toEqual(expect.arrayContaining(["12/2025", "01/2026"]));
		expect(overlapping(raw)).not.toEqual([]);

		const shown = cullLabels(raw, measure);
		expect(texts(shown)).toContain("01/2026");
		expect(texts(shown)).not.toContain("12/2025");
		expect(overlapping(shown)).toEqual([]);
	});

	it("keeps the pinned leading month when there is room before the next boundary", () => {
		const shown = cullLabels(
			sceneLabels([
				{ min: ts(2025, 11, 10), max: ts(2026, 0, 20), title: "Timestamp" },
			]),
			measure,
		);
		expect(texts(shown)).toEqual(expect.arrayContaining(["12/2025", "01/2026"]));
		expect(overlapping(shown)).toEqual([]);
	});

	it("drops the pinned day when a day boundary sits exactly on the left edge (81.02.2025)", () => {
		const raw = sceneLabels([
			{ min: ts(2025, 1, 1), max: ts(2025, 1, 1, 0, 33), title: "time" },
		]);
		const pinnedAndEdge = raw.filter((l) => l.bg && l.x === 182 + 5);
		expect(texts(pinnedAndEdge).sort()).toEqual(["01.02.2025", "31.01.2025"]);

		const shown = cullLabels(raw, measure);
		expect(texts(shown)).toContain("01.02.2025");
		expect(texts(shown)).not.toContain("31.01.2025");
		expect(overlapping(shown)).toEqual([]);
	});

	it("keeps two stacked date axes (tick, period, title rows) clear of each other", () => {
		const shown = cullLabels(
			sceneLabels([
				{ min: ts(2025, 11, 31, 18), max: ts(2026, 0, 8, 6), title: "Timestamp" },
				{ min: ts(2025, 1, 1), max: ts(2025, 1, 1, 0, 33), title: "time" },
			]),
			measure,
		);
		expect(texts(shown).filter((t) => t === "Timestamp")).toHaveLength(1);
		expect(overlapping(shown)).toEqual([]);
	});

	it.each([
		["hours", ts(2025, 2, 30, 20), ts(2025, 2, 31, 4)],
		["days", ts(2025, 0, 30), ts(2025, 2, 2)],
		["weeks", ts(2024, 0, 1), ts(2025, 6, 1)],
		["months", ts(2015, 0, 1), ts(2025, 0, 1)],
		["decades", ts(1900, 0, 1), ts(2025, 0, 1)],
	])("leaves no overlapping labels over a %s range", (_, min, max) => {
		for (let shift = 0; shift < 1; shift += 0.125) {
			const d = (max - min) * shift;
			const shown = cullLabels(
				sceneLabels([{ min: min + d, max: max + d, title: "t" }]),
				measure,
			);
			expect(overlapping(shown)).toEqual([]);
		}
	});
});
