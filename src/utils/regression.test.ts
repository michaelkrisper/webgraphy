import { describe, it, expect } from 'vitest';
import {
  linearRegression,
  polynomialRegression,
  exponentialRegression,
  logisticRegression,
  kdeSmoothing
} from './regression';

// Helper to compare Float64Arrays
function expectArraysClose(actual: Float64Array, expected: Float64Array | number[], precision: number = 3) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    expect(actual[i]).toBeCloseTo(expected[i], precision);
  }
}

describe('Regression and Curve Fitting Utilities', () => {

  describe('linearRegression', () => {
    it('fits a perfect positive line', () => {
      const x = new Float64Array([1, 2, 3, 4, 5]);
      const y = new Float64Array([3, 5, 7, 9, 11]); // y = 2x + 1
      const result = linearRegression(x, y);
      expectArraysClose(result, y);
    });

    it('fits a perfect negative line', () => {
      const x = new Float64Array([1, 2, 3]);
      const y = new Float64Array([8, 5, 2]); // y = -3x + 11
      const result = linearRegression(x, y);
      expectArraysClose(result, y);
    });

    it('fits a flat horizontal line', () => {
      const x = new Float64Array([1, 2, 3, 4]);
      const y = new Float64Array([5, 5, 5, 5]); // y = 5
      const result = linearRegression(x, y);
      expectArraysClose(result, y);
    });

    it('handles zero denominator (all x identical)', () => {
      const x = new Float64Array([2, 2, 2]);
      const y = new Float64Array([1, 2, 3]);
      const result = linearRegression(x, y);
      // Returns array of zeros when denom is 0
      expectArraysClose(result, new Float64Array([0, 0, 0]));
    });
  });

  describe('polynomialRegression', () => {
    it('fits a linear curve when degree is 1', () => {
      const x = new Float64Array([1, 2, 3]);
      const y = new Float64Array([2, 4, 6]); // y = 2x
      const result = polynomialRegression(x, y, 1);
      expectArraysClose(result, y);
    });

    it('fits a perfect quadratic curve (degree 2)', () => {
      const x = new Float64Array([0, 1, 2, 3, 4]);
      const y = new Float64Array([0, 1, 4, 9, 16]); // y = x^2
      const result = polynomialRegression(x, y, 2);
      expectArraysClose(result, y);
    });

    it('fits a quadratic curve with an offset', () => {
      const x = new Float64Array([-1, 0, 1, 2]);
      const y = new Float64Array([2, 1, 2, 5]); // y = x^2 + 1
      const result = polynomialRegression(x, y, 2);
      expectArraysClose(result, y);
    });
  });

  describe('exponentialRegression', () => {
    it('fits simple exponential growth', () => {
      const x = new Float64Array([0, 1, 2, 3]);
      // y = e^x
      const y = new Float64Array([1, Math.exp(1), Math.exp(2), Math.exp(3)]);
      const result = exponentialRegression(x, y);
      expectArraysClose(result, y);
    });

    it('fits exponential decay', () => {
      const x = new Float64Array([0, 1, 2, 3]);
      // y = e^(-x)
      const y = new Float64Array([1, Math.exp(-1), Math.exp(-2), Math.exp(-3)]);
      const result = exponentialRegression(x, y);
      expectArraysClose(result, y);
    });

    it('handles non-positive values gracefully by shifting', () => {
      const x = new Float64Array([0, 1, 2]);
      // e^x - 2 -> [-1, 0.718, 5.389]
      const y = new Float64Array([Math.exp(0) - 2, Math.exp(1) - 2, Math.exp(2) - 2]);
      const result = exponentialRegression(x, y);

      // We expect it to try its best to shift, fit linear log, and shift back.
      // It won't perfectly match original y due to shifting altering log-linear nature slightly,
      // but it should return valid numbers.
      expect(result.length).toBe(3);
      expect(Number.isNaN(result[0])).toBe(false);
      expect(Number.isNaN(result[1])).toBe(false);
      expect(Number.isNaN(result[2])).toBe(false);
    });
  });

  describe('logisticRegression', () => {
    it('returns zeroes for very small y range', () => {
      const x = new Float64Array([1, 2, 3]);
      const y = new Float64Array([1e-12, 1e-12, 1e-12]);
      const result = logisticRegression(x, y);
      expectArraysClose(result, new Float64Array([0, 0, 0]));
    });

    it('fits logistic sigmoid curve approximation', () => {
      // Create a nice logistic shape
      // L=10, k=1, x0=0 -> y = 10 / (1 + e^(-x))
      const n = 11;
      const x = new Float64Array(n);
      const y = new Float64Array(n);

      for(let i=0; i<n; i++) {
        x[i] = -5 + i; // -5 to 5
        y[i] = 10 / (1 + Math.exp(-x[i]));
      }

      const result = logisticRegression(x, y);

      // Since it's an estimation with simple gradient descent,
      // we check for general shape/fit rather than perfect match.
      expect(result.length).toBe(n);

      // Middle should be around 5
      const mid = Math.floor(n/2);
      expect(result[mid]).toBeGreaterThan(3);
      expect(result[mid]).toBeLessThan(7);

      // Ends should be near asymptotes 0 and 10
      expect(result[0]).toBeLessThan(2);
      expect(result[n-1]).toBeGreaterThan(8);

      // Should be monotonically increasing
      for(let i=1; i<n; i++) {
         expect(result[i]).toBeGreaterThan(result[i-1]);
      }
    });
  });

  describe('kdeSmoothing', () => {
    it('smoothes a noisy line', () => {
      const x = new Float64Array([1, 2, 3, 4, 5]);
      const y = new Float64Array([1, 4, 2, 5, 3]);
      const result = kdeSmoothing(x, y);

      expect(result.length).toBe(5);
      // Smoothing should bring extreme values closer to the center
      expect(result[1]).toBeLessThan(4); // peak 4 should be smoothed down
      expect(result[2]).toBeGreaterThan(2); // valley 2 should be smoothed up
    });

    it('works with explicit bandwidth', () => {
      const x = new Float64Array([1, 2, 3]);
      const y = new Float64Array([0, 10, 0]);

      const resultSmall = kdeSmoothing(x, y, 0.1);
      const resultLarge = kdeSmoothing(x, y, 2.0);

      // Small bandwidth => closer to original y
      expect(resultSmall[1]).toBeCloseTo(10, 0);

      // Large bandwidth => heavily smoothed
      expect(resultLarge[1]).toBeLessThan(7);
      expect(resultLarge[0]).toBeGreaterThan(0.5);
    });
  });

});
