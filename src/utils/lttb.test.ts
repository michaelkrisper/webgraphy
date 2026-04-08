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
    it('returns the first and last points when threshold is 1', () => {
      const result = lttb(sampleData, 1);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(sampleData[0]);
      expect(result[1]).toEqual(sampleData[sampleData.length - 1]);
    });

    it('returns the first and last points when threshold is negative', () => {
      const result = lttb(sampleData, -5);
      expect(result.length).toBe(2);
      expect(result[0]).toEqual(sampleData[0]);
      expect(result[1]).toEqual(sampleData[sampleData.length - 1]);
    });

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
    it('downsamples correctly on a larger dataset', () => {
      const largeData = Array.from({ length: 100 }, (_, i) => ({ x: i, y: Math.sin(i) }));
      const result = lttb(largeData, 10);
      expect(result.length).toBe(10);
      expect(result[0]).toEqual(largeData[0]);
      expect(result[result.length - 1]).toEqual(largeData[largeData.length - 1]);
    });

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

    it('selects data points that maximize the effective area (preserves peaks)', () => {
      // Data with a sharp peak in the first bucket
      const peakData = [
        { x: 0, y: 0 },
        { x: 1, y: 1 },
        { x: 2, y: 10 }, // Sharp peak
        { x: 3, y: 0 },
        { x: 4, y: 0 },
        { x: 5, y: 0 },
      ];

      // Threshold 4 means 2 middle buckets of size 2.
      // Bucket 1: indices 1, 2
      // Bucket 2: indices 3, 4
      const result = lttb(peakData, 4);

      expect(result).toEqual([
        { x: 0, y: 0 },   // First point
        { x: 2, y: 10 },  // Peak from Bucket 1
        { x: 3, y: 0 },   // Selected from Bucket 2
        { x: 5, y: 0 },   // Last point
      ]);
    });

    it('selects data points that maximize the effective area (preserves valleys)', () => {
      // Data with a sharp valley in the first bucket
      const valleyData = [
        { x: 0, y: 10 },
        { x: 1, y: 9 },
        { x: 2, y: 0 },  // Sharp valley
        { x: 3, y: 10 },
        { x: 4, y: 10 },
        { x: 5, y: 10 },
      ];

      const result = lttb(valleyData, 4);

      expect(result).toEqual([
        { x: 0, y: 10 },  // First point
        { x: 2, y: 0 },   // Valley from Bucket 1
        { x: 3, y: 10 },  // Selected from Bucket 2
        { x: 5, y: 10 },  // Last point
      ]);
    });
  });
});
