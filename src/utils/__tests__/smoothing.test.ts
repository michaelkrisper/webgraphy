import { describe, it, expect } from 'vitest';
import { smoothArray } from '../data-processing';

describe('smoothArray', () => {
  it('should smooth a simple array', () => {
    const data = new Float32Array([10, 20, 10, 20, 10]);
    // window 5:
    // i=0: [10, 20, 10] -> 40/3 = 13.33
    // i=1: [10, 20, 10, 20] -> 60/4 = 15
    // i=2: [10, 20, 10, 20, 10] -> 70/5 = 14
    // i=3: [20, 10, 20, 10] -> 60/4 = 15
    // i=4: [10, 20, 10] -> 40/3 = 13.33
    const smoothed = smoothArray(data, 5);
    expect(smoothed[0]).toBeCloseTo(13.33, 1);
    expect(smoothed[2]).toBe(14);
    expect(smoothed[4]).toBeCloseTo(13.33, 1);
  });

  it('should handle NaN values', () => {
    const data = new Float32Array([10, NaN, 10, 20, 10]);
    // i=1: [10, NaN, 10, 20] -> 40/3 = 13.33
    const smoothed = smoothArray(data, 5);
    expect(Number.isNaN(smoothed[1])).toBe(false);
    expect(smoothed[1]).toBeCloseTo(13.33, 1);
  });

  it('should preserve single values if window is empty of non-NaNs', () => {
    const data = new Float32Array([NaN, NaN, NaN]);
    const smoothed = smoothArray(data, 3);
    expect(Number.isNaN(smoothed[1])).toBe(true);
  });
});
