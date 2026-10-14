// src/utils/keyboard.ts
import type { useGraphStore } from "../store/useGraphStore";
import { type AxisScale, mapRangeInScale } from "./axisScale";
import { anyKeyPressed, hasKey, SHORTCUTS } from "./shortcuts";

type Range = { min: number; max: number };

/** Fraction of the visible range one keyboard pan step moves. */
const PAN_STEP = 0.05;
const ZOOM_IN_FACTOR = 0.85;
const ZOOM_OUT_FACTOR = 1.15;

export type AxisStep = "pan-" | "pan+" | "zoom-in" | "zoom-out";

/**
 * Moves one axis' pan/zoom target by a single keyboard step, starting from
 * the pending target when there is one so repeated steps accumulate. On a
 * log axis the step happens in log10 space (pan scales both edges by the
 * same factor, zoom keeps the geometric centre).
 */
export function stepAxisTarget(
	targets: Record<string, Range>,
	axis: { id: string; min: number; max: number; scale?: AxisScale },
	step: AxisStep,
): void {
	const t = targets[axis.id] || { min: axis.min, max: axis.max };
	targets[axis.id] = mapRangeInScale(
		t.min,
		t.max,
		axis.scale === "log",
		(lo, hi) => {
			const r = hi - lo;
			if (step === "pan-" || step === "pan+") {
				const d = step === "pan+" ? r * PAN_STEP : -r * PAN_STEP;
				return { min: lo + d, max: hi + d };
			}
			const newRange = r * (step === "zoom-in" ? ZOOM_IN_FACTOR : ZOOM_OUT_FACTOR);
			const half = (r - newRange) / 2;
			return { min: lo + half, max: hi - half };
		},
	);
}

/** The step a key performs on a focused axis zone, or null if none. */
export function axisStepForKey(key: string, kind: "x" | "y"): AxisStep | null {
	if (hasKey(kind === "x" ? SHORTCUTS.axisPanX : SHORTCUTS.axisPanY, key)) {
		return key === "ArrowRight" || key === "ArrowUp" ? "pan+" : "pan-";
	}
	if (hasKey(SHORTCUTS.axisZoomIn, key)) return "zoom-in";
	if (hasKey(SHORTCUTS.axisZoomOut, key)) return "zoom-out";
	return null;
}

/**
 * Under reduced motion each key press is one discrete step instead of a
 * per-frame glide while held: drop the navigation keys once applied, and the
 * OS key repeat (which re-adds them) paces any further movement.
 */
export function releaseNavigationKeys(keys: Set<string>): void {
	for (const s of [
		SHORTCUTS.panX,
		SHORTCUTS.panY,
		SHORTCUTS.zoomIn,
		SHORTCUTS.zoomOut,
	]) {
		for (const k of s.keys) keys.delete(k);
	}
}

export const applyKeyboardPan = (
	state: ReturnType<typeof useGraphStore.getState>,
	keys: Set<string>,
	targetXAxes: Record<string, Range>,
	targetYs: Record<string, Range>,
) => {
	const panX = anyKeyPressed(SHORTCUTS.panX, keys);
	const panY = anyKeyPressed(SHORTCUTS.panY, keys);
	if (!panX && !panY) return false;

	if (panX) {
		const step = keys.has("ArrowRight") ? "pan+" : "pan-";
		state.xAxes.forEach((axis) => {
			stepAxisTarget(targetXAxes, axis, step);
		});
	}
	if (panY) {
		const step = keys.has("ArrowUp") ? "pan+" : "pan-";
		state.yAxes.forEach((axis) => {
			stepAxisTarget(targetYs, axis, step);
		});
	}
	return true;
};

/**
 * Applies zooming based on pressed keys (+/-).
 * Returns true if a zoom update was triggered.
 */
export const applyKeyboardZoom = (
	state: ReturnType<typeof useGraphStore.getState>,
	keys: Set<string>,
	targetXAxes: Record<string, Range>,
	targetYs: Record<string, Range>,
) => {
	const zoomIn = anyKeyPressed(SHORTCUTS.zoomIn, keys);
	if (!zoomIn && !anyKeyPressed(SHORTCUTS.zoomOut, keys)) return false;

	const step = zoomIn ? "zoom-in" : "zoom-out";
	state.xAxes.forEach((axis) => {
		stepAxisTarget(targetXAxes, axis, step);
	});
	// Ctrl narrows the zoom to the X axes (SHORTCUTS.zoomXOnly).
	if (!keys.has("Control")) {
		state.yAxes.forEach((axis) => {
			stepAxisTarget(targetYs, axis, step);
		});
	}
	return true;
};
