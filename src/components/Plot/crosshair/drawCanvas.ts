import type { SnapResult } from "./types";

// Highlighted-point marker glyph sizes (px): a white "halo" drawn behind the
// smaller colored glyph. Square side = half * 2; circle radius = half.
const MARKER_OUTER_HALF = 6.5;
const MARKER_INNER_HALF = 5.5;

interface DrawCanvasParams {
	canvas: HTMLCanvasElement | null;
	snap: SnapResult | null;
	pos: { x: number; y: number } | null;
	isPanning: boolean;
	snapLineColor: string;
	padding: { top: number; right: number; bottom: number; left: number };
	width: number;
	height: number;
	plotBg: string;
}

export function drawCanvas({
	canvas,
	snap,
	pos,
	isPanning,
	snapLineColor,
	padding,
	width,
	height,
	plotBg,
}: DrawCanvasParams) {
	if (!canvas) return;
	const ctx = canvas.getContext("2d");
	if (!ctx) return;
	const dpr = window.devicePixelRatio || 1;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	if (!snap || isPanning || !pos) return;

	ctx.save();
	ctx.scale(dpr, dpr);

	ctx.strokeStyle = snapLineColor;
	ctx.lineWidth = 1;
	ctx.setLineDash([3, 3]);
	ctx.beginPath();
	ctx.moveTo(pos.x, padding.top);
	ctx.lineTo(pos.x, height - padding.bottom);
	ctx.stroke();

	ctx.setLineDash([]);
	for (const group of snap.entries) {
		for (const item of group.items) {
			const { xScreen: xs, yScreen: ys, pointStyle: style, color } = item;

			// Skip markers for points outside the plot area — they would
			// otherwise draw over axis labels/titles in the gutters.
			if (
				ys < padding.top ||
				ys > height - padding.bottom ||
				xs < padding.left ||
				xs > width - padding.right
			) {
				continue;
			}

			if (style === "square") {
				ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
				ctx.fillRect(
					xs - MARKER_OUTER_HALF,
					ys - MARKER_OUTER_HALF,
					MARKER_OUTER_HALF * 2,
					MARKER_OUTER_HALF * 2,
				);
				ctx.fillStyle = color;
				ctx.fillRect(
					xs - MARKER_INNER_HALF,
					ys - MARKER_INNER_HALF,
					MARKER_INNER_HALF * 2,
					MARKER_INNER_HALF * 2,
				);
				ctx.strokeStyle = plotBg;
				ctx.lineWidth = 2.5;
				ctx.strokeRect(
					xs - MARKER_INNER_HALF,
					ys - MARKER_INNER_HALF,
					MARKER_INNER_HALF * 2,
					MARKER_INNER_HALF * 2,
				);
			} else if (style === "cross") {
				ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
				ctx.lineWidth = 5.0;
				ctx.beginPath();
				ctx.moveTo(xs - MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
				ctx.lineTo(xs + MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
				ctx.moveTo(xs + MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
				ctx.lineTo(xs - MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
				ctx.stroke();

				ctx.strokeStyle = color;
				ctx.lineWidth = 2.5;
				ctx.beginPath();
				ctx.moveTo(xs - MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
				ctx.lineTo(xs + MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
				ctx.moveTo(xs + MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
				ctx.lineTo(xs - MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
				ctx.stroke();
			} else {
				ctx.beginPath();
				ctx.arc(xs, ys, MARKER_OUTER_HALF, 0, Math.PI * 2);
				ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
				ctx.fill();

				ctx.beginPath();
				ctx.arc(xs, ys, MARKER_INNER_HALF, 0, Math.PI * 2);
				ctx.fillStyle = color;
				ctx.fill();

				ctx.strokeStyle = plotBg;
				ctx.lineWidth = 2.5;
				ctx.stroke();
			}
		}
	}
	ctx.restore();
}
