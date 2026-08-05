import { useCallback, useRef, useState } from "react";

export function useZoomBox() {
	const zoomBoxStartRef = useRef<{ startX: number; startY: number; endX: number; endY: number } | null>(null);
	const zoomBoxSvgRef = useRef<SVGSVGElement | null>(null);
	const zoomBoxRectRef = useRef<SVGRectElement | null>(null);
	const [isZooming, setIsZooming] = useState(false);

	const updateDOM = useCallback((box: { startX: number; startY: number; endX: number; endY: number }) => {
		const rect = zoomBoxRectRef.current;
		if (!rect) return;
		const x = Math.min(box.startX, box.endX);
		const y = Math.min(box.startY, box.endY);
		const w = Math.abs(box.endX - box.startX);
		const h = Math.abs(box.endY - box.startY);
		rect.setAttribute("x", String(x));
		rect.setAttribute("y", String(y));
		rect.setAttribute("width", String(w));
		rect.setAttribute("height", String(h));
	}, []);

	const start = useCallback((x: number, y: number) => {
		const box = { startX: x, startY: y, endX: x, endY: y };
		zoomBoxStartRef.current = box;
		setIsZooming(true);
		updateDOM(box);
	}, [updateDOM]);

	const move = useCallback((mx: number, my: number, limits: { left: number, right: number, top: number, bottom: number }) => {
		if (!zoomBoxStartRef.current) return false;
		const box = zoomBoxStartRef.current;
		box.endX = Math.max(limits.left, Math.min(limits.right, mx));
		box.endY = Math.max(limits.top, Math.min(limits.bottom, my));
		updateDOM(box);
		return true;
	}, [updateDOM]);

	const end = useCallback(() => {
		if (!zoomBoxStartRef.current) return null;
		const box = zoomBoxStartRef.current;
		zoomBoxStartRef.current = null;
		setIsZooming(false);
		const minX = Math.min(box.startX, box.endX);
		const maxX = Math.max(box.startX, box.endX);
		const minY = Math.min(box.startY, box.endY);
		const maxY = Math.max(box.startY, box.endY);
		if (maxX - minX > 5 && maxY - minY > 5) {
			return { minX, maxX, minY, maxY };
		}
		return null;
	}, []);

	const hasBox = useCallback(() => !!zoomBoxStartRef.current, []);

	return {
		zoomBoxSvgRef,
		zoomBoxRectRef,
		isZooming,
		startZoomBox: start,
		moveZoomBox: move,
		endZoomBox: end,
		hasZoomBox: hasBox,
	};
}
