/**
 * Builds the packed screen-space overlay geometry (background quad, grid,
 * zero lines, spines, ticks, arrow triangles) for one frame. Pure CPU-side
 * math: writes (x,y) pairs into `ov.packed` and group descriptors into
 * `ov.groups`; uploading and drawing happen in the renderer core. Runs on
 * the main thread because it needs theme colors and axis layout — the
 * result is small and cheap to hand to the render worker per frame.
 */

import { hexToRgbaWithAlpha } from "../../utils/colors";
import type { OverlayState } from "./drawSeries";
import { estimateOverlayVertexCount } from "./overlayAxes";
import {
	writeAxisArrows,
	writeBackgroundQuad,
	writeFramePlotBorder,
	writeXAxisLines,
	writeXGridLines,
	writeXZeroLine,
	writeYAxisLines,
	writeYGridLines,
	writeYZeroLines,
	writeZeroLineArrows,
} from "./overlayGeometry";

export interface OverlayInput {
	xAxes: Array<{
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		categoryLabels?: string[];
	}>;
	yAxes: Array<{
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		position: "left" | "right";
		categoryLabels?: string[];
	}>;
	xAxesMetrics: Array<{ id: string; cumulativeOffset: number }>;
	axisLayout: Record<string, { total: number; label: number }>;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
	estVertexCount?: number;
}

export function buildOverlay(
	overlay: OverlayInput,
	w: number,
	h: number,
	pad: { left: number; right: number; top: number; bottom: number },
	dpr: number,
	ov: OverlayState,
): void {
	const cw = w - pad.left - pad.right;
	const ch = h - pad.top - pad.bottom;

	const gridRgba = hexToRgbaWithAlpha(overlay.gridColor, 1);
	const axisRgba = hexToRgbaWithAlpha(overlay.axisColor, 1);
	const zeroRgba = hexToRgbaWithAlpha(overlay.zeroLineColor, 1);
	const bgRgba = hexToRgbaWithAlpha(overlay.plotBg, 1);

	// Estimate vertex count and grow packed buffer as needed.
	const est =
		overlay.estVertexCount ??
		estimateOverlayVertexCount(overlay.xAxes, overlay.yAxes);
	if (ov.packed.length < est)
		ov.packed = new Float32Array(Math.max(est, ov.packed.length * 2));
	const buf = ov.packed;
	let p = 0;
	ov.groups.length = 0;

	// --- Background quad (TRIANGLES) ---
	const bgStart = p / 2;
	p = writeBackgroundQuad(buf, p, pad, cw, ch, dpr);
	ov.groups.push({
		topology: "TRIANGLES",
		rgba: bgRgba,
		width: 1,
		offset: bgStart,
		count: 6,
	});

	// Grid: vertical (first x axis) + horizontal (y axes that show grid).
	const gridStart = p / 2;
	if (overlay.xAxes.length > 0) {
		p = writeXGridLines(buf, p, overlay.xAxes[0], pad, cw, ch, dpr);
	}
	p = writeYGridLines(buf, p, overlay.yAxes, pad, w, ch, dpr);
	const gridCount = p / 2 - gridStart;
	if (gridCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: gridRgba,
			width: 1,
			offset: gridStart,
			count: gridCount,
		});

	// Zero lines (horizontal for y-axes, vertical for first x-axis).
	const zeroLineStart = p / 2;
	p = writeYZeroLines(buf, p, overlay.yAxes, pad, w, ch, dpr);
	if (overlay.xAxes.length > 0) {
		p = writeXZeroLine(buf, p, overlay.xAxes[0], pad, cw, h, dpr);
	}
	const zeroLineCount = p / 2 - zeroLineStart;
	if (zeroLineCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: zeroRgba,
			width: 1.5,
			offset: zeroLineStart,
			count: zeroLineCount,
		});

	// Axis lines: frame spines + x/y axis lines + tick marks.
	const axisLineStart = p / 2;
	p = writeFramePlotBorder(buf, p, pad, w, ch, dpr);
	p = writeXAxisLines(
		buf,
		p,
		overlay.xAxes,
		overlay.xAxesMetrics,
		pad,
		w,
		h,
		cw,
		dpr,
	);
	p = writeYAxisLines(
		buf,
		p,
		overlay.yAxes,
		overlay.axisLayout,
		overlay.leftOffsets,
		overlay.rightOffsets,
		pad,
		w,
		h,
		ch,
		dpr,
	);
	const axisLineCount = p / 2 - axisLineStart;
	if (axisLineCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: axisRgba,
			width: 1,
			offset: axisLineStart,
			count: axisLineCount,
		});

	// Zero-line arrow triangles.
	const zeroTriStart = p / 2;
	p = writeZeroLineArrows(
		buf,
		p,
		overlay.yAxes,
		overlay.xAxes[0],
		pad,
		w,
		cw,
		ch,
		dpr,
	);
	const zeroTriCount = p / 2 - zeroTriStart;
	if (zeroTriCount > 0)
		ov.groups.push({
			topology: "TRIANGLES",
			rgba: zeroRgba,
			width: 1,
			offset: zeroTriStart,
			count: zeroTriCount,
		});

	// Axis arrow triangles (x/y).
	const axisTriStart = p / 2;
	p = writeAxisArrows(
		buf,
		p,
		overlay.xAxes,
		overlay.xAxesMetrics,
		overlay.yAxes,
		overlay.axisLayout,
		overlay.leftOffsets,
		overlay.rightOffsets,
		pad,
		w,
		h,
		dpr,
	);
	const axisTriCount = p / 2 - axisTriStart;
	if (axisTriCount > 0)
		ov.groups.push({
			topology: "TRIANGLES",
			rgba: axisRgba,
			width: 1,
			offset: axisTriStart,
			count: axisTriCount,
		});

	ov.packedLen = p;
}
