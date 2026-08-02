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
import { applyZoomToRange, panRangeByPixels } from "./panZoomMath";
import { usePanZoomEvents } from "./usePanZoomEvents";
import { usePanZoomHandlers } from "./usePanZoomHandlers";
import { usePanZoomKeyboard } from "./usePanZoomKeyboard";

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

	const { handleWheel, handleMouseDown, handleTouchStart } = usePanZoomHandlers({
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
	});

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

	usePanZoomEvents({
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
	});

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
