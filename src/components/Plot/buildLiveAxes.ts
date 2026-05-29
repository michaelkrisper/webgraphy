// Overlays pending pan/zoom axis-range updates onto the persisted axis
// configs to produce a "live" snapshot. Reuses the caller-owned scratch
// arrays so the frequent (per rAF) snapshot doesn't churn the heap.
// Extracted from ChartContainer so the overlay can be unit-tested without
// the store.

export type AxisRangeUpdate = Record<string, { min: number; max: number }>;

interface AxisRange {
	id: string;
	min: number;
	max: number;
}

/**
 * Snapshot each persisted axis' current [min,max] into the supplied target
 * record, mutating in place. Used to seed the interactive target buffers
 * after the store ranges change (load, undo/redo, sidebar edit).
 */
export function resetAxisTargets(
	xAxes: readonly AxisRange[],
	yAxes: readonly AxisRange[],
	targetXAxes: Record<string, { min: number; max: number }>,
	targetYs: Record<string, { min: number; max: number }>,
): void {
	for (const axis of xAxes) {
		targetXAxes[axis.id] = { min: axis.min, max: axis.max };
	}
	for (const axis of yAxes) {
		targetYs[axis.id] = { min: axis.min, max: axis.max };
	}
}

export interface LiveAxesScratch<X, Y> {
	liveX: X[];
	liveY: Y[];
}

export function createLiveAxesScratch<X, Y>(): LiveAxesScratch<X, Y> {
	return { liveX: [], liveY: [] };
}

/**
 * For each axis in `xAxes`/`yAxes`, return either the axis as-is (no pending
 * update) or a shallow clone with `min`/`max` overridden from the matching
 * update entry. Output arrays are the scratch ones, truncated/grown to match
 * the input lengths.
 */
export function applyAxisUpdates<
	X extends { id: string; min: number; max: number },
	Y extends { id: string; min: number; max: number },
>(
	scratch: LiveAxesScratch<X, Y>,
	xAxes: readonly X[],
	yAxes: readonly Y[],
	xUpdates: AxisRangeUpdate,
	yUpdates: AxisRangeUpdate,
): { liveX: X[]; liveY: Y[] } {
	const liveX = scratch.liveX;
	const liveY = scratch.liveY;
	liveX.length = xAxes.length;
	for (let i = 0; i < xAxes.length; i++) {
		const a = xAxes[i];
		const upd = xUpdates[a.id];
		liveX[i] = upd ? { ...a, min: upd.min, max: upd.max } : a;
	}
	liveY.length = yAxes.length;
	for (let i = 0; i < yAxes.length; i++) {
		const a = yAxes[i];
		const upd = yUpdates[a.id];
		liveY[i] = upd ? { ...a, min: upd.min, max: upd.max } : a;
	}
	return { liveX, liveY };
}
