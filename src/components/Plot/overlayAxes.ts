// Copies axis-layout snapshots into a long-lived overlay-scratch buffer for
// the WebGL renderer, in place — entries are reused across frames to avoid
// allocations during pan/zoom — and updates an estimated vertex count used to
// size the renderer's GPU buffers. Extracted from ChartContainer so the
// transformation can be exercised independently.

import type { XAxisLayout, YAxisLayout } from "./chartTypes";

export interface OverlayXEntry {
	id: string;
	min: number;
	max: number;
	showGrid: boolean;
	ticks: number[];
	categoryLabels?: string[];
}

export interface OverlayYEntry {
	id: string;
	min: number;
	max: number;
	showGrid: boolean;
	ticks: number[];
	position: "left" | "right";
	categoryLabels?: string[];
}

interface OverlayScratch {
	xAxes: OverlayXEntry[];
	yAxes: OverlayYEntry[];
	estVertexCount?: number;
}

// Baseline vertex budget covering chart-frame primitives that are always drawn
// (plot border, zero-axis line, padding triangles).
const BASE_VERTEX_COUNT = 12 + 12 + 32;

interface VertexCountAxis {
	ticks: { length: number };
	showGrid: boolean;
}

/**
 * Conservative upper bound on the vertices the overlay draw step will emit
 * for the given axis set: baseline frame + per-axis label/tick + optional
 * grid contributions (only the first x-axis carries vertical grid lines).
 * Used to grow the renderer's packed buffer ahead of time.
 */
export function estimateOverlayVertexCount(
	xAxes: readonly VertexCountAxis[],
	yAxes: readonly VertexCountAxis[],
): number {
	let est = BASE_VERTEX_COUNT;
	if (xAxes[0]?.showGrid) est += xAxes[0].ticks.length * 4;
	for (const ax of xAxes) est += (ax.ticks.length + 1) * 4 + 6;
	for (const ax of yAxes) {
		if (ax.showGrid) est += ax.ticks.length * 4;
		est += (ax.ticks.length + 1) * 4 + 6;
	}
	return est;
}

export function updateOverlayAxes(
	scratch: OverlayScratch,
	xLayout: XAxisLayout[],
	yLayout: YAxisLayout[],
): void {
	const sx = scratch.xAxes;
	sx.length = xLayout.length;
	for (let i = 0; i < xLayout.length; i++) {
		const a = xLayout[i];
		let entry = sx[i];
		if (!entry) {
			entry = {
				id: a.id,
				min: a.min,
				max: a.max,
				showGrid: a.showGrid,
				ticks: [],
				categoryLabels: a.categoryLabels,
			};
			sx[i] = entry;
		} else {
			entry.id = a.id;
			entry.min = a.min;
			entry.max = a.max;
			entry.showGrid = a.showGrid;
			entry.categoryLabels = a.categoryLabels;
		}
		const src = a.ticks.result;
		const dst = entry.ticks;
		dst.length = src.length;
		for (let j = 0; j < src.length; j++) {
			const t = src[j];
			dst[j] = typeof t === "number" ? t : t.timestamp;
		}
	}
	const sy = scratch.yAxes;
	sy.length = yLayout.length;
	for (let i = 0; i < yLayout.length; i++) {
		const a = yLayout[i];
		let entry = sy[i];
		if (!entry) {
			entry = {
				id: a.id,
				min: a.min,
				max: a.max,
				showGrid: a.showGrid,
				ticks: a.ticks,
				position: a.position,
				categoryLabels: a.categoryLabels,
			};
			sy[i] = entry;
		} else {
			entry.id = a.id;
			entry.min = a.min;
			entry.max = a.max;
			entry.showGrid = a.showGrid;
			entry.ticks = a.ticks;
			entry.position = a.position;
			entry.categoryLabels = a.categoryLabels;
		}
	}

	scratch.estVertexCount = estimateOverlayVertexCount(sx, sy);
}

interface XAxisMetricsEntry {
	id: string;
	cumulativeOffset: number;
	height: number;
}

interface OverlayContextScratch {
	xAxesMetrics: XAxisMetricsEntry[];
	axisLayout: Record<string, { total: number; label: number }>;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
}

interface OverlayContext {
	xAxesMetrics: XAxisMetricsEntry[];
	axisLayout: Record<string, { total: number; label: number }>;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
}

/**
 * Copy the per-frame "static" overlay context (axis metrics, gutter layout,
 * left/right offsets, theme colours) onto the long-lived scratch buffer that
 * the WebGL renderer reads each frame. Mutates the scratch in place.
 */
export function applyOverlayContext(
	scratch: OverlayContextScratch,
	ctx: OverlayContext,
): void {
	scratch.xAxesMetrics = ctx.xAxesMetrics;
	scratch.axisLayout = ctx.axisLayout;
	scratch.leftOffsets = ctx.leftOffsets;
	scratch.rightOffsets = ctx.rightOffsets;
	scratch.axisColor = ctx.axisColor;
	scratch.zeroLineColor = ctx.zeroLineColor;
	scratch.gridColor = ctx.gridColor;
	scratch.plotBg = ctx.plotBg;
}
