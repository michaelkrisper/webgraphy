/* eslint-disable react-hooks/immutability */
import { useCallback } from "react";
import type { PanTarget } from "../components/Plot/chartTypes";
import type { YAxisConfig } from "../services/persistence";

export interface UsePanZoomHandlersOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	containerRectRef: React.MutableRefObject<DOMRect | null>;
	wheelTimeoutRef: React.MutableRefObject<ReturnType<typeof setTimeout> | null>;
	panStateRef: React.MutableRefObject<{
		active: boolean;
		startX: number;
		startY: number;
		currentX: number;
		currentY: number;
		target: PanTarget | null;
		startTargetX: Record<string, { min: number; max: number }>;
		startTargetY: Record<string, { min: number; max: number }>;
	}>;
	smoothZoomRef: React.MutableRefObject<boolean>;
	zoomBoxStartRef: React.MutableRefObject<{
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null>;
	shiftDownRef: React.MutableRefObject<boolean>;
	lastMousePos: React.MutableRefObject<{ x: number; y: number } | null>;
	panTargetRef: React.MutableRefObject<PanTarget | null>;
	lastTouchTime: React.MutableRefObject<number>;
	lastTouchPos: React.MutableRefObject<{ x: number; y: number } | null>;
	lastPinchDist: React.MutableRefObject<{ dist: number; cx: number; cy: number } | null>;
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	activeYAxes: YAxisConfig[];
	setIsWheeling: (isWheeling: boolean) => void;
	onPanEnd: () => void;
	performZoom: (
		zoomFactor: number | { x: number; y: number },
		mouseX: number,
		mouseY: number,
		target?: PanTarget,
		shiftKey?: boolean,
	) => void;
	setIsZooming: (isZooming: boolean) => void;
	updateZoomBoxDom: (box: { startX: number; startY: number; endX: number; endY: number }) => void;
	setPanTarget: React.Dispatch<React.SetStateAction<PanTarget | null>>;
	handleAutoScaleX: (xAxisId?: string) => void;
	handleAutoScaleY: (axisId: string, mouseY?: number) => void;
}

export function usePanZoomHandlers({
	containerRef,
	containerRectRef,
	wheelTimeoutRef,
	panStateRef,
	smoothZoomRef,
	zoomBoxStartRef,
	shiftDownRef,
	lastMousePos,
	panTargetRef,
	lastTouchTime,
	lastTouchPos,
	lastPinchDist,
	width,
	height,
	padding,
	activeYAxes,
	setIsWheeling,
	onPanEnd,
	performZoom,
	setIsZooming,
	updateZoomBoxDom,
	setPanTarget,
	handleAutoScaleX,
	handleAutoScaleY,
}: UsePanZoomHandlersOptions) {
	const handleWheel = useCallback(
		(e: React.WheelEvent, target: PanTarget = "all") => {
			setIsWheeling(true);
			panStateRef.current.active = true;
			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
			wheelTimeoutRef.current = setTimeout(() => {
				setIsWheeling(false);
				panStateRef.current.active = false;
				onPanEnd();
				wheelTimeoutRef.current = null;
			}, 300);

			const zoomFactor = e.deltaY > 0 ? 1.1 : 0.9;
			smoothZoomRef.current = true;
			const rect = containerRef.current?.getBoundingClientRect();
			if (rect) containerRectRef.current = rect;
			performZoom(
				zoomFactor,
				rect ? e.clientX - rect.left : width / 2,
				rect ? e.clientY - rect.top : height / 2,
				target,
				e.shiftKey,
			);
		},
		[
			containerRef,
			width,
			height,
			performZoom,
			onPanEnd,
			panStateRef,
			smoothZoomRef,
			setIsWheeling,
			wheelTimeoutRef,
			containerRectRef,
		],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, target: PanTarget = "all") => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			containerRectRef.current = rect;
			const x = e.clientX - rect.left,
				y = e.clientY - rect.top;
			if (e.ctrlKey && target === "all") {
				if (
					x >= padding.left &&
					x <= width - padding.right &&
					y >= padding.top &&
					y <= height - padding.bottom
				) {
					const box = { startX: x, startY: y, endX: x, endY: y };
					zoomBoxStartRef.current = box;
					setIsZooming(true);
					updateZoomBoxDom(box);
				}
			} else {
				// A drag must track the cursor 1:1 — stop any running zoom easing.
				smoothZoomRef.current = false;
				setPanTarget(target);
				panTargetRef.current = target;
				shiftDownRef.current = e.shiftKey;
				lastMousePos.current = { x: e.clientX, y: e.clientY };
			}
		},
		[
			containerRef,
			padding,
			width,
			height,
			updateZoomBoxDom,
			smoothZoomRef,
			containerRectRef,
			zoomBoxStartRef,
			setIsZooming,
			setPanTarget,
			panTargetRef,
			shiftDownRef,
			lastMousePos,
		],
	);

	const handleTouchStart = useCallback(
		(e: React.TouchEvent, target: PanTarget = "all") => {
			const now = Date.now(),
				isDouble = now - lastTouchTime.current < 300;
			lastTouchTime.current = now;
			const rect = containerRef.current?.getBoundingClientRect();
			if (rect) containerRectRef.current = rect;

			if (e.touches.length === 1) {
				const t = e.touches[0];
				if (!rect) return;
				if (isDouble) {
					if (target === "all") {
						handleAutoScaleX();
						activeYAxes.forEach((a) => {
							handleAutoScaleY(a.id);
						});
					} else if (typeof target === "object") {
						if ("xAxisId" in target) handleAutoScaleX(target.xAxisId);
						else if ("yAxisId" in target)
							handleAutoScaleY(target.yAxisId, t.clientY - rect.top);
					}
					return;
				}
				setPanTarget(target);
				lastTouchPos.current = { x: t.clientX, y: t.clientY };
			} else if (e.touches.length === 2) {
				setPanTarget((prev) => (prev && prev !== "all" ? prev : target));
				const t1 = e.touches[0],
					t2 = e.touches[1];
				lastPinchDist.current = {
					dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
					cx: (t1.clientX + t2.clientX) / 2,
					cy: (t1.clientY + t2.clientY) / 2,
				};
			}
		},
		[
			containerRef,
			activeYAxes,
			handleAutoScaleX,
			handleAutoScaleY,
			lastTouchTime,
			containerRectRef,
			setPanTarget,
			lastTouchPos,
			lastPinchDist,
		],
	);

	return { handleWheel, handleMouseDown, handleTouchStart };
}
