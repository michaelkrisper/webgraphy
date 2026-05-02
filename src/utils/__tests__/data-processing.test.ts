import { describe, it, expect } from 'vitest';
import { processRawColumn } from '../data-processing';

describe('processRawColumn', () => {
  it('should process basic array correctly', () => {
    const data = [10, 20, 5, 15];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: 5, max: 20 });

    // Relative to refPoint (10)
    expect(Array.from(result.data)).toEqual([0, 10, -5, 5]);
  });

  it('should handle NaNs and nulls at the beginning', () => {
    // We cast null to any here just to test runtime resilience if malicious/bad data gets passed
    // @ts-expect-error - Expected to test bad data resilience
    const data: number[] = [NaN, null, 10, 20];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: 10, max: 20 });

    expect(Number.isNaN(result.data[0])).toBe(true);
    expect(Number.isNaN(result.data[1])).toBe(true);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(10);
  });

  it('should handle NaNs in the middle', () => {
    const data = [10, NaN, 20];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: 10, max: 20 });

    expect(result.data[0]).toBe(0);
    expect(Number.isNaN(result.data[1])).toBe(true);
    expect(result.data[2]).toBe(10);
  });

  it('should calculate bounds correctly for large arrays', () => {
    const rowCount = 1000;
    const data = new Float64Array(rowCount);

    for (let i = 0; i < rowCount; i++) {
      if (i < 500) {
        data[i] = i + 10; // 10 to 509
      } else {
        data[i] = i - 1000; // -500 to -1
      }
    }

    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: -500, max: 509 });
  });

  it('should handle an array of all NaNs/nulls', () => {
    // @ts-expect-error - Expected to test bad data resilience
    const data: number[] = [NaN, null, NaN];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(0);
    expect(result.bounds).toEqual({ min: Infinity, max: -Infinity });

    expect(Number.isNaN(result.data[0])).toBe(true);
    expect(Number.isNaN(result.data[1])).toBe(true);
    expect(Number.isNaN(result.data[2])).toBe(true);
  });
});
