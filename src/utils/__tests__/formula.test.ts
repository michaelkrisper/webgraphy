import { describe, it, expect } from 'vitest';
import { compileFormula } from '../formula';

describe('compileFormula', () => {
  it('should handle averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext } = compileFormula('avg3([Temp])', cols);
    const ctx = createContext!();

    // usedColumnIndices should be [1]
    // Test count-based average
    expect(evaluate([10], ctx)).toBe(10); // 10/1
    expect(evaluate([20], ctx)).toBe(15); // (10+20)/2
    expect(evaluate([30], ctx)).toBe(20); // (10+20+30)/3
    expect(evaluate([40], ctx)).toBe(30); // (20+30+40)/3
  });

  it('should handle time-based averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext, usedColumnIndices } = compileFormula('avg2s([Temp])', cols);
    const ctx = createContext!();

    // usedColumnIndices: [1, 0] ([Temp], Timestamp)
    expect(usedColumnIndices).toEqual([1, 0]);

    // Test time-based average (2 seconds window)
    expect(evaluate([10, 1000], ctx)).toBe(10);
    expect(evaluate([20, 1001], ctx)).toBe(15);
    expect(evaluate([30, 1002], ctx)).toBe(25);
    expect(evaluate([40, 1003], ctx)).toBe(35);
  });

  it('should handle filter function', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext } = compileFormula('filter([Temp])', cols);
    const ctx = createContext!();

    const v1 = evaluate([10], ctx);
    expect(v1).toBe(10);
    const v2 = evaluate([20], ctx);
    expect(v2).toBeGreaterThan(10);
    expect(v2).toBeLessThan(20);
  });

  const columns = ['Timestamp', 'A: Temp', 'A: Hum', 'A: Press'];

  it('should handle basic arithmetic', () => {
    const { evaluate, usedColumnIndices } = compileFormula('[Temp] + [Hum]', columns);
    // [Temp] is index 1, [Hum] is index 2.
    expect(usedColumnIndices).toEqual([1, 2]);
    expect(evaluate([10, 20])).toBe(30);
  });

  it('should handle trig and math functions', () => {
    const { evaluate: evalSin } = compileFormula('sin(pi/2)', columns);
    expect(evalSin([])).toBeCloseTo(1);

    const { evaluate: evalSqrt } = compileFormula('sqrt(16)', columns);
    expect(evalSqrt([])).toBe(4);

    const { evaluate: evalAbs } = compileFormula('abs(-5)', columns);
    expect(evalAbs([])).toBe(5);
  });

  it('should handle multi-argument functions', () => {
    const { evaluate: evalMin } = compileFormula('min(10, 5, 20)', columns);
    expect(evalMin([])).toBe(5);

    const { evaluate: evalMax } = compileFormula('max(10, 5, 20)', columns);
    expect(evalMax([])).toBe(20);

    const { evaluate: evalAvg } = compileFormula('avg(10, 20, 30)', columns);
    expect(evalAvg([])).toBe(20);
  });

  it('should handle avg() over all numeric columns', () => {
    // Columns: Timestamp (0), Temp (1), Hum (2), Press (3)
    const { evaluate, usedColumnIndices } = compileFormula('avg()', columns);
    // Should include 1, 2, 3.
    expect(usedColumnIndices).toEqual([1, 2, 3]);

    expect(evaluate([10, 20, 30])).toBe(20);
  });

  it('should handle avgDay resetting', () => {
    const { evaluate, createContext, usedColumnIndices } = compileFormula('avgday([Temp])', columns);
    const ctx = createContext!();

    // usedColumnIndices: [1, 0]
    expect(usedColumnIndices).toEqual([1, 0]);

    const t1 = new Date('2023-01-01T10:00:00Z').getTime() / 1000;
    const t2 = new Date('2023-01-01T11:00:00Z').getTime() / 1000;
    const t3 = new Date('2023-01-02T10:00:00Z').getTime() / 1000;

    expect(evaluate([10, t1], ctx)).toBe(10);
    expect(evaluate([20, t2], ctx)).toBe(15);
    expect(evaluate([40, t3], ctx)).toBe(40); // Reset on new day
  });

  it('should handle constants pi and e', () => {
    const { evaluate } = compileFormula('pi * e', columns);
    expect(evaluate([])).toBeCloseTo(Math.PI * Math.E);
  });

  it('should handle log (base 10)', () => {
    const { evaluate } = compileFormula('log(100)', columns);
    expect(evaluate([])).toBe(2);
  });

  it('should handle power operator ^', () => {
    const { evaluate } = compileFormula('2^3', columns);
    expect(evaluate([])).toBe(8);
  });

  it('should handle nested expressions and brackets', () => {
    const { evaluate, usedColumnIndices } = compileFormula('([Temp] + 10) * 2', columns);
    expect(usedColumnIndices).toEqual([1]);
    expect(evaluate([5])).toBe(30);
  });

  it('should handle unary negation and negative numbers', () => {
    const { evaluate, usedColumnIndices } = compileFormula('-[Temp] * -1', columns);
    expect(usedColumnIndices).toEqual([1]);
    expect(evaluate([10])).toBe(10);

    const { evaluate: eval2 } = compileFormula('5 + -2', columns);
    expect(eval2([])).toBe(3);

    const { evaluate: eval3 } = compileFormula('-log(100)', columns);
    expect(eval3([])).toBe(-2);
  });

  it('should return error for invalid columns', () => {
    const { error } = compileFormula('[NonExistent]', columns);
    expect(error).toContain('Column not found');
  });

  it('should return error for invalid characters', () => {
    const { error } = compileFormula('window.alert(1)', columns);
    expect(error).toBeDefined();
  });
});
