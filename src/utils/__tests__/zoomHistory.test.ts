import { describe, expect, it } from "vitest";
import {
	type AxisRangeEntry,
	createZoomHistory,
	type RangeTargets,
	reachedRanges,
	restoreTargets,
	snapshotFromTargets,
	type ViewportSnapshot,
} from "../zoomHistory";

const view = (
	xMin: number,
	xMax: number,
	yScale?: "log",
): ViewportSnapshot => ({
	xAxes: [{ id: "axis-1", min: xMin, max: xMax }],
	yAxes: [{ id: "axis-1", min: 1, max: 100, scale: yScale }],
});

describe("createZoomHistory", () => {
	it("goes back and forward through recorded viewports", () => {
		const h = createZoomHistory(50, 500);
		const a = view(0, 10);
		const b = view(2, 8);
		const c = view(4, 6);
		h.record(a, 0);
		h.record(b, 1000);
		expect(h.back(c)).toBe(b);
		expect(h.back(b)).toBe(a);
		expect(h.back(a)).toBeUndefined();
		expect(h.forward(a)).toBe(b);
		expect(h.forward(b)).toBe(c);
		expect(h.forward(c)).toBeUndefined();
		expect(h.canBack).toBe(true);
		expect(h.canForward).toBe(false);
	});

	it("is bounded: the oldest entries fall off", () => {
		const h = createZoomHistory(3, 0);
		const views = [0, 1, 2, 3, 4].map((i) => view(i, i + 10));
		views.forEach((v, i) => {
			h.record(v, i * 10);
		});
		const cur = view(99, 100);
		expect(h.back(cur)).toBe(views[4]);
		expect(h.back(cur)).toBe(views[3]);
		expect(h.back(cur)).toBe(views[2]);
		expect(h.back(cur)).toBeUndefined();
	});

	it("coalesces settles in quick succession into the oldest viewport", () => {
		const h = createZoomHistory(50, 500);
		const a = view(0, 10);
		expect(h.record(a, 0)).toBe(true);
		// A held arrow key settles every frame; the window slides along.
		expect(h.record(view(1, 11), 16)).toBe(false);
		expect(h.record(view(2, 12), 400)).toBe(false);
		expect(h.record(view(3, 13), 800)).toBe(false);
		// A pause starts a new step.
		const later = view(4, 14);
		expect(h.record(later, 1400)).toBe(true);
		const cur = view(5, 15);
		expect(h.back(cur)).toBe(later);
		expect(h.back(later)).toBe(a);
		expect(h.canBack).toBe(false);
	});

	it("clears the forward stack when a new viewport is recorded", () => {
		const h = createZoomHistory(50, 500);
		const a = view(0, 10);
		const b = view(2, 8);
		h.record(a, 0);
		h.back(b);
		expect(h.canForward).toBe(true);
		h.record(a, 5000);
		expect(h.canForward).toBe(false);
		expect(h.forward(view(0, 1))).toBeUndefined();
	});

	it("does not merge the first change after a back into an older step", () => {
		const h = createZoomHistory(50, 500);
		h.record(view(0, 10), 0);
		h.record(view(1, 10), 1000);
		h.back(view(2, 10));
		// Within the window of the last record, but navigation broke the run.
		expect(h.record(view(1, 10), 1100)).toBe(true);
	});

	it("clear() empties both stacks", () => {
		const h = createZoomHistory();
		h.record(view(0, 10), 0);
		h.back(view(1, 2));
		h.clear();
		expect(h.canBack).toBe(false);
		expect(h.canForward).toBe(false);
	});
});

describe("snapshotFromTargets", () => {
	it("takes pending targets over the stored ranges", () => {
		const s = snapshotFromTargets(
			[
				{ id: "axis-1", min: 0, max: 10 },
				{ id: "axis-2", min: 5, max: 6 },
			],
			[{ id: "axis-1", min: 1, max: 100, scale: "log" }],
			{ "axis-1": { min: 2, max: 3 } },
			{},
		);
		expect(s.xAxes).toEqual([
			{ id: "axis-1", min: 2, max: 3, scale: undefined },
			{ id: "axis-2", min: 5, max: 6 },
		]);
		expect(s.yAxes[0]).toMatchObject({ min: 1, max: 100, scale: "log" });
	});
});

describe("restoreTargets", () => {
	it("points the targets at the snapshot and reports what moves", () => {
		const tx: RangeTargets = { "axis-1": { min: 4, max: 6 } };
		const ty: RangeTargets = {};
		const dest = restoreTargets(view(0, 10), view(4, 6), tx, ty);
		expect(tx["axis-1"]).toEqual({ min: 0, max: 10 });
		expect(dest).toEqual({
			x: { "axis-1": { min: 0, max: 10 } },
			y: {},
			changed: true,
		});
	});

	it("reports no change when already there", () => {
		const tx: RangeTargets = {};
		const ty: RangeTargets = {};
		expect(restoreTargets(view(0, 10), view(0, 10), tx, ty).changed).toBe(false);
		expect(tx).toEqual({});
	});

	it("leaves an axis alone whose scale changed since the snapshot", () => {
		const ty: RangeTargets = {};
		const saved: ViewportSnapshot = {
			xAxes: [],
			yAxes: [{ id: "axis-1", min: -5, max: 5 }],
		};
		const current: ViewportSnapshot = {
			xAxes: [],
			yAxes: [{ id: "axis-1", min: 1, max: 10, scale: "log" }],
		};
		expect(restoreTargets(saved, current, {}, ty).changed).toBe(false);
		expect(ty).toEqual({});
	});

	it("restores a log axis only to a positive range", () => {
		const ty: RangeTargets = {};
		const log = (min: number, max: number): ViewportSnapshot => ({
			xAxes: [],
			yAxes: [{ id: "axis-1", min, max, scale: "log" }],
		});
		expect(restoreTargets(log(0, 10), log(1, 10), {}, ty).changed).toBe(false);
		expect(restoreTargets(log(0.01, 10), log(1, 10), {}, ty).changed).toBe(true);
		expect(ty["axis-1"]).toEqual({ min: 0.01, max: 10 });
	});

	it("skips axes the snapshot does not know", () => {
		const tx: RangeTargets = {};
		const current: ViewportSnapshot = {
			xAxes: [
				{ id: "axis-1", min: 0, max: 1 },
				{ id: "axis-2", min: 0, max: 1 },
			],
			yAxes: [],
		};
		restoreTargets(view(5, 6), current, tx, {});
		expect(Object.keys(tx)).toEqual(["axis-1"]);
	});
});

describe("reachedRanges", () => {
	const axes = (min: number, max: number): AxisRangeEntry[] => [
		{ id: "axis-1", min, max },
	];
	it("matches within floating-point noise only", () => {
		const dest = { x: { "axis-1": { min: 1e9, max: 1e9 + 10 } }, y: {} };
		expect(
			reachedRanges({ xAxes: axes(1e9 + 1e-3, 1e9 + 10), yAxes: [] }, dest),
		).toBe(true);
		expect(
			reachedRanges({ xAxes: axes(1e9 + 5, 1e9 + 10), yAxes: [] }, dest),
		).toBe(false);
	});
});
