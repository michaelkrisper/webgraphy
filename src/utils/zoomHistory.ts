// Back/forward stack of settled viewports (every x and y axis range). Undo
// deliberately ignores the viewport (see mergeViewport in useGraphStore), so
// this is the only way back to an earlier zoom.

import type { AxisScale } from "./axisScale";

export interface AxisRangeEntry {
	readonly id: string;
	readonly min: number;
	readonly max: number;
	readonly scale?: AxisScale;
}

/**
 * The store's axis arrays are immutable, so a snapshot holds them by
 * reference: recording one copies nothing.
 */
export interface ViewportSnapshot {
	readonly xAxes: readonly AxisRangeEntry[];
	readonly yAxes: readonly AxisRangeEntry[];
}

export type RangeTargets = Record<string, { min: number; max: number }>;

export const ZOOM_HISTORY_LIMIT = 50;
/**
 * Settled viewports closer together than this are one step: a held arrow key
 * settles every frame, and a few quick wheel flicks are one zoom to the user.
 */
export const ZOOM_COALESCE_MS = 500;

export function createZoomHistory(
	limit = ZOOM_HISTORY_LIMIT,
	coalesceMs = ZOOM_COALESCE_MS,
) {
	const past: ViewportSnapshot[] = [];
	let future: ViewportSnapshot[] = [];
	let lastRecordAt = Number.NEGATIVE_INFINITY;

	/**
	 * Records the viewport a settled change moved away from. Returns false
	 * when the change merged into the previous step instead.
	 */
	const record = (previous: ViewportSnapshot, now: number): boolean => {
		future = [];
		const merge = past.length > 0 && now - lastRecordAt <= coalesceMs;
		lastRecordAt = now;
		if (merge) return false;
		past.push(previous);
		if (past.length > limit) past.shift();
		return true;
	};

	/** Pops the previous viewport, parking `current` for {@link forward}. */
	const back = (current: ViewportSnapshot): ViewportSnapshot | undefined => {
		const entry = past.pop();
		if (!entry) return undefined;
		future.push(current);
		// A change right after navigating is a new step, not part of the old one.
		lastRecordAt = Number.NEGATIVE_INFINITY;
		return entry;
	};

	const forward = (current: ViewportSnapshot): ViewportSnapshot | undefined => {
		const entry = future.pop();
		if (!entry) return undefined;
		past.push(current);
		if (past.length > limit) past.shift();
		lastRecordAt = Number.NEGATIVE_INFINITY;
		return entry;
	};

	const clear = () => {
		past.length = 0;
		future = [];
		lastRecordAt = Number.NEGATIVE_INFINITY;
	};

	return {
		record,
		back,
		forward,
		clear,
		get canBack() {
			return past.length > 0;
		},
		get canForward() {
			return future.length > 0;
		},
	};
}

export type ZoomHistory = ReturnType<typeof createZoomHistory>;

/** Where the axes are heading: the live targets, falling back to the stored range. */
export function snapshotFromTargets(
	xAxes: readonly AxisRangeEntry[],
	yAxes: readonly AxisRangeEntry[],
	targetX: RangeTargets,
	targetY: RangeTargets,
): ViewportSnapshot {
	const merge = (axes: readonly AxisRangeEntry[], targets: RangeTargets) =>
		axes.map((a) => {
			const t = targets[a.id];
			return t ? { id: a.id, min: t.min, max: t.max, scale: a.scale } : a;
		});
	return { xAxes: merge(xAxes, targetX), yAxes: merge(yAxes, targetY) };
}

/** Overwrites `ranges` with every axis' current range. */
export function seedRanges(
	ranges: RangeTargets,
	axes: readonly AxisRangeEntry[],
): void {
	for (const a of axes) ranges[a.id] = { min: a.min, max: a.max };
}

const usable = (from: AxisRangeEntry, to: AxisRangeEntry) =>
	Number.isFinite(from.min) &&
	Number.isFinite(from.max) &&
	from.min < from.max &&
	// A scale switch since the snapshot redefines what its range means.
	(from.scale ?? "linear") === (to.scale ?? "linear") &&
	(to.scale !== "log" || from.min > 0);

/**
 * Points the targets of every current axis at its range in `snapshot`, and
 * returns the ranges that actually changed (empty when nothing moves). Axes
 * whose scale changed since are left alone.
 */
export function restoreTargets(
	snapshot: ViewportSnapshot,
	current: ViewportSnapshot,
	targetX: RangeTargets,
	targetY: RangeTargets,
): { x: RangeTargets; y: RangeTargets; changed: boolean } {
	let changed = false;
	const apply = (
		saved: readonly AxisRangeEntry[],
		axes: readonly AxisRangeEntry[],
		targets: RangeTargets,
	) => {
		const moved: RangeTargets = {};
		const byId = new Map(saved.map((a) => [a.id, a]));
		for (const axis of axes) {
			const s = byId.get(axis.id);
			if (!s || !usable(s, axis)) continue;
			const t = targets[axis.id] ?? axis;
			if (t.min === s.min && t.max === s.max) continue;
			targets[axis.id] = { min: s.min, max: s.max };
			moved[axis.id] = { min: s.min, max: s.max };
			changed = true;
		}
		return moved;
	};
	const x = apply(snapshot.xAxes, current.xAxes, targetX);
	const y = apply(snapshot.yAxes, current.yAxes, targetY);
	return { x, y, changed };
}

const close = (a: number, b: number) =>
	Math.abs(a - b) <= 1e-9 * Math.max(Math.abs(a), Math.abs(b), 1e-300);

/** Whether `state` sits on every range in `dest` (a {@link restoreTargets} result). */
export function reachedRanges(
	state: ViewportSnapshot,
	dest: { x: RangeTargets; y: RangeTargets },
): boolean {
	const check = (axes: readonly AxisRangeEntry[], ranges: RangeTargets) => {
		for (const a of axes) {
			const r = ranges[a.id];
			if (r && !(close(a.min, r.min) && close(a.max, r.max))) return false;
		}
		return true;
	};
	return check(state.xAxes, dest.x) && check(state.yAxes, dest.y);
}
