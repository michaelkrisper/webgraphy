import { describe, it, expect } from 'vitest';
import { compileFormula } from '../formula';

describe('compileFormula', () => {
  it('should handle averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext } = compileFormula('avg3([Temp])', cols);
    const ctx = createContext!();

    // Test count-based average
    expect(evaluate([10], ctx)).toBe(10); // 10/1
    expect(evaluate([20], ctx)).toBe(15); // (10+20)/2
    expect(evaluate([30], ctx)).toBe(20); // (10+20+30)/3
    expect(evaluate([40], ctx)).toBe(30); // (20+30+40)/3
  });

  it('should handle time-based averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext } = compileFormula('avg2s([Temp])', cols);
    const ctx = createContext!();

    // Test time-based average (2 seconds window)
    expect(evaluate([10, 1000], ctx)).toBe(10);
    expect(evaluate([20, 1001], ctx)).toBe(15);
    expect(evaluate([30, 1002], ctx)).toBe(25); // (10+20+30)/3
    expect(evaluate([40, 1003], ctx)).toBe(35); // 10 is dropped because it's <= 1003-2=1001? Wait:
    // cutoff is t - 2. 1003 - 2 = 1001. 10 is at 1000 <= 1001 (dropped). 20 is at 1001 <= 1001 (dropped).
    // So only 30 and 40 remain? The logic is `q[0].t <= cutoff`.
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

  const columns = ['A: Temp', 'A: Hum', 'A: Press'];

  it('should handle basic arithmetic', () => {
    const { evaluate, usedColumnIndices } = compileFormula('[Temp] + [Hum]', columns);
    expect(usedColumnIndices).toEqual([0, 1]);
    expect(evaluate([10, 20])).toBe(30);
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
    const { evaluate } = compileFormula('([Temp] + 10) * 2', columns);
    expect(evaluate([5])).toBe(30);
  });

  it('should handle complex expressions', () => {
    const { evaluate } = compileFormula('log(10^2) + pi - pi', columns);
    expect(evaluate([])).toBe(2);
  });

  it('should handle unary negation and negative numbers', () => {
    const { evaluate } = compileFormula('-[Temp] * -1', columns);
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
