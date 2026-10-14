import { describe, expect, it } from "vitest";
import { compileFormula } from "../../formula";

/**
 * A non-finite input must not poison running state: before the fix one NaN
 * turned every later row of a rolling/cumulative column into NaN.
 */

const cols = ["Timestamp", "Temp"];

/** Evaluate a single-column stateful formula row by row. */
function run(formula: string, values: number[]): number[] {
	const { evaluate, createContext, error } = compileFormula(formula, cols);
	expect(error).toBeUndefined();
	const ctx = createContext?.();
	return values.map((v) => evaluate([v], ctx));
}

describe("stateful functions skip non-finite inputs", () => {
	it("rolling averages the finite values in the window", () => {
		expect(run("rolling([Temp], 2)", [1, NaN, 3, 5, 7])).toEqual([1, 1, 3, 4, 6]);
	});

	it("rolling is NaN only while the window holds no finite value", () => {
		const out = run("rolling([Temp], 2)", [NaN, NaN, 4, Infinity, NaN, 2]);
		expect(out[0]).toBeNaN();
		expect(out[1]).toBeNaN();
		expect(out.slice(2, 4)).toEqual([4, 4]);
		expect(out[4]).toBeNaN();
		expect(out[5]).toBe(2);
	});

	it("rollingStd ignores NaN and recovers after it leaves the window", () => {
		const out = run("rollingStd([Temp], 3)", [2, NaN, 4, 6, 8]);
		expect(out[0]).toBe(0);
		expect(out[1]).toBe(0);
		expect(out[2]).toBeCloseTo(Math.SQRT2);
		expect(out[3]).toBeCloseTo(Math.SQRT2);
		expect(out[4]).toBeCloseTo(2);
	});

	it("rollingMed/Min/Max ignore NaN and are NaN for an all-NaN window", () => {
		const data = [5, NaN, 1, NaN, NaN, 3];
		const med = run("rollingMed([Temp], 2)", data);
		const min = run("rollingMin([Temp], 2)", data);
		const max = run("rollingMax([Temp], 2)", data);
		expect(med.slice(0, 4)).toEqual([5, 5, 1, 1]);
		expect(min.slice(0, 4)).toEqual([5, 5, 1, 1]);
		expect(max.slice(0, 4)).toEqual([5, 5, 1, 1]);
		for (const out of [med, min, max]) {
			expect(out[4]).toBeNaN();
			expect(out[5]).toBe(3);
		}
	});

	it("cumulative functions carry the last state across NaN", () => {
		expect(run("cumsum([Temp])", [1, NaN, 2, 3])).toEqual([1, 1, 3, 6]);
		expect(run("cumprod([Temp])", [2, NaN, 3])).toEqual([2, 2, 6]);
		expect(run("cummax([Temp])", [2, NaN, 5, 1])).toEqual([2, 2, 5, 5]);
		expect(run("cummin([Temp])", [2, NaN, 1, 4])).toEqual([2, 2, 1, 1]);
		expect(run("cumsum([Temp])", [NaN, 4])[0]).toBeNaN();
	});

	it("diff is NaN for a gap row and spans the gap afterwards", () => {
		const out = run("diff([Temp])", [10, NaN, 13, 20]);
		expect(out[0]).toBeNaN();
		expect(out[1]).toBeNaN();
		expect(out.slice(2)).toEqual([3, 7]);
	});

	it("filter holds its estimate across NaN instead of going NaN", () => {
		const out = run("filter([Temp])", [10, 10, NaN, 10, 10]);
		for (const v of [out[0], out[1], out[3], out[4]]) expect(v).toBe(10);
		expect(out[2]).toBe(10);
		expect(run("filter([Temp])", [NaN, 3])).toEqual([NaN, 3]);
	});

	it("rollingTime skips NaN values and NaN timestamps", () => {
		const { evaluate, createContext } = compileFormula(
			"rollingTime([Temp], 2)",
			cols,
		);
		const ctx = createContext?.();
		// Row values are [Temp, Timestamp(seconds)].
		expect(evaluate([10, 1000], ctx)).toBe(10);
		expect(evaluate([NaN, 1001], ctx)).toBe(10);
		// A NaN timestamp used to sit at the queue head and block eviction
		// forever, so the window kept growing.
		expect(evaluate([99, NaN], ctx)).toBeNaN();
		expect(evaluate([20, 1002], ctx)).toBe(20);
		expect(evaluate([40, 1003], ctx)).toBe(30);
		expect(evaluate([60, 1010], ctx)).toBe(60);
	});

	it("rollingTime is NaN while its window holds no finite value", () => {
		const { evaluate, createContext } = compileFormula(
			"rollingTime([Temp], 1)",
			cols,
		);
		const ctx = createContext?.();
		expect(evaluate([NaN, 1000], ctx)).toBeNaN();
		expect(evaluate([5, 1001], ctx)).toBe(5);
		expect(evaluate([NaN, 1005], ctx)).toBeNaN();
	});

	it("day buckets ignore NaN values", () => {
		const t = 1600000000000;
		const avg = compileFormula("avgDay([Temp])", cols);
		const sum = compileFormula("sumDay([Temp])", cols);
		const cA = avg.createContext?.();
		const cS = sum.createContext?.();
		expect(avg.evaluate([NaN, t], cA)).toBeNaN();
		expect(sum.evaluate([NaN, t], cS)).toBeNaN();
		expect(avg.evaluate([4, t], cA)).toBe(4);
		expect(sum.evaluate([4, t], cS)).toBe(4);
		expect(avg.evaluate([NaN, t], cA)).toBe(4);
		expect(avg.evaluate([8, t], cA)).toBe(6);
		expect(sum.evaluate([NaN, t], cS)).toBe(4);
		expect(sum.evaluate([8, t], cS)).toBe(12);
	});
});
