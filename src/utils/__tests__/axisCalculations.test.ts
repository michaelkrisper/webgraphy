// src/utils/__tests__/axisCalculations.test.ts
import { describe, it, expect } from 'vitest';
import { calcNumericStep, calcNumericTicks, calcNumericPrecision, calcYAxisTicks } from '../axisCalculations';

describe('calcNumericStep', () => {
  it('rounds to nice steps', () => {
    expect(calcNumericStep(10, 5)).toBe(2);
    expect(calcNumericStep(100, 5)).toBe(20);
    expect(calcNumericStep(0.3, 3)).toBe(0.1);
  });
  it('returns 1 for zero range', () => {
    expect(calcNumericStep(0, 5)).toBe(1);
  });
});

describe('calcNumericPrecision', () => {
  it('returns 0 for steps >= 1', () => {
    expect(calcNumericPrecision(2)).toBe(0);
    expect(calcNumericPrecision(10)).toBe(0);
  });
  it('returns positive precision for fractional steps', () => {
    expect(calcNumericPrecision(0.1)).toBe(1);
    expect(calcNumericPrecision(0.01)).toBe(2);
  });
});

describe('calcNumericTicks', () => {
  it('generates ticks covering the range', () => {
    const ticks = calcNumericTicks(0, 10, 2);
    expect(ticks[0]).toBeLessThanOrEqual(0);
    expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
  });
  it('caps at 200 ticks', () => {
    expect(calcNumericTicks(0, 1e6, 1).length).toBeLessThanOrEqual(201);
  });
});

describe('calcYAxisTicks', () => {
  it('returns ticks, precision, and actualStep', () => {
    const result = calcYAxisTicks(0, 100, 400);
    expect(result.ticks.length).toBeGreaterThan(0);
    expect(result.precision).toBeGreaterThanOrEqual(0);
    expect(result.actualStep).toBeGreaterThan(0);
  });
  it('handles zero range', () => {
    const result = calcYAxisTicks(5, 5, 400);
    expect(result.ticks).toEqual([]);
    expect(result.actualStep).toBe(1);
  });
});
