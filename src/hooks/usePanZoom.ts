// src/hooks/usePanZoom.ts
import { useCallback, useEffect, useRef, useState } from "react";
import { hitTestXAxis, hitTestYAxis } from "../components/Plot/axisHitTest";
import {
	type PanTarget,
	panTargetXAxisId,
	panTargetYAxisId,
} from "../components/Plot/chartTypes";
import type { XAxisConfig, YAxisConfig } from "../services/persistence";
import { getAxisById } from "../utils/axisCalculations";
import { screenToWorld } from "../utils/coords";
import {
	applyZoomBoxToAxes,
	applyZoomToRange,
	panRangeByPixels,
} from "./panZoomMath";
import { usePanZoomKeyboard } from "./usePanZoomKeyboard";
import { useZoomBox } from "./useZoomBox";
import { useTouchGesture } from "./useTouchGesture";

interface UsePanZoomOptions {
	containerRef: React.RefObject<HTMLDivElement | null>;
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	chartWidth: number;
	chartHeight: number;
	activeXAxes: XAxisConfig[];
	activeYAxes: YAxisConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	targetXAxes: React.MutableRefObject<
		Record<string, { min: number; max: number }>
	>;
	targetYs: React.MutableRefObject<
		Record<string, { min: number; max: number }>
	>;
	syncViewport: (force?: boolean, immediate?: boolean) => void;
	xAxesMetrics: Array<{ id: string; height: number; cumulativeOffset: number }>;
	axisLayout: Record<string, { total: number; label: number }>;
	leftAxes: YAxisConfig[];
	rightAxes: YAxisConfig[];
	handleAutoScaleX: (xAxisId?: string) => void;
	handleAutoScaleY: (axisId: string, mouseY?: number) => void;
	pressedKeys: React.MutableRefObject<Set<string>>;
	onPanEnd: () => void;
	/** Set on wheel zoom; tells the viewport sync loop to ease toward the
	 * targets instead of snapping. Cleared when a drag pan starts. */
	smoothZoomRef: React.MutableRefObject<boolean>;
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
}

interface UsePanZoomResult {
	panTarget: PanTarget | null;
	isCtrlPressed: boolean;
	isShiftPressed: boolean;
	isInteracting: boolean;
	isZooming: boolean;
	zoomBoxSvgRef: React.RefObject<SVGSVGElement | null>;
	zoomBoxRectRef: React.RefObject<SVGRectElement | null>;
	handleMouseDown: (e: React.MouseEvent, target?: PanTarget) => void;
	handleTouchStart: (e: React.TouchEvent, target?: PanTarget) => void;
	handleWheel: (e: React.WheelEvent, target?: PanTarget) => void;
}

export function usePanZoom({
	containerRef,
	width,
	height,
	padding,
	chartWidth,
	chartHeight,
	activeXAxes,
	activeYAxes,
	xAxes,
	yAxes,
	targetXAxes,
	targetYs,
	syncViewport,
	xAxesMetrics,
	axisLayout,
	leftAxes,
	rightAxes,
	handleAutoScaleX,
	handleAutoScaleY,
	pressedKeys,
	onPanEnd,
	panStateRef,
	smoothZoomRef,
}: UsePanZoomOptions): UsePanZoomResult {
	const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
	const [isCtrlPressed, setIsCtrlPressed] = useState(false);
	const [isShiftPressed, setIsShiftPressed] = useState(false);
	const [isWheeling, setIsWheeling] = useState(false);
	const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const containerRectRef = useRef<DOMRect | null>(null);
	const panTargetRef = useRef<PanTarget | null>(null);
	const isShiftPressedRef = useRef(false);


	// Track shift state in a ref so updatePan (called from rAF/event handlers) sees the latest value.
	const shiftDownRef = useRef(false);

	// eslint-disable-next-line react-hooks/immutability
	const updatePan = useCallback(() => {
		const ps = panStateRef.current;
		if (!ps.active || !ps.target) return;

		const dx = ps.currentX - ps.startX;
		const dy = ps.currentY - ps.startY;
		let changed = false;

		// X-Axis Panning
		if (ps.target === "all" || panTargetXAxisId(ps.target)) {
			for (let i = 0; i < activeXAxes.length; i++) {
				const axis = activeXAxes[i];
				if (
					ps.target !== "all" &&
					!shiftDownRef.current &&
					panTargetXAxisId(ps.target) !== axis.id
				)
					continue;
				const startConf = ps.startTargetX[axis.id];
				if (!startConf) continue;
				const { min: newMin, max: newMax } = panRangeByPixels(
					startConf.min,
					startConf.max,
					-dx,
					chartWidth,
				);
				const cur = targetXAxes.current[axis.id];
				if (cur.min !== newMin || cur.max !== newMax) {
									// eslint-disable-next-line react-hooks/immutability
					targetXAxes.current[axis.id] = { ...cur, min: newMin, max: newMax };
					changed = true;
				}
			}
		}

		// Y-Axis Panning
		if (ps.target === "all" || panTargetYAxisId(ps.target)) {
			const targetYId = panTargetYAxisId(ps.target);
			const syncSideAxes =
				shiftDownRef.current && targetYId
					? leftAxes.some((a) => a.id === targetYId)
						? leftAxes
						: rightAxes
					: null;
			for (let i = 0; i < activeYAxes.length; i++) {
				const axis = activeYAxes[i];
				if (ps.target !== "all") {
					if (syncSideAxes) {
						if (!syncSideAxes.some((a) => a.id === axis.id)) continue;
					} else if (targetYId !== axis.id) {
						continue;
					}
				}
				const startConf = ps.startTargetY[axis.id];
				if (!startConf) continue;
				const { min: newMin, max: newMax } = panRangeByPixels(
					startConf.min,
					startConf.max,
					dy,
					chartHeight,
				);
				const cur = targetYs.current[axis.id];
				if (cur.min !== newMin || cur.max !== newMax) {
									// eslint-disable-next-line react-hooks/immutability
					targetYs.current[axis.id] = { ...cur, min: newMin, max: newMax };
					changed = true;
				}
			}
		}

		if (changed) syncViewport(false, true);
	}, [
		activeXAxes,
		activeYAxes,
		leftAxes,
		rightAxes,
		chartWidth,
		chartHeight,
		targetXAxes,
		targetYs,
		syncViewport,
		panStateRef,
	]);

	const lastMousePos = useRef<{ x: number; y: number } | null>(null);
	const { zoomBoxSvgRef, zoomBoxRectRef, isZooming, startZoomBox, moveZoomBox, endZoomBox, hasZoomBox } = useZoomBox();
	const { lastTouchPos, lastPinchDist, isDoubleTap, startSingleTouch, startPinch, getPinchGesture, endTouch } = useTouchGesture();

	const isInteracting = !!panTarget || isZooming || isWheeling;
	const hoveredAxisIdRef = useRef<string | null>(null);
	const hoveredXAxisIdRef = useRef<string | null>(null);

	const getHoveredYAxis = useCallback(
		(mouseX: number, mouseY: number) =>
			hitTestYAxis(mouseX, mouseY, {
				width,
				height,
				padding,
				leftAxes,
				rightAxes,
				axisLayout,
			}),
		[leftAxes, rightAxes, axisLayout, padding, width, height],
	);

	const getHoveredXAxis = useCallback(
		(mouseX: number, mouseY: number) =>
			hitTestXAxis(mouseX, mouseY, { width, height, padding, xAxesMetrics }),
		[xAxesMetrics, padding, width, height],
	);

	const performZoom = useCallback(
		(
			zoomFactor: number | { x: number; y: number },
			mouseX: number,
			mouseY: number,
			target: PanTarget = "all",
			shiftKey = false,
		) => {
			if (
				target === "all" ||
				(typeof target === "object" && "xAxisId" in target)
			) {
				const axesToZoom =
					target === "all" || shiftKey
						? activeXAxes
						: (() => {
								const a = getAxisById(xAxes, target.xAxisId);
								return a ? [a] : [];
							})();
				axesToZoom.forEach((axis) => {
					if (!axis) return;
					const currentX = targetXAxes.current[axis.id] || {
						min: axis.min,
						max: axis.max,
					};
					const vp = {
						xMin: currentX.min,
						xMax: currentX.max,
						yMin: 0,
						yMax: 100,
						width,
						height,
						padding,
					};
					const worldMouse = screenToWorld(mouseX, 0, vp);
					const zfX =
						typeof zoomFactor === "number" ? zoomFactor : zoomFactor.x;
					const weight = (mouseX - padding.left) / chartWidth;
					targetXAxes.current[axis.id] = applyZoomToRange(
						worldMouse.x,
						currentX.min,
						currentX.max,
						weight,
						zfX,
					);
				});
			}
			if (
				(target === "all" && !shiftKey) ||
				(typeof target === "object" && "yAxisId" in target)
			) {
				const axesToZoom = (() => {
					if (target === "all") return activeYAxes;
					const yId = panTargetYAxisId(target) as string;
					if (shiftKey) {
						return leftAxes.some((a) => a.id === yId) ? leftAxes : rightAxes;
					}
					const a = getAxisById(yAxes, yId);
					return a ? [a] : [];
				})();
				axesToZoom.forEach((axis) => {
					if (!axis) return;
					const currentTarget = targetYs.current[axis.id] || {
						min: axis.min,
						max: axis.max,
					};
					const axisVp = {
						xMin: 0,
						xMax: 100,
						yMin: currentTarget.min,
						yMax: currentTarget.max,
						width,
						height,
						padding,
					};
					const worldMouse = screenToWorld(0, mouseY, axisVp);
					const zfY =
						typeof zoomFactor === "number" ? zoomFactor : zoomFactor.y;
					const weight = (height - padding.bottom - mouseY) / chartHeight;
					targetYs.current[axis.id] = applyZoomToRange(
						worldMouse.y,
						currentTarget.min,
						currentTarget.max,
						weight,
						zfY,
					);
				});
			}
			syncViewport();
		},
		[
			activeXAxes,
			activeYAxes,
			xAxes,
			yAxes,
			width,
			height,
			padding,
			chartWidth,
			chartHeight,
			leftAxes,
			rightAxes,
			targetXAxes,
			targetYs,
			syncViewport,
		],
	);

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
		[containerRef, width, height, performZoom, onPanEnd, panStateRef, smoothZoomRef],
	);

	const handleMouseDown = useCallback(
		(e: React.MouseEvent, target: PanTarget = "all") => {
			const rect = containerRef.current?.getBoundingClientRect();
			if (!rect) return;
			containerRectRef.current = rect;
			const x = e.clientX - rect.left,
				y = e.clientY - rect.top;
			if (e.ctrlKey && target === "all") {
				startZoomBox(x, y);
			} else {
				// A drag must track the cursor 1:1 — stop any running zoom easing.
				smoothZoomRef.current = false;
				setPanTarget(target);
				panTargetRef.current = target;
				shiftDownRef.current = e.shiftKey;
				lastMousePos.current = { x: e.clientX, y: e.clientY };
			}
		},
		[containerRef, startZoomBox, smoothZoomRef],
	);

	const handleTouchStart = useCallback(
		(e: React.TouchEvent, target: PanTarget = "all") => {
			const isDouble = isDoubleTap();
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
				startSingleTouch(t.clientX, t.clientY);
			} else if (e.touches.length === 2) {
				setPanTarget((prev) => (prev && prev !== "all" ? prev : target));
				startPinch(e.touches[0], e.touches[1]);
			}
		},
		[containerRef, activeYAxes, handleAutoScaleX, handleAutoScaleY, isDoubleTap, startSingleTouch, startPinch],
	);

	// Raw event listeners (non-React for passive:false touch)
	useEffect(() => {
		panTargetRef.current = panTarget;
		isShiftPressedRef.current = isShiftPressed;
		shiftDownRef.current = isShiftPressed;
	}, [panTarget, isShiftPressed]);

	useEffect(
		() => () => {
			if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
		},
		[],
	);

	// eslint-disable-next-line react-hooks/immutability
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
			const gesture = getPinchGesture(e.touches[0], e.touches[1]);
			if (!gesture) return;
			const { zfX, zfY, cx, cy, panDx, panDy } = gesture;

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
			if (!target && !hasZoomBox()) {
				hoveredAxisIdRef.current = getHoveredYAxis(mx, my);
				hoveredXAxisIdRef.current = getHoveredXAxis(mx, my);
			}

			if (hasZoomBox()) {
				moveZoomBox(mx, my, { left: padding.left, right: width - padding.right, top: padding.top, bottom: height - padding.bottom });
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

			const box = endZoomBox();
			if (box) {
				applyZoomBoxToAxes(
					box,
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
			onPanEnd();
			setPanTarget(null);
		};

		const handleTouchEnd = () => {
			onPanEnd();
			setPanTarget(null);
			endTouch();
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
		hasZoomBox,
		moveZoomBox,
		endZoomBox,
		getPinchGesture,
		endTouch,
		chartWidth,
		chartHeight,
		lastPinchDist,
		lastTouchPos,
	]);

	usePanZoomKeyboard({
		pressedKeys,
		syncViewport,
		setIsCtrlPressed,
		setIsShiftPressed,
	});

	return {
		panTarget,
		isCtrlPressed,
		isShiftPressed,
		isInteracting,
		isZooming,
		zoomBoxSvgRef,
		zoomBoxRectRef,
		handleMouseDown,
		handleTouchStart,
		handleWheel,
	};
}
