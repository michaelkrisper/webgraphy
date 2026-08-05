import { useCallback, useRef } from "react";
import { computePinchGesture } from "./panZoomMath";

export function useTouchGesture() {
	const lastTouchPos = useRef<{ x: number; y: number } | null>(null);
	const lastPinchDist = useRef<{ dist: number; cx: number; cy: number } | null>(null);
	const lastTouchTime = useRef<number>(0);

	const isDoubleTap = useCallback(() => {
		const now = Date.now();
		const isDouble = now - lastTouchTime.current < 300;
		lastTouchTime.current = now;
		return isDouble;
	}, []);

	const startSingleTouch = useCallback((x: number, y: number) => {
		lastTouchPos.current = { x, y };
	}, []);

	const startPinch = useCallback((t1: React.Touch | Touch, t2: React.Touch | Touch) => {
		lastPinchDist.current = {
			dist: Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY),
			cx: (t1.clientX + t2.clientX) / 2,
			cy: (t1.clientY + t2.clientY) / 2,
		};
	}, []);

	const getPinchGesture = useCallback((t1: React.Touch | Touch, t2: React.Touch | Touch) => {
		if (!lastPinchDist.current) return null;
		const gesture = computePinchGesture(t1, t2, lastPinchDist.current.dist);
		if (!gesture) return null;

		const panDx = gesture.cx - lastPinchDist.current.cx;
		const panDy = gesture.cy - lastPinchDist.current.cy;

		lastPinchDist.current = { dist: gesture.dist, cx: gesture.cx, cy: gesture.cy };

		return { ...gesture, panDx, panDy };
	}, []);

	const endTouch = useCallback(() => {
		lastTouchPos.current = null;
		lastPinchDist.current = null;
	}, []);

	return {
		lastTouchPos,
		lastPinchDist,
		isDoubleTap,
		startSingleTouch,
		startPinch,
		getPinchGesture,
		endTouch,
	};
}
