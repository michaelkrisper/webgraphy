import { describe, expect, it } from "vitest";
import {
	buildFrameScene,
	createFrameSceneCaches,
	type SceneContext,
} from "../frameScene";
import {
	createViewportSnapshot,
	type ViewportSnapshot,
} from "../viewportChannel";

const ctx: SceneContext = {
	width: 800,
	height: 600,
	padding: { top: 10, right: 10, bottom: 60, left: 10 },
	axisLayout: { "axis-1": { total: 40, label: 30 } },
	xAxesMetrics: [
		{
			id: "axis-1",
			height: 50,
			labelBottom: 10,
			secLabelBottom: 25,
			titleBottom: 40,
			cumulativeOffset: 0,
		},
	],
	leftOffsets: {},
	rightOffsets: {},
	axisColor: "#3a3a35",
	zeroLineColor: "#a09c93",
	gridColor: "#ececea",
	plotBg: "#ffffff",
	labelColor: "#6b6760",
	secLabelBg: "rgba(255,255,255,0.93)",
	fontFamily: "sans-serif",
	seriesByXAxisId: {},
	seriesByYAxisId: {
		"axis-1": [{ name: "Temp", yColumn: "t", lineColor: "#4589ff" }],
	},
	xAxesMeta: [
		{
			id: "axis-1",
			name: "",
			showGrid: true,
			xMode: "numeric",
			columnNames: ["Time"],
		},
	],
	yAxesMeta: [
		{
			id: "axis-1",
			name: "Axis 1",
			color: "#475569",
			position: "left",
			showGrid: true,
		},
	],
};

function snap(
	x: [number, number],
	y: [number, number],
): ViewportSnapshot {
	const s = createViewportSnapshot();
	s.version = 1;
	s.xCount = 1;
	s.yCount = 1;
	s.ranges[0] = x[0];
	s.ranges[1] = x[1];
	s.ranges[2] = y[0];
	s.ranges[3] = y[1];
	return s;
}

describe("buildFrameScene", () => {
	it("derives overlay geometry and labels from viewport ranges", () => {
		const caches = createFrameSceneCaches();
		const scene = buildFrameScene(ctx, 1, snap([0, 100], [0, 50]), 1, caches);

		expect(scene.overlay.packedLen).toBeGreaterThan(0);
		expect(scene.overlay.groups.length).toBeGreaterThan(0);

		const texts = scene.labels.map((l) => l.text);
		expect(texts).toContain("50"); // x tick
		expect(texts).toContain("Time"); // default x title from column names
		const yTitle = scene.labels.find((l) => l.segments);
		expect(yTitle?.segments?.[0].text).toBe("Temp");

		expect(scene.xLayouts[0].min).toBe(0);
		expect(scene.yLayouts[0].max).toBe(50);
	});

	it("caches per-axis layouts across frames with unchanged ranges", () => {
		const caches = createFrameSceneCaches();
		const a = buildFrameScene(ctx, 1, snap([0, 100], [0, 50]), 1, caches);
		const b = buildFrameScene(ctx, 1, snap([0, 100], [0, 50]), 1, caches);
		expect(b.xLayouts[0]).toBe(a.xLayouts[0]);
		expect(b.yLayouts[0]).toBe(a.yLayouts[0]);

		// Range change recomputes; context version change wipes the caches.
		const c = buildFrameScene(ctx, 1, snap([0, 200], [0, 50]), 1, caches);
		expect(c.xLayouts[0]).not.toBe(a.xLayouts[0]);
		expect(c.yLayouts[0]).toBe(a.yLayouts[0]);
		const d = buildFrameScene(ctx, 2, snap([0, 200], [0, 50]), 1, caches);
		expect(d.yLayouts[0]).not.toBe(a.yLayouts[0]);
	});

	it("emits date ticks with secondary labels for date-mode x axes", () => {
		const caches = createFrameSceneCaches();
		const dateCtx: SceneContext = {
			...ctx,
			xAxesMeta: [{ ...ctx.xAxesMeta[0], xMode: "date" }],
		};
		// Two days in epoch seconds.
		const t0 = Math.floor(new Date(2026, 0, 1).getTime() / 1000);
		const scene = buildFrameScene(
			dateCtx,
			1,
			snap([t0, t0 + 2 * 86400], [0, 50]),
			1,
			caches,
		);
		const secondary = scene.labels.filter((l) => l.bg);
		expect(secondary.length).toBeGreaterThan(0);
	});
});
