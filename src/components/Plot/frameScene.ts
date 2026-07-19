/**
 * Worker-side per-frame scene building: viewport ranges in, packed overlay
 * geometry + label list out. This is what lets the SharedArrayBuffer viewport
 * handoff skip per-frame postMessage entirely — everything derived from the
 * axis ranges (tick layout, grid/spine geometry, labels) is recomputed where
 * the renderer lives, from a slim `SceneContext` that only changes on
 * config/theme/resize.
 *
 * Pure and DOM-free; the main-thread fallback path does not use it (it keeps
 * the classic compute-on-main + setOverlay/setLabels flow).
 */

import type { SeriesConfig, XAxisConfig } from "../../services/persistence";
import { calcYAxisTicks } from "../../utils/axisCalculations";
import {
	buildLabels,
	createLabelStringCache,
	type LabelStringCache,
} from "./buildLabels";
import { buildOverlay } from "./buildOverlay";
import { buildXAxisLayout } from "./buildXAxisLayout";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";
import type { OverlayState } from "./drawOverlay";
import { applyOverlayContext, updateOverlayAxes } from "./overlayAxes";
import type { OverlayXEntry, OverlayYEntry } from "./overlayAxes";
import type { RenderLabel } from "./rendererCore";
import type { ViewportSnapshot } from "./viewportChannel";

/** Everything but min/max of an x axis, in SAB slot order. */
export interface SceneXAxisMeta {
	id: string;
	name: string;
	showGrid: boolean;
	xMode: XAxisConfig["xMode"];
	/** xAxisColumn names of the active datasets on this axis (default title). */
	columnNames: string[];
	categoryLabels?: string[];
	categoryTicks?: number[];
}

/** Everything but min/max of a y axis, in SAB slot order. */
export interface SceneYAxisMeta {
	id: string;
	name: string;
	color: string;
	position: "left" | "right";
	showGrid: boolean;
	categoryLabels?: string[];
}

type SlimSeries = Pick<SeriesConfig, "name" | "yColumn" | "lineColor">;

export interface SceneContext {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	axisLayout: Record<string, { total: number; label: number }>;
	xAxesMetrics: XAxisMetrics[];
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
	labelColor: string;
	secLabelBg: string;
	fontFamily: string;
	seriesByXAxisId: Record<string, SlimSeries[]>;
	seriesByYAxisId: Record<string, SlimSeries[]>;
	xAxesMeta: SceneXAxisMeta[];
	yAxesMeta: SceneYAxisMeta[];
}

interface LayoutCacheEntry<T> {
	key: string;
	layout: T;
}

export interface FrameSceneCaches {
	xLayout: Map<string, LayoutCacheEntry<XAxisLayout>>;
	yLayout: Map<string, LayoutCacheEntry<YAxisLayout>>;
	labelStrings: LabelStringCache;
	overlayScratch: {
		xAxes: OverlayXEntry[];
		yAxes: OverlayYEntry[];
		xAxesMetrics: XAxisMetrics[];
		axisLayout: Record<string, { total: number; label: number }>;
		leftOffsets: Record<string, number>;
		rightOffsets: Record<string, number>;
		axisColor: string;
		zeroLineColor: string;
		gridColor: string;
		plotBg: string;
		estVertexCount?: number;
	};
	overlay: OverlayState;
	/** Invalidates the layout caches when the scene context changes. */
	ctxVersion: number;
}

export const createFrameSceneCaches = (): FrameSceneCaches => ({
	xLayout: new Map(),
	yLayout: new Map(),
	labelStrings: createLabelStringCache(),
	overlayScratch: {
		xAxes: [],
		yAxes: [],
		xAxesMetrics: [],
		axisLayout: {},
		leftOffsets: {},
		rightOffsets: {},
		axisColor: "",
		zeroLineColor: "",
		gridColor: "",
		plotBg: "",
	},
	overlay: { packed: new Float32Array(2048), packedLen: 0, groups: [] },
	ctxVersion: -1,
});

export interface FrameScene {
	overlay: OverlayState;
	labels: RenderLabel[];
	xLayouts: XAxisLayout[];
	yLayouts: YAxisLayout[];
}

/**
 * Build overlay + labels for the given viewport snapshot. Ranges pair with
 * the context's axis metas by index (the writer uses the same order).
 */
export function buildFrameScene(
	ctx: SceneContext,
	ctxVersion: number,
	snap: ViewportSnapshot,
	dpr: number,
	caches: FrameSceneCaches,
): FrameScene {
	if (caches.ctxVersion !== ctxVersion) {
		caches.xLayout.clear();
		caches.yLayout.clear();
		caches.ctxVersion = ctxVersion;
	}
	const { width, height, padding } = ctx;
	const chartWidth = width - padding.left - padding.right;
	const chartHeight = height - padding.top - padding.bottom;

	const xCount = Math.min(snap.xCount, ctx.xAxesMeta.length);
	const yCount = Math.min(snap.yCount, ctx.yAxesMeta.length);

	const xLayouts: XAxisLayout[] = new Array(xCount);
	for (let i = 0; i < xCount; i++) {
		const meta = ctx.xAxesMeta[i];
		const min = snap.ranges[i * 2];
		const max = snap.ranges[i * 2 + 1];
		const key = `${min}|${max}`;
		const cached = caches.xLayout.get(meta.id);
		if (cached && cached.key === key) {
			xLayouts[i] = cached.layout;
			continue;
		}
		const layout = buildXAxisLayout(
			{
				id: meta.id,
				name: meta.name,
				min,
				max,
				showGrid: meta.showGrid,
				xMode: meta.xMode,
			},
			chartWidth,
			ctx.labelColor,
			meta.categoryLabels,
			meta.categoryTicks,
			meta.columnNames.map((c) => ({ xAxisColumn: c })),
		);
		caches.xLayout.set(meta.id, { key, layout });
		xLayouts[i] = layout;
	}

	const yLayouts: YAxisLayout[] = new Array(yCount);
	for (let i = 0; i < yCount; i++) {
		const meta = ctx.yAxesMeta[i];
		const min = snap.ranges[(snap.xCount + i) * 2];
		const max = snap.ranges[(snap.xCount + i) * 2 + 1];
		const key = `${min}|${max}`;
		const cached = caches.yLayout.get(meta.id);
		if (cached && cached.key === key) {
			yLayouts[i] = cached.layout;
			continue;
		}
		const { ticks, precision, actualStep } = calcYAxisTicks(
			min,
			max,
			chartHeight,
			meta.categoryLabels ? 1 : undefined,
			meta.categoryLabels?.length,
		);
		const layout: YAxisLayout = {
			id: meta.id,
			name: meta.name,
			min,
			max,
			position: meta.position,
			color: meta.color,
			showGrid: meta.showGrid,
			ticks,
			precision,
			actualStep,
			categoryLabels: meta.categoryLabels,
		};
		caches.yLayout.set(meta.id, { key, layout });
		yLayouts[i] = layout;
	}

	const scratch = caches.overlayScratch;
	updateOverlayAxes(scratch, xLayouts, yLayouts);
	applyOverlayContext(scratch, {
		xAxesMetrics: ctx.xAxesMetrics,
		axisLayout: ctx.axisLayout,
		leftOffsets: ctx.leftOffsets,
		rightOffsets: ctx.rightOffsets,
		axisColor: ctx.axisColor,
		zeroLineColor: ctx.zeroLineColor,
		gridColor: ctx.gridColor,
		plotBg: ctx.plotBg,
	});
	buildOverlay(scratch, width, height, padding, dpr, caches.overlay);

	const labels = buildLabels(
		xLayouts,
		yLayouts,
		{
			width,
			height,
			padding,
			axisLayout: ctx.axisLayout,
			xAxesMetrics: ctx.xAxesMetrics,
			labelColor: ctx.labelColor,
			secLabelBg: ctx.secLabelBg,
			fontFamily: ctx.fontFamily,
			leftOffsets: ctx.leftOffsets,
			rightOffsets: ctx.rightOffsets,
			seriesByXAxisId: ctx.seriesByXAxisId as Record<string, SeriesConfig[]>,
			seriesByYAxisId: ctx.seriesByYAxisId as Record<string, SeriesConfig[]>,
		},
		caches.labelStrings,
	);

	return { overlay: caches.overlay, labels, xLayouts, yLayouts };
}
