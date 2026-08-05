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

		it("should fit exponential decay y = e^(-x)", () => {
			const x = new Float64Array([0, 1, 2, 3]);
			const y = new Float64Array([1, Math.exp(-1), Math.exp(-2), Math.exp(-3)]);
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

		it("smooths more aggressively with a larger explicit bandwidth", () => {
			const x = new Float64Array([1, 2, 3]);
			const y = new Float64Array([0, 10, 0]);
			const resultSmall = kdeSmoothing(x, y, 0.1);
			const resultLarge = kdeSmoothing(x, y, 2.0);
			// Small bandwidth stays close to the original peak...
			expect(resultSmall[1]).toBeCloseTo(10, 0);
			// ...while a large bandwidth pulls the peak down and lifts the edges.
			expect(resultLarge[1]).toBeLessThan(7);
			expect(resultLarge[0]).toBeGreaterThan(0.5);
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

	// Above 256 points kdeSmoothing switches from the exact O(N^2) evaluation
	// to an O(N) grid-binning approximation. That second path produces the
	// numbers users actually see (real datasets are far larger than 256), so
	// it is checked here against the exact definition rather than against
	// itself.
	describe("kdeSmoothing — grid path (N > 256)", () => {
		const GRID_PATH_THRESHOLD = 256;

		/** Textbook Gaussian kernel smoother, used as the reference. */
		const exactKde = (
			x: Float64Array,
			y: Float64Array,
			h: number,
		): Float64Array => {
			const out = new Float64Array(x.length);
			for (let i = 0; i < x.length; i++) {
				let num = 0;
				let den = 0;
				for (let j = 0; j < x.length; j++) {
					const dx = x[i] - x[j];
					const w = Math.exp(-(dx * dx) / (2 * h * h));
					num += w * y[j];
					den += w;
				}
				out[i] = den > 0 ? num / den : y[i];
			}
			return out;
		};

		const evenlySpaced = (n: number, step = 1) =>
			Float64Array.from({ length: n }, (_, i) => i * step);

		it("takes the grid path above the threshold and stays close to the exact result", () => {
			const n = GRID_PATH_THRESHOLD * 2;
			const x = evenlySpaced(n);
			// Deterministic pseudo-noise on top of a smooth signal.
			const y = Float64Array.from({ length: n }, (_, i) => {
				const signal = Math.sin(i / 20) * 10;
				const noise = ((i * 37) % 11) - 5;
				return signal + noise;
			});
			const h = 5;

			const actual = kdeSmoothing(x, y, h);
			const reference = exactKde(x, y, h);

			expect(actual.length).toBe(n);
			// The grid path bins and convolves rather than evaluating every
			// pair, so it is an approximation — but a close one.
			for (let i = 0; i < n; i++) {
				expect(actual[i]).toBeCloseTo(reference[i], 1);
			}
		});

		it("reproduces a constant signal exactly", () => {
			const n = GRID_PATH_THRESHOLD + 100;
			const x = evenlySpaced(n);
			const y = new Float64Array(n).fill(7);

			const result = kdeSmoothing(x, y, 3);

			// A weighted average of identical values must be that value; any
			// normalisation bug in the binning shows up here immediately.
			for (let i = 0; i < n; i++) {
				expect(result[i]).toBeCloseTo(7, 9);
			}
		});

		it("reduces the spread of noise around a flat signal", () => {
			const n = GRID_PATH_THRESHOLD * 4;
			const x = evenlySpaced(n);
			const y = Float64Array.from({ length: n }, (_, i) =>
				i % 2 === 0 ? 10 : -10,
			);

			const result = kdeSmoothing(x, y, 4);

			const spread = (arr: ArrayLike<number>) => {
				let min = Infinity;
				let max = -Infinity;
				for (let i = 0; i < arr.length; i++) {
					if (arr[i] < min) min = arr[i];
					if (arr[i] > max) max = arr[i];
				}
				return max - min;
			};

			expect(spread(result)).toBeLessThan(spread(y));
			// The alternating signal averages to zero away from the edges;
			// binning leaves a residual on the order of 1e-5.
			expect(result[Math.floor(n / 2)]).toBeCloseTo(0, 4);
		});

		it("returns the mean when all x collapse to one point", () => {
			const n = GRID_PATH_THRESHOLD + 1;
			const x = new Float64Array(n).fill(42);
			const y = Float64Array.from({ length: n }, (_, i) => i);

			// range < 1e-12, so there is no grid to bin onto and the whole
			// column degenerates to its average.
			const result = kdeSmoothing(x, y, 1);

			const mean = (n - 1) / 2;
			for (let i = 0; i < n; i++) {
				expect(result[i]).toBeCloseTo(mean, 9);
			}
		});

		it("keeps out-of-range points finite when x is not sorted ascending", () => {
			// Bin indices are derived from x[0] and x[n-1]; unsorted input can
			// therefore land below bin 0 or above the last bin. Those points
			// must be clamped, not produce NaN or read out of bounds.
			const n = GRID_PATH_THRESHOLD + 50;
			const x = evenlySpaced(n);
			x[10] = -500;
			x[20] = 5000;
			const y = Float64Array.from({ length: n }, (_, i) => i % 5);

			const result = kdeSmoothing(x, y, 3);

			expect(result.length).toBe(n);
			for (let i = 0; i < n; i++) {
				expect(Number.isFinite(result[i])).toBe(true);
			}
		});

		it("derives a bandwidth automatically on the grid path", () => {
			const n = GRID_PATH_THRESHOLD * 2;
			const x = evenlySpaced(n, 0.5);
			const y = Float64Array.from({ length: n }, (_, i) => Math.cos(i / 15) * 4);

			const auto = kdeSmoothing(x, y);
			const narrow = kdeSmoothing(x, y, 0.5);

			expect(auto.length).toBe(n);
			for (let i = 0; i < n; i++) {
				expect(Number.isFinite(auto[i])).toBe(true);
			}

			const spread = (arr: Float64Array) => Math.max(...arr) - Math.min(...arr);
			// Silverman's rule lands around h ~ 22 for this spacing, i.e. about
			// half the cosine period, so the automatic bandwidth flattens the
			// curve far more than a deliberately narrow one.
			expect(spread(auto)).toBeLessThan(spread(narrow));
			expect(spread(narrow)).toBeGreaterThan(4);
		});
	});
});
