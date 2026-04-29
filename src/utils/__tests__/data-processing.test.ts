import { describe, it, expect } from 'vitest';
import { processRawColumn, CHUNK_SIZE } from '../data-processing';

describe('processRawColumn', () => {
  it('should process basic array correctly', () => {
    const data = [10, 20, 5, 15];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: 5, max: 20 });

    // Relative to refPoint (10)
    expect(Array.from(result.data)).toEqual([0, 10, -5, 5]);

    expect(result.chunkMin.length).toBe(1);
    expect(result.chunkMax.length).toBe(1);
    expect(result.chunkMin[0]).toBe(-5);
    expect(result.chunkMax[0]).toBe(10);
  });

  it('should handle NaNs and nulls at the beginning', () => {
    // We cast null to any here just to test runtime resilience if malicious/bad data gets passed
    const data = [NaN, null as unknown as number, 10, 20];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: 10, max: 20 });

    expect(Number.isNaN(result.data[0])).toBe(true);
    expect(Number.isNaN(result.data[1])).toBe(true);
    expect(result.data[2]).toBe(0);
    expect(result.data[3]).toBe(10);

    expect(result.chunkMin[0]).toBe(0);
    expect(result.chunkMax[0]).toBe(10);
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

  it('should calculate chunks correctly for large arrays', () => {
    const rowCount = CHUNK_SIZE + 100; // 612
    const data = new Float64Array(rowCount);

    for (let i = 0; i < rowCount; i++) {
      if (i < CHUNK_SIZE) {
        data[i] = i + 10; // 10 to 521
      } else {
        data[i] = i - 1000; // -488 to -389
      }
    }

    const result = processRawColumn(data);

    expect(result.refPoint).toBe(10);
    expect(result.bounds).toEqual({ min: -488, max: 521 });

    expect(result.chunkMin.length).toBe(2);
    expect(result.chunkMax.length).toBe(2);

    // Chunk 0: indices 0 to 511
    // min relative val: 0 (at index 0, 10 - 10)
    // max relative val: 511 (at index 511, 521 - 10)
    expect(result.chunkMin[0]).toBe(0);
    expect(result.chunkMax[0]).toBe(511);

    // Chunk 1: indices 512 to 611
    // data[512] = 512 - 1000 = -488 -> rel: -498
    // data[611] = 611 - 1000 = -389 -> rel: -399
    expect(result.chunkMin[1]).toBe(-498);
    expect(result.chunkMax[1]).toBe(-399);
  });

  it('should handle an array of all NaNs/nulls', () => {
    const data = [NaN, null as unknown as number, NaN];
    const result = processRawColumn(data);

    expect(result.refPoint).toBe(0);
    expect(result.bounds).toEqual({ min: Infinity, max: -Infinity });

    expect(Number.isNaN(result.data[0])).toBe(true);
    expect(Number.isNaN(result.data[1])).toBe(true);
    expect(Number.isNaN(result.data[2])).toBe(true);

    expect(result.chunkMin[0]).toBe(Infinity);
    expect(result.chunkMax[0]).toBe(-Infinity);
  });
});
