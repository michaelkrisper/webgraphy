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
	computePinchGesture,
	panRangeByPixels,
} from "./panZoomMath";

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
}: UsePanZoomOptions): UsePanZoomResult {
	const [panTarget, setPanTarget] = useState<PanTarget | null>(null);
	const [isCtrlPressed, setIsCtrlPressed] = useState(false);
	const [isShiftPressed, setIsShiftPressed] = useState(false);
	const [isZooming, setIsZooming] = useState(false);
	const [isWheeling, setIsWheeling] = useState(false);
	const wheelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const containerRectRef = useRef<DOMRect | null>(null);
	const zoomBoxSvgRef = useRef<SVGSVGElement | null>(null);
	const zoomBoxRectRef = useRef<SVGRectElement | null>(null);
	const panTargetRef = useRef<PanTarget | null>(null);
	const isShiftPressedRef = useRef(false);

	const isInteracting = !!panTarget || isZooming || isWheeling;

	const updateZoomBoxDom = useCallback(
		(box: { startX: number; startY: number; endX: number; endY: number }) => {
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
		},
		[],
	);

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

	const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
	const lastPinchDist = useRef<{ dist: number; cx: number; cy: number } | null>(
		null,
	);
	const lastTouchTime = useRef<number>(0);
	const lastMousePos = useRef<{ x: number; y: number } | null>(null);
	const zoomBoxStartRef = useRef<{
		startX: number;
		startY: number;
		endX: number;
		endY: number;
	} | null>(null);
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
		[containerRef, width, height, performZoom, onPanEnd, panStateRef],
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
				setPanTarget(target);
				panTargetRef.current = target;
				shiftDownRef.current = e.shiftKey;
				lastMousePos.current = { x: e.clientX, y: e.clientY };
			}
		},
		[containerRef, padding, width, height, updateZoomBoxDom],
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
		[containerRef, activeYAxes, handleAutoScaleX, handleAutoScaleY],
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
		]);

	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Control") setIsCtrlPressed(e.type === "keydown");
			if (e.key === "Shift") setIsShiftPressed(e.type === "keydown");
			if (e.type === "keyup") {
				pressedKeys.current.delete(e.key);
			} else {
				if (
					e.target instanceof HTMLInputElement ||
					e.target instanceof HTMLSelectElement ||
					e.target instanceof HTMLTextAreaElement
				)
					return;
				if (e.ctrlKey && ["+", "-", "=", "_"].includes(e.key))
					e.preventDefault();
				pressedKeys.current.add(e.key);
				if (
					["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
				) {
					syncViewport();
				} else if (["+", "-"].includes(e.key)) {
					syncViewport();
				}
			}
		};
		window.addEventListener("keydown", handleKey);
		window.addEventListener("keyup", handleKey);
		return () => {
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("keyup", handleKey);
		};
	}, [syncViewport, pressedKeys]);

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
