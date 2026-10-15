import { describe, expect, it } from "vitest";
import {
	isTruthy,
	MATH_UNARY,
	mathModulo,
	median,
	sampleVariance,
} from "../math";

describe("MATH_UNARY", () => {
	it("maps log to base 10 and ln to the natural log", () => {
		expect(MATH_UNARY.log(1000)).toBeCloseTo(3);
		expect(MATH_UNARY.ln(Math.E)).toBeCloseTo(1);
		expect(MATH_UNARY.log2(8)).toBe(3);
	});

	it("isnan returns 1/0 instead of a boolean", () => {
		expect(MATH_UNARY.isnan(NaN)).toBe(1);
		expect(MATH_UNARY.isnan(0)).toBe(0);
		expect(MATH_UNARY.isnan(Infinity)).toBe(0);
	});

	it("rounding helpers follow Math semantics", () => {
		expect(MATH_UNARY.round(-1.5)).toBe(-1);
		expect(MATH_UNARY.floor(-1.5)).toBe(-2);
		expect(MATH_UNARY.ceil(-1.5)).toBe(-1);
		expect(MATH_UNARY.trunc(-1.5)).toBe(-1);
		expect(MATH_UNARY.sign(-3)).toBe(-1);
	});
});

describe("mathModulo", () => {
	it("returns a result with the sign of the divisor (floored modulo)", () => {
		expect(mathModulo(7, 3)).toBe(1);
		expect(mathModulo(-7, 3)).toBe(2);
		expect(mathModulo(7, -3)).toBe(-2);
		expect(mathModulo(5.5, 2)).toBeCloseTo(1.5);
	});

	it("is NaN for a zero divisor", () => {
		expect(mathModulo(1, 0)).toBeNaN();
	});
});

describe("isTruthy", () => {
	it("treats 0 and NaN as false, everything else as true", () => {
		expect(isTruthy(0)).toBe(false);
		expect(isTruthy(-0)).toBe(false);
		expect(isTruthy(NaN)).toBe(false);
		expect(isTruthy(1)).toBe(true);
		expect(isTruthy(-0.001)).toBe(true);
		expect(isTruthy(Infinity)).toBe(true);
	});
});

describe("sampleVariance", () => {
	it("uses the n-1 denominator", () => {
		expect(sampleVariance([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(32 / 7);
	});

	it("is 0 for fewer than two values", () => {
		expect(sampleVariance([])).toBe(0);
		expect(sampleVariance([42])).toBe(0);
	});
});

describe("median", () => {
	it("picks the middle of an odd-length list regardless of order", () => {
		expect(median([9, 1, 5])).toBe(5);
	});

	it("averages the two middle values of an even-length list", () => {
		expect(median([4, 1, 3, 2])).toBe(2.5);
	});

	it("sorts numerically, not lexicographically", () => {
		expect(median([10, 9, 100])).toBe(10);
	});

	it("does not mutate its input", () => {
		const v = [3, 1, 2];
		median(v);
		expect(v).toEqual([3, 1, 2]);
	});

	it("is NaN for an empty list", () => {
		expect(median([])).toBeNaN();
	});
});
