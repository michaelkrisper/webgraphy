import { describe, it, expect } from 'vitest';
import { lttb } from './lttb';

describe('LTTB (Largest-Triangle-Three-Buckets)', () => {
  const sampleData = [
    { x: 1, y: 10 },
    { x: 2, y: 15 },
    { x: 3, y: 5 },
    { x: 4, y: 20 },
    { x: 5, y: 25 },
    { x: 6, y: 15 },
    { x: 7, y: 30 },
  ];

  describe('edge cases', () => {
    it('returns the original data when threshold >= data.length', () => {
      const result = lttb(sampleData, 10);
      expect(result).toBe(sampleData);
      expect(result).toEqual(sampleData);
    });

    it('returns the original data when threshold is exactly data.length', () => {
      const result = lttb(sampleData, 7);
      expect(result).toBe(sampleData);
      expect(result).toEqual(sampleData);
    });

    it('returns the original data when threshold is 0', () => {
      const result = lttb(sampleData, 0);
      expect(result).toBe(sampleData);
      expect(result).toEqual(sampleData);
    });

    it('returns the original data for empty array regardless of threshold', () => {
      const emptyData: { x: number, y: number }[] = [];
      const result = lttb(emptyData, 10);
      expect(result).toBe(emptyData);
      expect(result).toEqual([]);
    });
  });

  describe('downsampling', () => {
    it('downsamples data to the specified threshold', () => {
      const result = lttb(sampleData, 4);
      expect(result.length).toBe(4);

      // LTTB always keeps the first and last points
      expect(result[0]).toEqual(sampleData[0]);
      expect(result[result.length - 1]).toEqual(sampleData[sampleData.length - 1]);
    });

    it('downsamples correctly when threshold is 2', () => {
      // It should keep just the first and last data points
      const result = lttb(sampleData, 2);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(sampleData[0]);
      expect(result[1]).toEqual(sampleData[sampleData.length - 1]);
    });

    it('downsamples correctly when threshold is 3', () => {
      // First, last, and one point in between
      const result = lttb(sampleData, 3);
      expect(result.length).toBe(3);
      expect(result[0]).toEqual(sampleData[0]);
      expect(result[result.length - 1]).toEqual(sampleData[sampleData.length - 1]);
    });
  });
});
