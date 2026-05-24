import { describe, expect, it } from "vitest";
import {
	exponentialRegression,
	kdeSmoothing,
	linearRegression,
	logisticRegression,
	polynomialRegression,
} from "../regression";

describe("Regression Utilities", () => {
	describe("linearRegression", () => {
		it("should fit a simple linear dataset y = 2x + 1", () => {
			const x = new Float64Array([0, 1, 2, 3, 4]);
			const y = new Float64Array([1, 3, 5, 7, 9]);
			const result = linearRegression(x, y);
			expect(result[0]).toBeCloseTo(1);
			expect(result[2]).toBeCloseTo(5);
			expect(result[4]).toBeCloseTo(9);
		});

		it("should fit a horizontal line", () => {
			const x = new Float64Array([0, 1, 2, 3]);
			const y = new Float64Array([5, 5, 5, 5]);
			const result = linearRegression(x, y);
			expect(result.every((val) => Math.abs(val - 5) < 1e-10)).toBe(true);
		});

		it("should handle zero denominator (identical X values)", () => {
			const x = new Float64Array([1, 1, 1]);
			const y = new Float64Array([1, 2, 3]);
			const result = linearRegression(x, y);
			expect(result.every((val) => val === 0)).toBe(true);
		});
	});

	describe("polynomialRegression", () => {
		it("should fit degree 0 (constant fit)", () => {
			const x = new Float64Array([0, 1, 2]);
			const y = new Float64Array([1, 2, 3]); // Mean is 2
			const result = polynomialRegression(x, y, 0);
			expect(result[0]).toBeCloseTo(2);
			expect(result[1]).toBeCloseTo(2);
			expect(result[2]).toBeCloseTo(2);
		});

		it("should match linear regression for degree 1", () => {
			const x = new Float64Array([0, 1, 2, 3]);
			const y = new Float64Array([1, 3, 5, 7]);
			const result = polynomialRegression(x, y, 1);
			expect(result[0]).toBeCloseTo(1);
			expect(result[3]).toBeCloseTo(7);
		});

		it("should fit a quadratic curve (y = x^2)", () => {
			const x = new Float64Array([0, 1, 2, 3]);
			const y = new Float64Array([0, 1, 4, 9]);
			const result = polynomialRegression(x, y, 2);
			expect(result[0]).toBeCloseTo(0);
			expect(result[1]).toBeCloseTo(1);
			expect(result[2]).toBeCloseTo(4);
			expect(result[3]).toBeCloseTo(9);
		});

		it("should fit a cubic curve (y = x^3)", () => {
			const x = new Float64Array([1, 2, 3, 4]);
			const y = new Float64Array([1, 8, 27, 64]);
			const result = polynomialRegression(x, y, 3);
			expect(result[0]).toBeCloseTo(1);
			expect(result[1]).toBeCloseTo(8);
			expect(result[2]).toBeCloseTo(27);
			expect(result[3]).toBeCloseTo(64);
		});

		it("should handle singular matrix scenarios gracefully", () => {
			// All X values identical -> singular matrix
			const x = new Float64Array([2, 2, 2]);
			const y = new Float64Array([1, 2, 3]);
			const result = polynomialRegression(x, y, 2);
			expect(result.length).toBe(3);
			// Since it's singular, it will fall back to 0s for undefined terms
		});

		it("should cap degree at n-1", () => {
			const x = new Float64Array([0, 1]);
			const y = new Float64Array([1, 2]);
			const result = polynomialRegression(x, y, 5);
			expect(result[0]).toBeCloseTo(1);
			expect(result[1]).toBeCloseTo(2);
		});

		it("should cap degree at 10", () => {
			const x = new Float64Array(20).map((_, i) => i);
			const y = new Float64Array(20).map((_, i) => i * i);
			const result = polynomialRegression(x, y, 15);
			expect(result.length).toBe(20);
		});
	});

	describe("exponentialRegression", () => {
		it("should fit exponential growth y = 2 * e^(0.5x)", () => {
			const x = new Float64Array([0, 1, 2, 3]);
			const y = new Float64Array(x.length);
			for (let i = 0; i < x.length; i++) y[i] = 2 * Math.exp(0.5 * x[i]);

			const result = exponentialRegression(x, y);
			expect(result[0]).toBeCloseTo(y[0], 2);
			expect(result[3]).toBeCloseTo(y[3], 2);
		});

		it("should handle non-positive y values by shifting", () => {
			const x = new Float64Array([0, 1, 2]);
			const y = new Float64Array([-1, 0, 1]);
			const result = exponentialRegression(x, y);
			expect(result.length).toBe(3);
			expect(result.every((v) => !Number.isNaN(v))).toBe(true);
		});
	});

	describe("logisticRegression", () => {
		it("should fit a logistic S-curve", () => {
			const x = new Float64Array([0, 2, 4, 5, 6, 8, 10]);
			const y = new Float64Array(x.length);
			for (let i = 0; i < x.length; i++) {
				y[i] = 10 / (1 + Math.exp(-(x[i] - 5)));
			}

			const result = logisticRegression(x, y);
			expect(result[0]).toBeLessThan(result[3]);
			expect(result[3]).toBeCloseTo(5, 0);
			expect(result[6]).toBeGreaterThan(result[3]);
		});

		it("should handle zero range (flat line) gracefully", () => {
			const x = new Float64Array([0, 1, 2]);
			const y = new Float64Array([0, 0, 0]); // L will be 0, yRange = 0
			const result = logisticRegression(x, y);
			expect(result.every((v) => v === 0)).toBe(true);
		});

		it("should handle identical X values around midpoint gracefully", () => {
			const x = new Float64Array([5, 5, 5, 5, 5]);
			const y = new Float64Array([1, 2, 5, 8, 9]); // midpoint around idx 2
			const result = logisticRegression(x, y);
			expect(result.length).toBe(5);
		});
	});

	describe("kdeSmoothing", () => {
		it("should smooth noisy data", () => {
			const x = new Float64Array([0, 1, 2, 3, 4, 5]);
			const y = new Float64Array([0, 10, 0, 10, 0, 10]);
			const result = kdeSmoothing(x, y, 1);

			expect(result[1]).toBeLessThan(10);
			expect(result[2]).toBeGreaterThan(0);
		});

		it("should work with auto-bandwidth", () => {
			const x = new Float64Array([0, 1, 2, 3, 4, 5]);
			const y = new Float64Array([1, 1.1, 0.9, 1, 1.1, 0.9]);
			const result = kdeSmoothing(x, y);
			expect(result.length).toBe(6);
			expect(result[0]).toBeCloseTo(1, 0);
		});

		it("should fallback when stdX is 0 (all x identical)", () => {
			const x = new Float64Array([2, 2, 2]);
			const y = new Float64Array([1, 2, 3]);
			const result = kdeSmoothing(x, y);
			expect(result.length).toBe(3);
			// When stdX is 0, weights become NaN, so it falls back to original y values.
			expect(result[0]).toBe(1);
		});
	});
});
