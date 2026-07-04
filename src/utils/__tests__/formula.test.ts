import { describe, expect, it, vi } from "vitest";
import {
	compileFormula,
	evaluateFormulaSync,
	type FormulaWorkerParams,
} from "../formula";

describe("compileFormula", () => {
	const columns = ["Timestamp", "Temp", "Hum", "Press"];

	it("should handle averaging functions", () => {
		const cols = ["Timestamp", "Temp"];
		const { evaluate, createContext } = compileFormula("avg3([Temp])", cols);
		const ctx = createContext?.();

		expect(evaluate([10], ctx)).toBe(10);
		expect(evaluate([20], ctx)).toBe(15);
		expect(evaluate([30], ctx)).toBe(20);
		expect(evaluate([40], ctx)).toBe(30);
	});

	it("should handle time-based averaging functions", () => {
		const cols = ["Timestamp", "Temp"];
		const { evaluate, createContext, usedColumnIndices } = compileFormula(
			"avg2s([Temp])",
			cols,
		);
		const ctx = createContext?.();

		expect(usedColumnIndices).toEqual([1, 0]);

		expect(evaluate([10, 1000], ctx)).toBe(10);
		expect(evaluate([20, 1001], ctx)).toBe(15);
		expect(evaluate([30, 1002], ctx)).toBe(25);
		expect(evaluate([40, 1003], ctx)).toBe(35);
	});

	it("should handle filter function", () => {
		const cols = ["Timestamp", "Temp"];
		const { evaluate, createContext } = compileFormula("filter([Temp])", cols);
		const ctx = createContext?.();

		const v1 = evaluate([10], ctx);
		expect(v1).toBe(10);
		const v2 = evaluate([20], ctx);
		expect(v2).toBeGreaterThan(10);
		expect(v2).toBeLessThan(20);
	});

	it("should handle basic arithmetic", () => {
		const { evaluate, usedColumnIndices } = compileFormula(
			"[Temp] + [Hum]",
			columns,
		);
		expect(usedColumnIndices).toEqual([1, 2]);
		expect(evaluate([10, 20])).toBe(30);
	});

	it("should handle trig and math functions", () => {
		const { evaluate: evalSin } = compileFormula("sin(pi/2)", columns);
		expect(evalSin([])).toBeCloseTo(1);

		const { evaluate: evalSqrt } = compileFormula("sqrt(16)", columns);
		expect(evalSqrt([])).toBe(4);

		const { evaluate: evalAbs } = compileFormula("abs(-5)", columns);
		expect(evalAbs([])).toBe(5);
	});

	it("should handle multi-argument functions", () => {
		const { evaluate: evalMin } = compileFormula("min(10, 5, 20)", columns);
		expect(evalMin([])).toBe(5);

		const { evaluate: evalMax } = compileFormula("max(10, 5, 20)", columns);
		expect(evalMax([])).toBe(20);

		const { evaluate: evalAvg } = compileFormula("avg(10, 20, 30)", columns);
		expect(evalAvg([])).toBe(20);
	});

	it("should handle avg() over all numeric columns", () => {
		const { evaluate, usedColumnIndices } = compileFormula("avg()", columns);
		expect(usedColumnIndices).toEqual([1, 2, 3]);
		expect(evaluate([10, 20, 30])).toBe(20);
	});

	it("should handle avgDay resetting", () => {
		const { evaluate, createContext, usedColumnIndices } = compileFormula(
			"avgday([Temp])",
			columns,
		);
		const ctx = createContext?.();

		expect(usedColumnIndices).toEqual([1, 0]);

		const t1 = new Date("2023-01-01T10:00:00Z").getTime() / 1000;
		const t2 = new Date("2023-01-01T11:00:00Z").getTime() / 1000;
		const t3 = new Date("2023-01-02T10:00:00Z").getTime() / 1000;

		expect(evaluate([10, t1], ctx)).toBe(10);
		expect(evaluate([20, t2], ctx)).toBe(15);
		expect(evaluate([40, t3], ctx)).toBe(40);
	});

	it("should handle constants pi and e", () => {
		const { evaluate } = compileFormula("pi * e", columns);
		expect(evaluate([])).toBeCloseTo(Math.PI * Math.E);
	});

	it("should handle log (base 10)", () => {
		const { evaluate } = compileFormula("log(100)", columns);
		expect(evaluate([])).toBe(2);
	});

	it("should handle power operator ^", () => {
		const { evaluate } = compileFormula("2^3", columns);
		expect(evaluate([])).toBe(8);
	});

	it("should handle nested expressions and brackets", () => {
		const { evaluate, usedColumnIndices } = compileFormula(
			"([Temp] + 10) * 2",
			columns,
		);
		expect(usedColumnIndices).toEqual([1]);
		expect(evaluate([5])).toBe(30);
	});

	it("should handle unary negation and negative numbers", () => {
		const { evaluate, usedColumnIndices } = compileFormula(
			"-[Temp] * -1",
			columns,
		);
		expect(usedColumnIndices).toEqual([1]);
		expect(evaluate([10])).toBe(10);

		const { evaluate: eval2 } = compileFormula("5 + -2", columns);
		expect(eval2([])).toBe(3);

		const { evaluate: eval3 } = compileFormula("-log(100)", columns);
		expect(eval3([])).toBe(-2);
	});

	it("should return error for invalid columns", () => {
		const { error } = compileFormula("[NonExistent]", columns);
		expect(error).toContain("Column not found");
	});

	it("should return error for invalid characters", () => {
		const { error } = compileFormula("window.alert(1)", columns);
		expect(error).toBeDefined();
	});

	it("should handle error paths for invalid tokens and compilation errors", () => {
		// Missing closing bracket
		const res1 = compileFormula("[Temp", columns);
		expect(res1.error).toContain("Missing closing bracket ]");
		expect(res1.evaluate([])).toBeNaN();
		expect(res1.usedColumnIndices).toEqual([]);

		// Unknown function
		const res2 = compileFormula("unknownfunc([Temp])", columns);
		expect(res2.error).toContain("Unknown function or constant: unknownfunc");
		expect(res2.evaluate([])).toBeNaN();

		// Unexpected comma in expression without functions handling it
		const res3 = compileFormula("10, 20", columns);
		expect(res3.error).toContain("Unexpected comma");
		expect(res3.evaluate([])).toBeNaN();

		// Mismatched parentheses - missing opening
		const res4 = compileFormula("10 + 20)", columns);
		expect(res4.error).toContain("Mismatched parentheses");
		expect(res4.evaluate([])).toBeNaN();

		// Mismatched parentheses - missing closing
		const res5 = compileFormula("(10 + 20", columns);
		expect(res5.error).toContain("Mismatched parentheses");
		expect(res5.evaluate([])).toBeNaN();

		// Mismatched parentheses - extra closing parenthesis
		const resExtraClose = compileFormula("1+1)", columns);
		expect(resExtraClose.error).toContain("Mismatched parentheses");
		expect(resExtraClose.evaluate([])).toBeNaN();

		// Mismatched parentheses - missing closing on simple expression
		const resMissingClose = compileFormula("(1+1", columns);
		expect(resMissingClose.error).toContain("Mismatched parentheses");
		expect(resMissingClose.evaluate([])).toBeNaN();

		// Mismatched parentheses - extra closing parenthesis on function
		const resExtraCloseFunc = compileFormula("min(1,2))", columns);
		expect(resExtraCloseFunc.error).toContain("Mismatched parentheses");
		expect(resExtraCloseFunc.evaluate([])).toBeNaN();

		// Unexpected character during lexing
		const res6 = compileFormula("10 $ 20", columns);
		expect(res6.error).toContain("Unexpected character: $");
		expect(res6.evaluate([])).toBeNaN();
		expect(res6.usedColumnIndices).toEqual([]);

		const res7 = compileFormula("10 @ 20", columns);
		expect(res7.error).toContain("Unexpected character: @");
		expect(res7.evaluate([])).toBeNaN();
		expect(res7.usedColumnIndices).toEqual([]);
	});

	it("should handle missing functions coverage", () => {
		const resAsin = compileFormula("asin(1)", columns);
		expect(resAsin.evaluate([])).toBeCloseTo(Math.PI / 2);

		const resAcos = compileFormula("acos(1)", columns);
		expect(resAcos.evaluate([])).toBeCloseTo(0);

		const resAtan = compileFormula("atan(1)", columns);
		expect(resAtan.evaluate([])).toBeCloseTo(Math.PI / 4);

		const resExp = compileFormula("exp(1)", columns);
		expect(resExp.evaluate([])).toBeCloseTo(Math.E);

		const resLn = compileFormula("ln(1)", columns);
		expect(resLn.evaluate([])).toBeCloseTo(0);

		const resRound = compileFormula("round(1.5)", columns);
		expect(resRound.evaluate([])).toBe(2);

		const resFloor = compileFormula("floor(1.5)", columns);
		expect(resFloor.evaluate([])).toBe(1);

		const resCeil = compileFormula("ceil(1.5)", columns);
		expect(resCeil.evaluate([])).toBe(2);
	});

	it("should test sum() and sum() arguments coverage", () => {
		const { evaluate: evalSumAll } = compileFormula("sum()", columns);
		expect(evalSumAll([10, 20, 30, 40])).toBe(60);

		const { evaluate: evalSumArgs } = compileFormula("sum(10, 20)", columns);
		expect(evalSumArgs([])).toBe(30);
	});

	it("should test sumday, avghour, sumhour, avgminute, avgsecond", () => {
		const resSumDay = compileFormula("sumday([Temp])", columns);
		const ctxSumDay = resSumDay.createContext?.();
		const t1 = new Date("2023-01-01T10:00:00Z").getTime() / 1000;
		const t2 = new Date("2023-01-01T11:00:00Z").getTime() / 1000;
		const t3 = new Date("2023-01-02T10:00:00Z").getTime() / 1000;

		expect(resSumDay.evaluate([10, t1], ctxSumDay)).toBe(10);
		expect(resSumDay.evaluate([20, t2], ctxSumDay)).toBe(30);
		expect(resSumDay.evaluate([40, t3], ctxSumDay)).toBe(40);

		const resAvgHour = compileFormula("avghour([Temp])", columns);
		const ctxAvgHour = resAvgHour.createContext?.();
		expect(resAvgHour.evaluate([10, t1], ctxAvgHour)).toBe(10);
		expect(resAvgHour.evaluate([20, t1 + 10], ctxAvgHour)).toBe(15);
		expect(resAvgHour.evaluate([40, t2], ctxAvgHour)).toBe(40);

		const resSumHour = compileFormula("sumhour([Temp])", columns);
		const ctxSumHour = resSumHour.createContext?.();
		expect(resSumHour.evaluate([10, t1], ctxSumHour)).toBe(10);
		expect(resSumHour.evaluate([20, t1 + 10], ctxSumHour)).toBe(30);
		expect(resSumHour.evaluate([40, t2], ctxSumHour)).toBe(40);

		const resAvgMin = compileFormula("avgminute([Temp])", columns);
		const ctxAvgMin = resAvgMin.createContext?.();
		expect(resAvgMin.evaluate([10, t1], ctxAvgMin)).toBe(10);
		expect(resAvgMin.evaluate([20, t1 + 10], ctxAvgMin)).toBe(15); // same minute
		expect(resAvgMin.evaluate([40, t1 + 60], ctxAvgMin)).toBe(40); // next minute

		const resAvgSec = compileFormula("avgsecond([Temp])", columns);
		const ctxAvgSec = resAvgSec.createContext?.();
		expect(resAvgSec.evaluate([10, t1], ctxAvgSec)).toBe(10);
		expect(resAvgSec.evaluate([20, t1], ctxAvgSec)).toBe(15); // same second
		expect(resAvgSec.evaluate([40, t1 + 1], ctxAvgSec)).toBe(40); // next second
	});

	it("should cover missing branches for evaluation logic", () => {
		// Testing the "Unexpected comma" error specifically where arguments are empty
		const resComma = compileFormula("1 , 2", columns);
		expect(resComma.error).toBe("Unexpected comma");

		// Testing "Unexpected comma" error when parsing comma within parentheses but outside of a function
		const resCommaParen = compileFormula("(1, 2)", columns);
		expect(resCommaParen.error).toBe("Unexpected comma");

		// Extra edge cases requested by reviewer
		const resMismatched1 = compileFormula("((1+2)", columns);
		expect(resMismatched1.error).toContain("Mismatched parentheses");

		const resMismatched3 = compileFormula(")", columns);
		expect(resMismatched3.error).toContain("Mismatched parentheses");

		const resMismatchedLeft = compileFormula("(1+1", columns);
		expect(resMismatchedLeft.error).toContain("Mismatched parentheses");

		// Test for 'avg1' without unit
		const resAvg1 = compileFormula("avg1([Temp])", columns);
		const ctxAvg1 = resAvg1.createContext?.();
		expect(resAvg1.evaluate([10], ctxAvg1)).toBe(10);
		expect(resAvg1.evaluate([20], ctxAvg1)).toBe(20);

		// Test for 'avg1m' with minute unit
		const resAvg1m = compileFormula("avg1m([Temp])", columns);
		const ctxAvg1m = resAvg1m.createContext?.();
		expect(resAvg1m.evaluate([10, 1000], ctxAvg1m)).toBe(10);

		// Test for 'avg1h' with hour unit
		const resAvg1h = compileFormula("avg1h([Temp])", columns);
		const ctxAvg1h = resAvg1h.createContext?.();
		expect(resAvg1h.evaluate([10, 1000], ctxAvg1h)).toBe(10);

		// Test for 'avg1d' with day unit
		const resAvg1d = compileFormula("avg1d([Temp])", columns);
		const ctxAvg1d = resAvg1d.createContext?.();
		expect(resAvg1d.evaluate([10, 1000], ctxAvg1d)).toBe(10);

		// Test evaluation without ctx for functions that expect one
		expect(resAvg1d.evaluate([10, 1000])).toBe(10);

		const resSumDay = compileFormula("sumday([Temp])", columns);
		expect(resSumDay.evaluate([20, 1000])).toBe(20);

		// Unknown column reference reports a clear error.
		const resUnknown = compileFormula("[Unknown]", columns);
		expect(resUnknown.error).toContain("Column not found: Unknown");

		// Defensive fallback testing - providing unknown functions triggers an error
		// earlier in the lexer as checked in 'should return error for invalid characters'
		// but the token evaluation includes a fallback. This handles edge
		// cases we cannot easily trigger through the string compiler directly without mock modifications.
	});
});

describe("compileFormula — new language features", () => {
	const columns = ["Timestamp", "Temp", "Hum", "Press"];

	it("parses scientific-notation numeric literals", () => {
		expect(compileFormula("1e3", columns).evaluate([])).toBe(1000);
		expect(compileFormula("1.5e-2", columns).evaluate([])).toBeCloseTo(0.015);
		expect(compileFormula("2.5E+2 + 1", columns).evaluate([])).toBe(251);
	});

	it("evaluates comparison and logical operators", () => {
		expect(compileFormula("1 < 2", columns).evaluate([])).toBe(1);
		expect(compileFormula("1 > 2", columns).evaluate([])).toBe(0);
		expect(compileFormula("3 == 3", columns).evaluate([])).toBe(1);
		expect(compileFormula("3 != 3", columns).evaluate([])).toBe(0);
		expect(compileFormula("2 <= 2", columns).evaluate([])).toBe(1);
		expect(compileFormula("2 >= 3", columns).evaluate([])).toBe(0);
		expect(compileFormula("1 && 0", columns).evaluate([])).toBe(0);
		expect(compileFormula("1 || 0", columns).evaluate([])).toBe(1);
		expect(compileFormula("!0", columns).evaluate([])).toBe(1);
		expect(compileFormula("!5", columns).evaluate([])).toBe(0);
	});

	it("comparison precedence works with arithmetic", () => {
		// 1 + 2 > 2 → 3 > 2 → 1
		expect(compileFormula("1 + 2 > 2", columns).evaluate([])).toBe(1);
		// && binds tighter than ||
		expect(compileFormula("0 || 1 && 0", columns).evaluate([])).toBe(0);
	});

	it("evaluates if(cond, a, b)", () => {
		const { evaluate, usedColumnIndices } = compileFormula(
			"if([Temp] > 100, 1, 0)",
			columns,
		);
		// Only [Temp] is referenced, so row is single-valued.
		expect(usedColumnIndices).toEqual([1]);
		expect(evaluate([50])).toBe(0);
		expect(evaluate([150])).toBe(1);
	});

	it("rejects if with wrong arity", () => {
		const { error } = compileFormula("if([Temp] > 0, 1)", columns);
		expect(error).toContain("if");
		expect(error).toContain("3 argument");
	});

	it("evaluates isnan and coalesce", () => {
		expect(compileFormula("isnan(0/0)", columns).evaluate([])).toBe(1);
		expect(compileFormula("isnan(1)", columns).evaluate([])).toBe(0);
		expect(compileFormula("coalesce(0/0, 0/0, 7)", columns).evaluate([])).toBe(7);
		expect(compileFormula("coalesce(0/0, 0/0)", columns).evaluate([])).toBeNaN();
	});

	it("evaluates new math functions", () => {
		expect(compileFormula("mod(7, 3)", columns).evaluate([])).toBe(1);
		expect(compileFormula("mod(-7, 3)", columns).evaluate([])).toBe(2);
		expect(compileFormula("sign(-3)", columns).evaluate([])).toBe(-1);
		expect(compileFormula("clamp(15, 0, 10)", columns).evaluate([])).toBe(10);
		expect(compileFormula("clamp(-5, 0, 10)", columns).evaluate([])).toBe(0);
		expect(compileFormula("atan2(1, 1)", columns).evaluate([])).toBeCloseTo(
			Math.PI / 4,
		);
		expect(compileFormula("hypot(3, 4)", columns).evaluate([])).toBe(5);
		expect(compileFormula("log2(8)", columns).evaluate([])).toBe(3);
		expect(compileFormula("logn(3, 27)", columns).evaluate([])).toBeCloseTo(3);
		expect(compileFormula("pow(2, 10)", columns).evaluate([])).toBe(1024);
		expect(compileFormula("trunc(3.7)", columns).evaluate([])).toBe(3);
		expect(compileFormula("trunc(-3.7)", columns).evaluate([])).toBe(-3);
		expect(compileFormula("sinh(0)", columns).evaluate([])).toBe(0);
		expect(compileFormula("cosh(0)", columns).evaluate([])).toBe(1);
		expect(compileFormula("tanh(0)", columns).evaluate([])).toBe(0);
	});

	it("evaluates median, std, var over arguments", () => {
		expect(compileFormula("median(1, 2, 3)", columns).evaluate([])).toBe(2);
		expect(compileFormula("median(1, 2, 3, 4)", columns).evaluate([])).toBe(2.5);
		// Sample (n-1) variance / std.
		expect(compileFormula("var(2, 4, 4, 4, 5, 5, 7, 9)", columns).evaluate([])).toBeCloseTo(32 / 7);
		expect(compileFormula("std(2, 4, 4, 4, 5, 5, 7, 9)", columns).evaluate([])).toBeCloseTo(Math.sqrt(32 / 7));
	});

	it("aggregates with no args fall back to all numeric row columns", () => {
		expect(compileFormula("median()", columns).evaluate([10, 20, 30])).toBe(20);
		expect(compileFormula("std()", columns).usedColumnIndices.length).toBe(3);
	});

	it("rolling(expr, n) is equivalent to legacy avgN", () => {
		const cols = ["Timestamp", "Temp"];
		const a = compileFormula("rolling([Temp], 3)", cols);
		const b = compileFormula("avg3([Temp])", cols);
		const ctxA = a.createContext?.();
		const ctxB = b.createContext?.();
		for (const v of [10, 20, 30, 40, 50]) {
			expect(a.evaluate([v], ctxA)).toBe(b.evaluate([v], ctxB));
		}
	});

	it("rollingMed/Std/Min/Max give correct running stats", () => {
		const cols = ["Timestamp", "Temp"];

		const med = compileFormula("rollingMed([Temp], 3)", cols);
		const cMed = med.createContext?.();
		expect(med.evaluate([10], cMed)).toBe(10);
		expect(med.evaluate([20], cMed)).toBe(15);
		expect(med.evaluate([30], cMed)).toBe(20);
		expect(med.evaluate([100], cMed)).toBe(30);

		const std = compileFormula("rollingStd([Temp], 3)", cols);
		const cStd = std.createContext?.();
		std.evaluate([2], cStd);
		std.evaluate([4], cStd);
		expect(std.evaluate([6], cStd)).toBeCloseTo(2);

		const rmin = compileFormula("rollingMin([Temp], 3)", cols);
		const cMin = rmin.createContext?.();
		rmin.evaluate([5], cMin);
		rmin.evaluate([3], cMin);
		expect(rmin.evaluate([7], cMin)).toBe(3);

		const rmax = compileFormula("rollingMax([Temp], 3)", cols);
		const cMax = rmax.createContext?.();
		rmax.evaluate([5], cMax);
		rmax.evaluate([10], cMax);
		expect(rmax.evaluate([7], cMax)).toBe(10);
	});

	it("rolling rejects non-constant window argument", () => {
		const { error } = compileFormula("rolling([Temp], [Hum])", columns);
		expect(error).toContain("constant number");
	});

	it("rollingTime(expr, seconds) matches avgNs", () => {
		const cols = ["Timestamp", "Temp"];
		const a = compileFormula("rollingTime([Temp], 2)", cols);
		const b = compileFormula("avg2s([Temp])", cols);
		const ctxA = a.createContext?.();
		const ctxB = b.createContext?.();
		expect(a.evaluate([10, 1000], ctxA)).toBe(b.evaluate([10, 1000], ctxB));
		expect(a.evaluate([20, 1001], ctxA)).toBe(b.evaluate([20, 1001], ctxB));
		expect(a.evaluate([30, 1002], ctxA)).toBe(b.evaluate([30, 1002], ctxB));
	});

	it("lag(expr, n)", () => {
		const cols = ["Timestamp", "Temp"];
		const { evaluate, createContext } = compileFormula(
			"lag([Temp], 2)",
			cols,
		);
		const ctx = createContext?.();
		expect(evaluate([10], ctx)).toBeNaN();
		expect(evaluate([20], ctx)).toBeNaN();
		expect(evaluate([30], ctx)).toBe(10);
		expect(evaluate([40], ctx)).toBe(20);
	});

	it("diff(expr)", () => {
		const cols = ["Timestamp", "Temp"];
		const { evaluate, createContext } = compileFormula("diff([Temp])", cols);
		const ctx = createContext?.();
		expect(evaluate([10], ctx)).toBeNaN();
		expect(evaluate([13], ctx)).toBe(3);
		expect(evaluate([20], ctx)).toBe(7);
		expect(evaluate([19], ctx)).toBe(-1);
	});

	it("cumsum / cumprod / cummax / cummin", () => {
		const cols = ["Timestamp", "Temp"];
		const sum = compileFormula("cumsum([Temp])", cols);
		const c1 = sum.createContext?.();
		expect(sum.evaluate([1], c1)).toBe(1);
		expect(sum.evaluate([2], c1)).toBe(3);
		expect(sum.evaluate([3], c1)).toBe(6);

		const prod = compileFormula("cumprod([Temp])", cols);
		const c2 = prod.createContext?.();
		expect(prod.evaluate([2], c2)).toBe(2);
		expect(prod.evaluate([3], c2)).toBe(6);
		expect(prod.evaluate([4], c2)).toBe(24);

		const mx = compileFormula("cummax([Temp])", cols);
		const c3 = mx.createContext?.();
		mx.evaluate([5], c3);
		mx.evaluate([3], c3);
		expect(mx.evaluate([8], c3)).toBe(8);
		expect(mx.evaluate([2], c3)).toBe(8);

		const mn = compileFormula("cummin([Temp])", cols);
		const c4 = mn.createContext?.();
		mn.evaluate([5], c4);
		mn.evaluate([3], c4);
		expect(mn.evaluate([8], c4)).toBe(3);
		expect(mn.evaluate([1], c4)).toBe(1);
	});

	it("filter(expr, processNoise) accepts tuning argument", () => {
		const cols = ["Timestamp", "Temp"];
		const slow = compileFormula("filter([Temp], 1e-6)", cols);
		const fast = compileFormula("filter([Temp], 0.5)", cols);
		const cS = slow.createContext?.();
		const cF = fast.createContext?.();
		slow.evaluate([0], cS);
		fast.evaluate([0], cF);
		const slowOut = slow.evaluate([100], cS);
		const fastOut = fast.evaluate([100], cF);
		// Fast filter should track the jump more aggressively.
		expect(fastOut).toBeGreaterThan(slowOut);
	});

	it("error positions point at the offending character", () => {
		const r = compileFormula("1 + $ + 2", columns);
		expect(r.error).toContain("Unexpected character: $");
		expect(r.errorPos).toBe(4);
	});

	it("modulo operator", () => {
		expect(compileFormula("7 % 3", columns).evaluate([])).toBe(1);
		expect(compileFormula("-7 % 3", columns).evaluate([])).toBe(2);
	});
});

describe("evaluateFormulaSync", () => {
	it("should catch and return Error instances", () => {
		const params = {
			datasetId: "d1",
			name: "test",
			formula: "[A] + 1",
			columns: ["A"],
			rowCount: 1,
			columnData: [], // Missing data will cause TypeError when accessed
		};

		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error).toContain("Cannot read properties of undefined");
		}
	});

	it("should catch and return non-Error primitives as strings", () => {
		// Spy on String.prototype.match to throw a plain string instead of an Error
		// This forces evaluateFormulaSync to handle a non-Error thrown value in its try/catch
		const matchSpy = vi
			.spyOn(String.prototype, "match")
			.mockImplementationOnce(() => {
				throw "A string error from mock";
			});

		const params = {
			datasetId: "d1",
			name: "test",
			formula: "[A] + 1",
			columns: ["A"],
			rowCount: 1,
			columnData: [{ data: new Float64Array([1]), refPoint: 0 }],
		};

		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error).toBe("A string error from mock");
		}

		matchSpy.mockRestore();
	});
});

describe("evaluateFormulaSync — success paths", () => {
	// Build worker params the way useGraphStore does: columnData is ordered to
	// match compileFormula's usedColumnIndices. `fullColumns` is indexed by the
	// global column index.
	function buildParams(
		formula: string,
		columns: string[],
		fullColumns: number[][],
	): FormulaWorkerParams {
		const { usedColumnIndices } = compileFormula(formula, columns);
		const rowCount = fullColumns[0].length;
		const columnData = usedColumnIndices.map((idx) => ({
			data: Float32Array.from(fullColumns[idx]),
			refPoint: 0,
		}));
		return { datasetId: "d1", name: "calc", formula, columns, rowCount, columnData };
	}

	function decode(col: {
		data: Float32Array | Float64Array;
		refPoint: number;
	}): number[] {
		return Array.from(col.data, (v) => v + col.refPoint);
	}

	it("evaluates a plain arithmetic formula across all rows", () => {
		const params = buildParams(
			"[Temp] * 2",
			["Time", "Temp"],
			[
				[0, 1, 2, 3],
				[10, 20, 30, 40],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			const decoded = decode(result.newColumn);
			[20, 40, 60, 80].forEach((v, i) => expect(decoded[i]).toBeCloseTo(v, 3));
			expect(result.sparseXColumn).toBeUndefined();
		}
	});

	it("returns an error for an invalid (non-compiling) formula", () => {
		const result = evaluateFormulaSync({
			datasetId: "d1",
			name: "calc",
			formula: "unknownfn([A])",
			columns: ["A"],
			rowCount: 1,
			columnData: [{ data: Float32Array.from([1]), refPoint: 0 }],
		});
		expect(result.type).toBe("error");
		if (result.type === "error") {
			expect(result.error).toContain("Unknown function");
		}
	});

	it("evaluates a linear regression formula via the regression path", () => {
		// y = 2x + 1
		const result = evaluateFormulaSync({
			datasetId: "d1",
			name: "fit",
			formula: "linreg([Y])",
			columns: ["X", "Y"],
			rowCount: 5,
			columnData: [
				{ data: Float32Array.from([0, 1, 2, 3, 4]), refPoint: 0 },
				{ data: Float32Array.from([1, 3, 5, 7, 9]), refPoint: 0 },
			],
		});
		expect(result.type).toBe("success");
		if (result.type === "success") {
			const decoded = decode(result.newColumn);
			expect(decoded[0]).toBeCloseTo(1, 1);
			expect(decoded[4]).toBeCloseTo(9, 1);
		}
	});

	it("evaluates an avgDay group average into a sparse X/Y pair", () => {
		const day1 = Date.UTC(2020, 0, 1, 12, 0, 0); // ms (> 1e11 ⇒ used as-is)
		const day2 = Date.UTC(2020, 0, 2, 12, 0, 0);
		const params = buildParams(
			"avgDay([Value])",
			["Time", "Value"],
			[
				[day1, day1 + 3.6e6, day2, day2 + 3.6e6],
				[10, 20, 100, 200],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(result.newColumn.data.length).toBe(2);
			const decoded = decode(result.newColumn);
			[15, 150].forEach((v, i) => expect(decoded[i]).toBeCloseTo(v, 2));
			expect(result.sparseXColumn).toBeDefined();
			expect(result.sparseXColumn?.data.length).toBe(2);
		}
	});

	it("returns an error when the group-average column is missing", () => {
		const result = evaluateFormulaSync({
			datasetId: "d1",
			name: "calc",
			formula: "avgDay([Missing])",
			columns: ["Time", "Value"],
			rowCount: 1,
			columnData: [{ data: Float32Array.from([0]), refPoint: 0 }],
		});
		expect(result.type).toBe("error");
	});

	it("applies center alignment for legacy rolling averages (avgNc)", () => {
		const params = buildParams(
			"avg3c([Temp])",
			["Time", "Temp"],
			[
				[0, 1, 2, 3, 4],
				[0, 10, 20, 30, 40],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			// Unaligned avg3 = [0,5,10,20,30]; center shift of 1 pulls each value
			// one row earlier, clamping the tail.
			const decoded = decode(result.newColumn);
			[5, 10, 20, 30, 30].forEach((v, i) =>
				expect(decoded[i]).toBeCloseTo(v, 2),
			);
		}
	});

	it("applies right alignment for legacy rolling averages (avgNr)", () => {
		const params = buildParams(
			"avg3r([Temp])",
			["Time", "Temp"],
			[
				[0, 1, 2, 3, 4],
				[0, 10, 20, 30, 40],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			// Right shift of 2 over avg3 = [0,5,10,20,30] ⇒ [10,20,30,30,30].
			const decoded = decode(result.newColumn);
			[10, 20, 30, 30, 30].forEach((v, i) =>
				expect(decoded[i]).toBeCloseTo(v, 2),
			);
		}
	});

	it("handles the new-form rolling(...) literal-argument alignment", () => {
		const params = buildParams(
			"rollingC([Temp], 3)",
			["Time", "Temp"],
			[
				[0, 1, 2, 3, 4],
				[0, 10, 20, 30, 40],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			const decoded = decode(result.newColumn);
			expect(decoded).toHaveLength(5);
			decoded.forEach((v) => expect(Number.isFinite(v)).toBe(true));
		}
	});

	it("handles the new-form rollingTime(...) alignment with a time window", () => {
		const params = buildParams(
			"rollingTimeC([Temp], 2)",
			["Time", "Temp"],
			[
				[1000, 1001, 1002, 1003, 1004],
				[0, 10, 20, 30, 40],
			],
		);
		const result = evaluateFormulaSync(params);
		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(decode(result.newColumn)).toHaveLength(5);
		}
	});
});

describe("compileFormula generic error fallback", () => {
	it("returns a generic error message for non-FormulaError exceptions (TypeError)", () => {
		// Passing an invalid argument to trigger a native TypeError inside compileFormula
		const result = compileFormula(undefined as unknown as string, ["Col1"]);
		expect(result.error).toBeDefined();
		expect(result.error).toContain("Cannot read properties of undefined");
		expect(result.evaluate([])).toBeNaN();
	});

	it("returns a stringified error message for non-Error exceptions", () => {
		// Passing an object with a getter that throws a string primitive
		// when accessed during iteration over availableColumns.
		const evilColumns = {
			get length() {
				throw "Mock string error";
			},
		} as unknown as string[];

		const result = compileFormula("[Col1]", evilColumns);
		expect(result.error).toBe("Mock string error");
		expect(result.evaluate([])).toBeNaN();
	});
});
