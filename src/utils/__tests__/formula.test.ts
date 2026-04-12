import { describe, it, expect } from 'vitest';
import { compileFormula } from '../formula';

describe('compileFormula', () => {
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
