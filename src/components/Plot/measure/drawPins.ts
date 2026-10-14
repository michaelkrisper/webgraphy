import { worldToScreen } from "../../../utils/coords";
import type { AxisScale } from "../../../utils/axisScale";
import type { Pin, PinId, PinPair } from "./pins";

type AxisRange = { min: number; max: number; scale?: AxisScale };
type Padding = { top: number; right: number; bottom: number; left: number };

interface PlotBox {
	width: number;
	height: number;
	padding: Padding;
}

/** Screen x of a world x on the given axis (NaN if unplaceable). */
export function screenXOf(x: number, axis: AxisRange, box: PlotBox): number {
	return worldToScreen(x, 0, {
		xMin: axis.min,
		xMax: axis.max,
		yMin: 0,
		yMax: 1,
		...box,
		xLog: axis.scale === "log",
	}).x;
}

export function screenYOf(y: number, axis: AxisRange, box: PlotBox): number {
	return worldToScreen(0, y, {
		xMin: 0,
		xMax: 1,
		yMin: axis.min,
		yMax: axis.max,
		...box,
		yLog: axis.scale === "log",
	}).y;
}

const inPlotX = (sx: number, { width, padding }: PlotBox) =>
	Number.isFinite(sx) && sx >= padding.left && sx <= width - padding.right;
const inPlotY = (sy: number, { height, padding }: PlotBox) =>
	Number.isFinite(sy) && sy >= padding.top && sy <= height - padding.bottom;

/**
 * Screen x of the pin's cursor line on its x axis, or null when it lies
 * outside the plot (scrolled away, or unplaceable on a log axis).
 */
export function pinScreenX(
	pin: Pin,
	xRange: (id: string) => AxisRange | undefined,
	box: PlotBox,
): number | null {
	const axis = xRange(pin.xAxisId);
	if (!axis) return null;
	const sx = screenXOf(pin.x, axis, box);
	return inPlotX(sx, box) ? sx : null;
}

interface DrawPinsParams extends PlotBox {
	canvas: HTMLCanvasElement | null;
	pins: PinPair;
	xRange: (id: string) => AxisRange | undefined;
	yRange: (id: string) => AxisRange | undefined;
	lineColor: string;
	plotBg: string;
}

const MARKER_RADIUS = 4;

/**
 * Draws the pinned cursor lines and their sample markers on the 2D overlay
 * canvas. Called from the viewport rAF loop, so pins track pan/zoom without
 * React renders. Returns each pin's line x (null if off-plot) for the tags.
 */
export function drawPins({
	canvas,
	pins,
	xRange,
	yRange,
	lineColor,
	plotBg,
	...box
}: DrawPinsParams): Record<PinId, number | null> {
	const out: Record<PinId, number | null> = { a: null, b: null };
	const ctx = canvas?.getContext("2d");
	if (!canvas || !ctx) return out;
	const dpr = window.devicePixelRatio || 1;
	ctx.clearRect(0, 0, canvas.width, canvas.height);
	ctx.save();
	ctx.scale(dpr, dpr);
	for (const id of ["a", "b"] as const) {
		const pin = pins[id];
		if (!pin) continue;
		const sx = pinScreenX(pin, xRange, box);
		out[id] = sx;
		if (sx !== null) {
			ctx.strokeStyle = lineColor;
			ctx.lineWidth = 1;
			ctx.setLineDash([]);
			ctx.beginPath();
			ctx.moveTo(Math.round(sx) + 0.5, box.padding.top);
			ctx.lineTo(Math.round(sx) + 0.5, box.height - box.padding.bottom);
			ctx.stroke();
		}
		for (const p of pin.points) {
			const xa = xRange(p.xAxisId);
			const ya = yRange(p.yAxisId);
			if (!xa || !ya) continue;
			const px = screenXOf(p.x, xa, box);
			const py = screenYOf(p.y, ya, box);
			if (!inPlotX(px, box) || !inPlotY(py, box)) continue;
			ctx.beginPath();
			ctx.arc(px, py, MARKER_RADIUS, 0, Math.PI * 2);
			ctx.fillStyle = p.color;
			ctx.fill();
			ctx.strokeStyle = plotBg;
			ctx.lineWidth = 2;
			ctx.stroke();
		}
	}
	ctx.restore();
	return out;
}
