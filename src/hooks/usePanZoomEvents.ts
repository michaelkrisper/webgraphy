import { useEffect } from "react";
import type { PanTarget } from "../components/Plot/chartTypes";
import type { XAxisConfig, YAxisConfig } from "../services/persistence";
import { computePinchGesture, panRangeByPixels, applyZoomBoxToAxes } from "./panZoomMath";

export interface UsePanZoomEventsOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	containerRectRef: React.MutableRefObject<DOMRect | null>;
	padding: { top: number; right: number; bottom: number; left: number };
	width: number;
	height: number;
	chartWidth: number;
	chartHeight: number;
	activeXAxes: XAxisConfig[];
	activeYAxes: YAxisConfig[];
	targetXAxes: React.MutableRefObject<Record<string, { min: number; max: number }>>;
	targetYs: React.MutableRefObject<Record<string, { min: number; max: number }>>;
	syncViewport: (force?: boolean, immediate?: boolean) => void;
	performZoom: (
		zoomFactor: number | { x: number; y: number },
		mouseX: number,
		mouseY: number,
		target?: PanTarget,
		shiftKey?: boolean,
	) => void;
	getHoveredYAxis: (mouseX: number, mouseY: number) => string | null;
	getHoveredXAxis: (mouseX: number, mouseY: number) => string | null;
	updatePan: () => void;
	onPanEnd: () => void;
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
	updateZoomBoxDom: (box: { startX: number; startY: number; endX: number; endY: number }) => void;
	lastTouchPos: React.MutableRefObject<{ x: number; y: number } | null>;
	lastPinchDist: React.MutableRefObject<{ dist: number; cx: number; cy: number } | null>;
	zoomBoxStartRef: React.MutableRefObject<{
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null>;
	hoveredAxisIdRef: React.MutableRefObject<string | null>;
	hoveredXAxisIdRef: React.MutableRefObject<string | null>;
	shiftDownRef: React.MutableRefObject<boolean>;
	lastMousePos: React.MutableRefObject<{ x: number; y: number } | null>;
	panTargetRef: React.MutableRefObject<PanTarget | null>;
	setPanTarget: (target: PanTarget | null) => void;
	setIsZooming: (isZooming: boolean) => void;
	isShiftPressedRef: React.MutableRefObject<boolean>;
}

export function usePanZoomEvents({
	containerRef,
	containerRectRef,
	padding,
	width,
	height,
	chartWidth,
	chartHeight,
	activeXAxes,
	activeYAxes,
	targetXAxes,
	targetYs,
	syncViewport,
	performZoom,
	getHoveredYAxis,
	getHoveredXAxis,
	updatePan,
	onPanEnd,
	panStateRef,
	updateZoomBoxDom,
	lastTouchPos,
	lastPinchDist,
	zoomBoxStartRef,
	hoveredAxisIdRef,
	hoveredXAxisIdRef,
	shiftDownRef,
	lastMousePos,
	panTargetRef,
	setPanTarget,
	setIsZooming,
	isShiftPressedRef,
}: UsePanZoomEventsOptions) {
	useEffect(() => {
		let mouseMoveRaf = 0;
		let pendingMouseEvent: {
			clientX: number;
			clientY: number;
			shiftKey: boolean;
		} | null = null;
		const snapshotAxesToPanState = (ps: typeof panStateRef.current) => {
			activeXAxes.forEach((a) => {
				ps.startTargetX[a.id] = { ...targetXAxes.current[a.id] };
			});
			activeYAxes.forEach((a) => {
				ps.startTargetY[a.id] = { ...targetYs.current[a.id] };
			});
		};
		const handleSingleTouchPan = (e: TouchEvent, target: PanTarget) => {
			if (e.cancelable) e.preventDefault();
			const t = e.touches[0];
			const ps = panStateRef.current;
			if (!ps.active) {
				ps.active = true;
				if (lastTouchPos.current) {
					ps.startX = lastTouchPos.current.x;
					ps.startY = lastTouchPos.current.y;
				}
				ps.target = target;
				snapshotAxesToPanState(ps);
			}
			ps.currentX = t.clientX;
			ps.currentY = t.clientY;
			updatePan();
		};

		const handlePinchZoom = (e: TouchEvent, target: PanTarget | null) => {
			if (e.cancelable) e.preventDefault();
			const rect =
				containerRectRef.current ||
				containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			if (!lastPinchDist.current) return;
			const gesture = computePinchGesture(
				e.touches[0],
				e.touches[1],
				lastPinchDist.current.dist,
			);
			if (!gesture) return;
			const { zfX, zfY, cx, cy, dist } = gesture;

			// Apply pan
			const panDx = cx - lastPinchDist.current.cx;
			const panDy = cy - lastPinchDist.current.cy;

			lastPinchDist.current = { dist, cx, cy };

			performZoom(
				{ x: zfX, y: zfY },
				cx - rect.left,
				cy - rect.top,
				target || "all",
				e.shiftKey,
			);

			// Apply pan AFTER performZoom overwrites the refs
			if (
				target === "all" ||
				(target && typeof target === "object" && "xAxisId" in target)
			) {
				activeXAxes.forEach((a) => {
					const cur = targetXAxes.current[a.id];
					if (cur) {
						targetXAxes.current[a.id] = panRangeByPixels(
							cur.min,
							cur.max,
							-panDx,
							chartWidth,
						);
					}
				});
			}

			if (
				target === "all" ||
				(target && typeof target === "object" && "yAxisId" in target)
			) {
				activeYAxes.forEach((a) => {
					const cur = targetYs.current[a.id];
					if (cur) {
						targetYs.current[a.id] = panRangeByPixels(
							cur.min,
							cur.max,
							panDy,
							chartHeight,
						);
					}
				});
			}

			// Important: performZoom calls syncViewport() at the end.
			// Since we modify the refs *after* performZoom, we must sync the viewport again
			// to flush our pan adjustments to the actual component state.
			syncViewport();
		};

		const handleTouchMoveRaw = (e: TouchEvent) => {
			const target = panTargetRef.current;
			if (e.touches.length === 1 && target && lastTouchPos.current) {
				handleSingleTouchPan(e, target);
			} else if (e.touches.length === 2 && lastPinchDist.current) {
				handlePinchZoom(e, target);
			}
		};

		const processMouseMove = () => {
			mouseMoveRaf = 0;
			const e = pendingMouseEvent;
			pendingMouseEvent = null;
			if (!e) return;
			const rect =
				containerRectRef.current ||
				containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			const mx = e.clientX - rect.left,
				my = e.clientY - rect.top;

			const target = panTargetRef.current;
			// Only update hover state when not actively panning — saves work per frame.
			if (!target && !zoomBoxStartRef.current) {
				hoveredAxisIdRef.current = getHoveredYAxis(mx, my);
				hoveredXAxisIdRef.current = getHoveredXAxis(mx, my);
			}

			if (zoomBoxStartRef.current) {
				const box = zoomBoxStartRef.current;
				box.endX = Math.max(padding.left, Math.min(width - padding.right, mx));
				box.endY = Math.max(padding.top, Math.min(height - padding.bottom, my));
				updateZoomBoxDom(box);
				return;
			}
			if (!target || !lastMousePos.current) return;

			shiftDownRef.current = e.shiftKey;

			const ps = panStateRef.current;
			if (!ps.active) {
				ps.active = true;
				ps.startX = lastMousePos.current.x;
				ps.startY = lastMousePos.current.y;
				ps.target = target;
				snapshotAxesToPanState(ps);
			}
			ps.currentX = e.clientX;
			ps.currentY = e.clientY;

			updatePan();
		};

		const handleMouseMoveRaw = (e: MouseEvent) => {
			pendingMouseEvent = {
				clientX: e.clientX,
				clientY: e.clientY,
				shiftKey: e.shiftKey,
			};
			if (!mouseMoveRaf) {
				mouseMoveRaf = requestAnimationFrame(processMouseMove);
			}
		};

		const handleMouseUp = () => {
			panStateRef.current.active = false;
			containerRectRef.current = null;

			if (zoomBoxStartRef.current) {
				const box = zoomBoxStartRef.current;
				zoomBoxStartRef.current = null;
				setIsZooming(false);
				const minX = Math.min(box.startX, box.endX);
				const maxX = Math.max(box.startX, box.endX);
				const minY = Math.min(box.startY, box.endY);
				const maxY = Math.max(box.startY, box.endY);
				if (maxX - minX > 5 && maxY - minY > 5) {
					applyZoomBoxToAxes(
						{ minX, maxX, minY, maxY },
						activeXAxes,
						activeYAxes,
						width,
						height,
						padding,
						targetXAxes.current,
						targetYs.current,
						isShiftPressedRef.current,
					);
					syncViewport();
				}
			}
			onPanEnd();
			setPanTarget(null);
		};

		const handleTouchEnd = () => {
			onPanEnd();
			setPanTarget(null);
			lastTouchPos.current = null;
			lastPinchDist.current = null;
		};

		window.addEventListener("mousemove", handleMouseMoveRaw);
		window.addEventListener("mouseup", handleMouseUp);
		window.addEventListener("touchmove", handleTouchMoveRaw, {
			passive: false,
		});
		window.addEventListener("touchend", handleTouchEnd);
		return () => {
			window.removeEventListener("mousemove", handleMouseMoveRaw);
			window.removeEventListener("mouseup", handleMouseUp);
			window.removeEventListener("touchmove", handleTouchMoveRaw);
			window.removeEventListener("touchend", handleTouchEnd);
			if (mouseMoveRaf) cancelAnimationFrame(mouseMoveRaf);
		};
	}, [
		containerRef,
		padding,
		width,
		height,
		activeXAxes,
		activeYAxes,
		targetXAxes,
		targetYs,
		syncViewport,
		performZoom,
		getHoveredYAxis,
		getHoveredXAxis,
		updatePan,
		onPanEnd,
		panStateRef,
		updateZoomBoxDom,
		chartWidth,
		chartHeight,
		containerRectRef,
		lastTouchPos,
		lastPinchDist,
		zoomBoxStartRef,
		hoveredAxisIdRef,
		hoveredXAxisIdRef,
		shiftDownRef,
		lastMousePos,
		panTargetRef,
		setPanTarget,
		setIsZooming,
		isShiftPressedRef,
	]);
}
