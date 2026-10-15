import { describe, expect, it } from "vitest";
import {
	pushBoundedQueue,
	statefulAvgGroup,
	statefulAvgN,
	statefulAvgTime,
	statefulCummax,
	statefulCummin,
	statefulCumprod,
	statefulCumsum,
	statefulDiff,
	statefulFilter,
	statefulLag,
	statefulRollingMax,
	statefulRollingMed,
	statefulRollingMin,
	statefulRollingStd,
	statefulSumGroup,
} from "../stateful";
import type { FormulaContext } from "../types";

const newCtx = (): FormulaContext => ({
	queues: {},
	sums: {},
	sumsSq: {},
	counts: {},
	stdEvictions: {},
	timeQueues: {},
	timeSums: {},
	groupSums: {},
	groupCounts: {},
	groupLastKey: {},
	lagBuffers: {},
	prevVals: {},
	hasPrev: {},
	cumState: {},
	cumHas: {},
	filterState: {},
});

/** Feed `values` through a one-slot primitive and collect its outputs. */
function feed(
	values: number[],
	step: (ctx: FormulaContext, v: number, i: number) => number,
): number[] {
	const ctx = newCtx();
	return values.map((v, i) => step(ctx, v, i));
}

describe("statefulAvgN", () => {
	it("averages the last n rows", () => {
		expect(feed([2, 4, 6, 8], (c, v) => statefulAvgN(c, 1, v, 2))).toEqual([
			2, 3, 5, 7,
		]);
	});

	it("keeps separate state per function id", () => {
		const ctx = newCtx();
		statefulAvgN(ctx, 1, 100, 3);
		expect(statefulAvgN(ctx, 2, 1, 3)).toBe(1);
	});
});

describe("statefulAvgTime", () => {
	it("averages the values within the trailing time window (seconds input)", () => {
		const ctx = newCtx();
		expect(statefulAvgTime(ctx, 1, 10, 1000, 2)).toBe(10);
		expect(statefulAvgTime(ctx, 1, 20, 1001, 2)).toBe(15);
		// t=1000 now falls on the cutoff and leaves the window.
		expect(statefulAvgTime(ctx, 1, 30, 1002, 2)).toBe(25);
	});

	it("accepts millisecond timestamps", () => {
		const base = 1_700_000_000_000;
		const ctx = newCtx();
		statefulAvgTime(ctx, 1, 10, base, 1);
		expect(statefulAvgTime(ctx, 1, 30, base + 500, 1)).toBe(20);
		expect(statefulAvgTime(ctx, 1, 50, base + 1200, 1)).toBe(40);
	});

	it("is NaN for a row without a usable timestamp and does not block eviction", () => {
		const ctx = newCtx();
		statefulAvgTime(ctx, 1, 10, 1000, 1);
		expect(statefulAvgTime(ctx, 1, 99, NaN, 1)).toBeNaN();
		expect(statefulAvgTime(ctx, 1, 20, 1005, 1)).toBe(20);
	});

	it("skips non-finite values and is NaN while the window is empty", () => {
		const ctx = newCtx();
		expect(statefulAvgTime(ctx, 1, NaN, 1000, 1)).toBeNaN();
		expect(statefulAvgTime(ctx, 1, 4, 1001, 1)).toBe(4);
	});
});

describe("group aggregates", () => {
	it("averages within a key and restarts when the key changes", () => {
		const keys = ["a", "a", "b", "b"];
		expect(
			feed([1, 3, 10, NaN], (c, v, i) => statefulAvgGroup(c, 1, v, keys[i])),
		).toEqual([1, 2, 10, 10]);
	});

	it("sums within a key and is NaN for a group with no finite value", () => {
		const keys = [1, 1, 2];
		const out = feed([1, 2, NaN], (c, v, i) =>
			statefulSumGroup(c, 1, v, keys[i]),
		);
		expect(out.slice(0, 2)).toEqual([1, 3]);
		expect(out[2]).toBeNaN();
	});
});

describe("bounded-window aggregates", () => {
	it("pushBoundedQueue keeps at most n entries, oldest first", () => {
		const ctx = newCtx();
		pushBoundedQueue(ctx, 1, 1, 2);
		pushBoundedQueue(ctx, 1, 2, 2);
		expect(pushBoundedQueue(ctx, 1, 3, 2)).toEqual([2, 3]);
	});

	it("rolling median, min and max over the finite window", () => {
		const vals = [5, 1, NaN, 9, 3];
		expect(feed(vals, (c, v) => statefulRollingMed(c, 1, v, 3))).toEqual([
			5, 3, 3, 5, 6,
		]);
		expect(feed(vals, (c, v) => statefulRollingMin(c, 1, v, 2))).toEqual([
			5, 1, 1, 9, 3,
		]);
		expect(feed(vals, (c, v) => statefulRollingMax(c, 1, v, 2))).toEqual([
			5, 5, 1, 9, 9,
		]);
	});

	it("rolling min/max/median are NaN when the window holds no finite value", () => {
		const vals = [NaN, NaN];
		for (const fn of [
			statefulRollingMed,
			statefulRollingMin,
			statefulRollingMax,
		]) {
			expect(feed(vals, (c, v) => fn(c, 1, v, 2)).every(Number.isNaN)).toBe(true);
		}
	});

	it("rolling std matches a direct computation over a long column", () => {
		const n = 5;
		const vals = Array.from(
			{ length: 200 },
			(_, i) => 1e6 + Math.sin(i) * 3 + (i % 7 === 0 ? NaN : 0),
		);
		const out = feed(vals, (c, v) => statefulRollingStd(c, 1, v, n));
		for (let i = n; i < vals.length; i++) {
			const w = vals.slice(i - n + 1, i + 1).filter(Number.isFinite);
			const mean = w.reduce((a, b) => a + b, 0) / w.length;
			const sd = Math.sqrt(
				w.reduce((a, b) => a + (b - mean) ** 2, 0) / (w.length - 1),
			);
			expect(out[i]).toBeCloseTo(sd, 6);
		}
	});

	it("rolling std resets once every finite value has left the window", () => {
		const out = feed([4, NaN, NaN, 6], (c, v) => statefulRollingStd(c, 1, v, 2));
		expect(out[0]).toBe(0);
		expect(out[1]).toBe(0);
		expect(out[2]).toBeNaN();
		expect(out[3]).toBe(0);
	});
});

describe("lag and diff", () => {
	it("lag shifts by n rows and passes NaN through", () => {
		const out = feed([1, NaN, 3, 4], (c, v) => statefulLag(c, 1, v, 1));
		expect(out[0]).toBeNaN();
		expect(out[1]).toBe(1);
		expect(out[2]).toBeNaN();
		expect(out[3]).toBe(3);
	});

	it("lag of 0 is the identity", () => {
		expect(feed([7, 8], (c, v) => statefulLag(c, 1, v, 0))).toEqual([7, 8]);
	});

	it("diff skips gaps and diffs against the last finite value", () => {
		const out = feed([1, 4, NaN, 10], (c, v) => statefulDiff(c, 1, v));
		expect(out[0]).toBeNaN();
		expect(out[1]).toBe(3);
		expect(out[2]).toBeNaN();
		expect(out[3]).toBe(6);
	});
});

describe("cumulative reducers", () => {
	const vals = [NaN, 2, -1, NaN, 3];

	it("are NaN until the first finite value, then hold through gaps", () => {
		const sum = feed(vals, (c, v) => statefulCumsum(c, 1, v));
		expect(sum[0]).toBeNaN();
		expect(sum.slice(1)).toEqual([2, 1, 1, 4]);
		expect(feed(vals, (c, v) => statefulCumprod(c, 1, v)).slice(1)).toEqual([
			2, -2, -2, -6,
		]);
		expect(feed(vals, (c, v) => statefulCummax(c, 1, v)).slice(1)).toEqual([
			2, 2, 2, 3,
		]);
		expect(feed(vals, (c, v) => statefulCummin(c, 1, v)).slice(1)).toEqual([
			2, -1, -1, -1,
		]);
	});
});

describe("statefulFilter", () => {
	it("starts at the first finite value and holds its estimate through gaps", () => {
		const ctx = newCtx();
		expect(statefulFilter(ctx, 1, NaN)).toBeNaN();
		expect(statefulFilter(ctx, 1, 10)).toBe(10);
		const next = statefulFilter(ctx, 1, 20);
		expect(next).toBeGreaterThan(10);
		expect(next).toBeLessThan(20);
		expect(statefulFilter(ctx, 1, NaN)).toBe(next);
	});

	it("tracks a step faster with more process noise", () => {
		const run = (noise?: number) => {
			const ctx = newCtx();
			statefulFilter(ctx, 1, 0, noise);
			let v = 0;
			for (let i = 0; i < 5; i++) v = statefulFilter(ctx, 1, 10, noise);
			return v;
		};
		expect(run(1)).toBeGreaterThan(run());
		// A non-finite noise argument falls back to the default.
		expect(run(NaN)).toBe(run());
	});

	it("smooths a constant signal to that constant", () => {
		const out = feed([5, 5, 5, 5], (c, v) => statefulFilter(c, 1, v));
		for (const v of out) expect(v).toBeCloseTo(5);
	});
});
