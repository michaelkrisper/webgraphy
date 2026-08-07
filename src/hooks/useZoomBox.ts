import { useCallback, useRef } from "react";

/** Drag rectangle in container-local pixels; end may lie before start. */
export interface ZoomBoxRect {
	startX: number;
	startY: number;
	endX: number;
	endY: number;
}

/** Axis-aligned bounds, always normalised so min <= max. */
export interface ZoomBoxBounds {
	minX: number;
	maxX: number;
	minY: number;
	maxY: number;
}

export interface PlotBounds {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
}

/**
 * A drag shorter than this in either axis is treated as a stray click rather
 * than a zoom, so a mis-click does not throw the viewport somewhere useless.
 */
export const MIN_ZOOM_BOX_PX = 5;

/** Corner-order-independent bounds of a drag rectangle. */
export function normalizeZoomBox(box: ZoomBoxRect): ZoomBoxBounds {
	return {
		minX: Math.min(box.startX, box.endX),
		maxX: Math.max(box.startX, box.endX),
		minY: Math.min(box.startY, box.endY),
		maxY: Math.max(box.startY, box.endY),
	};
}

/** True when the drag is large enough to be a deliberate zoom. */
export function isZoomBoxUsable(box: ZoomBoxRect): boolean {
	const { minX, maxX, minY, maxY } = normalizeZoomBox(box);
	return maxX - minX > MIN_ZOOM_BOX_PX && maxY - minY > MIN_ZOOM_BOX_PX;
}

/** Whether a point lies inside the plot rectangle (excluding the gutters). */
export function isInsidePlot(
	x: number,
	y: number,
	{ width, height, padding }: PlotBounds,
): boolean {
	return (
		x >= padding.left &&
		x <= width - padding.right &&
		y >= padding.top &&
		y <= height - padding.bottom
	);
}

export interface ZoomBoxController {
	/** Attach to the overlay `<svg>` and its `<rect>`. */
	svgRef: React.RefObject<SVGSVGElement | null>;
	rectRef: React.RefObject<SVGRectElement | null>;
	/** True while a drag is in progress. */
	isDragging: () => boolean;
	/**
	 * Starts a drag at a container-local point, if it is inside the plot.
	 * Returns whether a drag was started.
	 */
	begin: (x: number, y: number, bounds: PlotBounds) => boolean;
	/** Extends the drag, clamped to the plot, and updates the overlay. */
	dragTo: (x: number, y: number, bounds: PlotBounds) => void;
	/**
	 * Ends the drag. Returns the bounds to zoom to, or null when there was no
	 * drag or it was too small to count. Callers that need to distinguish
	 * "no drag" from "drag too small" should check `isDragging()` first.
	 */
	end: () => ZoomBoxBounds | null;
}

/**
 * Owns the ctrl-drag zoom rectangle: its two DOM refs, the in-flight drag, and
 * the geometry.
 *
 * The rectangle is written straight to SVG attributes rather than through
 * React state — it updates on every mouse move, and the surrounding pan/zoom
 * machinery deliberately keeps per-frame work off the render path. Keeping
 * that here means the caller never sees the refs at all; it only starts,
 * extends and ends a drag.
 */
export function useZoomBox(): ZoomBoxController {
	const svgRef = useRef<SVGSVGElement | null>(null);
	const rectRef = useRef<SVGRectElement | null>(null);
	const dragRef = useRef<ZoomBoxRect | null>(null);

	const paint = useCallback((box: ZoomBoxRect) => {
		const rect = rectRef.current;
		if (!rect) return;
		const { minX, maxX, minY, maxY } = normalizeZoomBox(box);
		rect.setAttribute("x", String(minX));
		rect.setAttribute("y", String(minY));
		rect.setAttribute("width", String(maxX - minX));
		rect.setAttribute("height", String(maxY - minY));
	}, []);

	const isDragging = useCallback(() => dragRef.current !== null, []);

	const begin = useCallback(
		(x: number, y: number, bounds: PlotBounds) => {
			if (!isInsidePlot(x, y, bounds)) return false;
			const box = { startX: x, startY: y, endX: x, endY: y };
			dragRef.current = box;
			paint(box);
			return true;
		},
		[paint],
	);

	const dragTo = useCallback(
		(x: number, y: number, { width, height, padding }: PlotBounds) => {
			const box = dragRef.current;
			if (!box) return;
			box.endX = Math.max(padding.left, Math.min(width - padding.right, x));
			box.endY = Math.max(padding.top, Math.min(height - padding.bottom, y));
			paint(box);
		},
		[paint],
	);

	const end = useCallback(() => {
		const box = dragRef.current;
		dragRef.current = null;
		if (!box || !isZoomBoxUsable(box)) return null;
		return normalizeZoomBox(box);
	}, []);

	return { svgRef, rectRef, isDragging, begin, dragTo, end };
}
