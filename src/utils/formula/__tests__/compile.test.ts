import { describe, expect, it } from "vitest";
import { compileFormula } from "../compile";

const COLS = ["Timestamp", "a", "b"];

/** Compile against COLS and evaluate a single row given by column name. */
function run(formula: string, row: Record<string, number> = {}): number {
	const res = compileFormula(formula, COLS);
	expect(res.error).toBeUndefined();
	const values = res.usedColumnIndices.map((i) => row[COLS[i]] ?? NaN);
	return res.evaluate(values, res.createContext?.());
}

describe("compileFormula — operators", () => {
	it.each([
		["7 + 2", 9],
		["7 - 2", 5],
		["7 * 2", 14],
		["7 / 2", 3.5],
		["-7 % 3", 2],
		["2 ^ 10", 1024],
		["3 == 3", 1],
		["3 != 3", 0],
		["2 < 3", 1],
		["2 > 3", 0],
		["3 <= 3", 1],
		["2 >= 3", 0],
	])("%s = %d", (f, expected) => {
		expect(run(f)).toBe(expected);
	});

	it("respects precedence and parentheses", () => {
		expect(run("1 + 2 * 3")).toBe(7);
		expect(run("(1 + 2) * 3")).toBe(9);
		expect(run("2 * 3 ^ 2")).toBe(18);
	});

	it("applies unary minus and logical not", () => {
		expect(run("-[a]", { a: 4 })).toBe(-4);
		expect(run("--[a]", { a: 4 })).toBe(4);
		expect(run("![a]", { a: 0 })).toBe(1);
		expect(run("![a]", { a: 5 })).toBe(0);
		expect(run("![a]", { a: NaN })).toBe(1);
	});

	it("&& and || return an operand, treating 0 and NaN as false", () => {
		expect(run("[a] && [b]", { a: 2, b: 3 })).toBe(3);
		expect(run("[a] && [b]", { a: 0, b: 3 })).toBe(0);
		expect(run("[a] || [b]", { a: 2, b: 3 })).toBe(2);
		expect(run("[a] || [b]", { a: NaN, b: 3 })).toBe(3);
	});

	it("propagates NaN through arithmetic", () => {
		expect(run("[a] + 1", { a: NaN })).toBeNaN();
	});

	it("evaluates constants and nested function calls", () => {
		expect(run("round(pi * 100)")).toBe(314);
		expect(run("max(abs([a]), sqrt([b]))", { a: -2, b: 9 })).toBe(3);
	});

	it("handles deeply nested expressions without overflowing the stack", () => {
		const depth = 200;
		const f = `${"(".repeat(depth)}1${" + 1)".repeat(depth)}`;
		expect(run(f)).toBe(depth + 1);
	});
});

describe("compileFormula — column binding", () => {
	it("only reads the columns the formula references, in first-use order", () => {
		const res = compileFormula("[b] - [a] + [b]", COLS);
		expect(res.usedColumnIndices).toEqual([2, 1]);
		expect(res.evaluate([10, 4])).toBe(16);
	});

	it("binds a duplicated column name to its first occurrence", () => {
		const res = compileFormula("[a]", ["a", "a"]);
		expect(res.usedColumnIndices).toEqual([0]);
	});

	it("argument-less aggregates span every non-time column", () => {
		const res = compileFormula("sum()", COLS);
		expect(res.error).toBeUndefined();
		expect(res.usedColumnIndices.map((i) => COLS[i]).sort()).toEqual(["a", "b"]);
		const vals = res.usedColumnIndices.map((i) => ({ a: 2, b: 5 })[COLS[i]]!);
		expect(res.evaluate(vals)).toBe(7);
	});

	it("reuses an already-referenced column for argument-less aggregates", () => {
		const res = compileFormula("[a] + avg()", COLS);
		expect(res.usedColumnIndices).toEqual([1, 2]);
		expect(res.evaluate([2, 4])).toBe(5);
	});

	it("time-based functions fall back to column 0 when no time/date column exists", () => {
		const res = compileFormula("avg2s([y])", ["t", "y"]);
		expect(res.error).toBeUndefined();
		expect(res.usedColumnIndices).toEqual([1, 0]);
	});

	it("picks a column named like a date for time-based functions", () => {
		const res = compileFormula("avg2s([y])", ["x", "y", "Date"]);
		expect(res.usedColumnIndices).toEqual([1, 2]);
	});

	it("does not double-bind the time column when the formula also references it", () => {
		const res = compileFormula("[Timestamp] + avg2s([a])", COLS);
		expect(res.usedColumnIndices).toEqual([0, 1]);
	});

	it("gives every stateful call its own context slot", () => {
		const res = compileFormula("lag([a], 1) + lag([a], 1)", COLS);
		const ctx = res.createContext?.();
		res.evaluate([1], ctx);
		expect(res.evaluate([2], ctx)).toBe(2);
	});
});

describe("compileFormula — errors", () => {
	it("reports an unknown column with its position", () => {
		const res = compileFormula("1 + [nope]", COLS);
		expect(res.error).toMatch(/nope/);
		expect(res.evaluate([])).toBeNaN();
		expect(res.usedColumnIndices).toEqual([]);
	});

	it("reports mismatched parentheses with a position", () => {
		const res = compileFormula("(1 + 2", COLS);
		expect(res.error).toMatch(/parenthes/i);
		expect(res.errorPos).toBeTypeOf("number");
	});

	it("reports an unknown function", () => {
		const res = compileFormula("bogus(1)", COLS);
		expect(res.error).toBeDefined();
		expect(res.evaluate([])).toBeNaN();
	});

	it("rejects a dangling operator", () => {
		expect(compileFormula("1 +", COLS).error).toBeDefined();
	});

	it("returns a usable context factory even on error", () => {
		const res = compileFormula(")", COLS);
		expect(res.error).toBeDefined();
		expect(res.createContext?.()).toEqual({});
	});
});
