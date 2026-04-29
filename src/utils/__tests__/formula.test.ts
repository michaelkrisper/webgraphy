import { describe, it, expect } from 'vitest';
import { compileFormula } from '../formula';

describe('compileFormula', () => {
  const columns = ['Timestamp', 'A: Temp', 'A: Hum', 'A: Press'];

  it('should handle averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext } = compileFormula('avg3([Temp])', cols);
    const ctx = createContext!();

    expect(evaluate([10], ctx)).toBe(10);
    expect(evaluate([20], ctx)).toBe(15);
    expect(evaluate([30], ctx)).toBe(20);
    expect(evaluate([40], ctx)).toBe(30);
  });

  it('should handle time-based averaging functions', () => {
    const cols = ['Timestamp', 'Temp'];
    const { evaluate, createContext, usedColumnIndices } = compileFormula('avg2s([Temp])', cols);
    const ctx = createContext!();

    expect(usedColumnIndices).toEqual([1, 0]);

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

  it('should handle basic arithmetic', () => {
    const { evaluate, usedColumnIndices } = compileFormula('[Temp] + [Hum]', columns);
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
    const { evaluate, usedColumnIndices } = compileFormula('avg()', columns);
    expect(usedColumnIndices).toEqual([1, 2, 3]);
    expect(evaluate([10, 20, 30])).toBe(20);
  });

  it('should handle avgDay resetting', () => {
    const { evaluate, createContext, usedColumnIndices } = compileFormula('avgday([Temp])', columns);
    const ctx = createContext!();

    expect(usedColumnIndices).toEqual([1, 0]);

    const t1 = new Date('2023-01-01T10:00:00Z').getTime() / 1000;
    const t2 = new Date('2023-01-01T11:00:00Z').getTime() / 1000;
    const t3 = new Date('2023-01-02T10:00:00Z').getTime() / 1000;

    expect(evaluate([10, t1], ctx)).toBe(10);
    expect(evaluate([20, t2], ctx)).toBe(15);
    expect(evaluate([40, t3], ctx)).toBe(40);
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

  it('should handle error paths for invalid tokens and compilation errors', () => {
    // Missing closing bracket
    const res1 = compileFormula('[Temp', columns);
    expect(res1.error).toContain('Missing closing bracket ]');
    expect(res1.evaluate([])).toBeNaN();
    expect(res1.usedColumnIndices).toEqual([]);

    // Unknown function
    const res2 = compileFormula('unknownfunc([Temp])', columns);
    expect(res2.error).toContain('Unknown function or constant: unknownfunc');
    expect(res2.evaluate([])).toBeNaN();

    // Unexpected comma in expression without functions handling it
    const res3 = compileFormula('10, 20', columns);
    expect(res3.error).toContain('Unexpected comma');
    expect(res3.evaluate([])).toBeNaN();

    // Mismatched parentheses - missing opening
    const res4 = compileFormula('10 + 20)', columns);
    expect(res4.error).toContain('Mismatched parentheses');
    expect(res4.evaluate([])).toBeNaN();

    // Mismatched parentheses - missing closing
    const res5 = compileFormula('(10 + 20', columns);
    expect(res5.error).toContain('Mismatched parentheses');
    expect(res5.evaluate([])).toBeNaN();

    // Unexpected character during lexing
    const res6 = compileFormula('10 $ 20', columns);
    expect(res6.error).toContain('Unexpected character: $');
    expect(res6.evaluate([])).toBeNaN();
    expect(res6.usedColumnIndices).toEqual([]);
  });

  it('should handle missing functions coverage', () => {
    const resAsin = compileFormula('asin(1)', columns);
    expect(resAsin.evaluate([])).toBeCloseTo(Math.PI / 2);

    const resAcos = compileFormula('acos(1)', columns);
    expect(resAcos.evaluate([])).toBeCloseTo(0);

    const resAtan = compileFormula('atan(1)', columns);
    expect(resAtan.evaluate([])).toBeCloseTo(Math.PI / 4);

    const resExp = compileFormula('exp(1)', columns);
    expect(resExp.evaluate([])).toBeCloseTo(Math.E);

    const resLn = compileFormula('ln(1)', columns);
    expect(resLn.evaluate([])).toBeCloseTo(0);

    const resRound = compileFormula('round(1.5)', columns);
    expect(resRound.evaluate([])).toBe(2);

    const resFloor = compileFormula('floor(1.5)', columns);
    expect(resFloor.evaluate([])).toBe(1);

    const resCeil = compileFormula('ceil(1.5)', columns);
    expect(resCeil.evaluate([])).toBe(2);
  });

  it('should test sum() and sum() arguments coverage', () => {
    const { evaluate: evalSumAll } = compileFormula('sum()', columns);
    expect(evalSumAll([10, 20, 30, 40])).toBe(60);

    const { evaluate: evalSumArgs } = compileFormula('sum(10, 20)', columns);
    expect(evalSumArgs([])).toBe(30);
  });

  it('should test sumday, avghour, sumhour', () => {
    const resSumDay = compileFormula('sumday([Temp])', columns);
    const ctxSumDay = resSumDay.createContext!();
    const t1 = new Date('2023-01-01T10:00:00Z').getTime() / 1000;
    const t2 = new Date('2023-01-01T11:00:00Z').getTime() / 1000;
    const t3 = new Date('2023-01-02T10:00:00Z').getTime() / 1000;

    expect(resSumDay.evaluate([10, t1], ctxSumDay)).toBe(10);
    expect(resSumDay.evaluate([20, t2], ctxSumDay)).toBe(30);
    expect(resSumDay.evaluate([40, t3], ctxSumDay)).toBe(40);

    const resAvgHour = compileFormula('avghour([Temp])', columns);
    const ctxAvgHour = resAvgHour.createContext!();
    expect(resAvgHour.evaluate([10, t1], ctxAvgHour)).toBe(10);
    expect(resAvgHour.evaluate([20, t1 + 10], ctxAvgHour)).toBe(15);
    expect(resAvgHour.evaluate([40, t2], ctxAvgHour)).toBe(40);

    const resSumHour = compileFormula('sumhour([Temp])', columns);
    const ctxSumHour = resSumHour.createContext!();
    expect(resSumHour.evaluate([10, t1], ctxSumHour)).toBe(10);
    expect(resSumHour.evaluate([20, t1 + 10], ctxSumHour)).toBe(30);
    expect(resSumHour.evaluate([40, t2], ctxSumHour)).toBe(40);
  });

  it('should cover missing branches for evaluation logic', () => {
    // Testing the "Unexpected comma" error specifically where arguments are empty
    const resComma = compileFormula('1 , 2', columns);
    expect(resComma.error).toBe('Unexpected comma');

    // Extra edge cases requested by reviewer
    const resMismatched1 = compileFormula('((1+2)', columns);
    expect(resMismatched1.error).toContain('Mismatched parentheses');


    const resMismatched3 = compileFormula(')', columns);
    expect(resMismatched3.error).toContain('Mismatched parentheses');


    // Test for 'avg1' without unit
    const resAvg1 = compileFormula('avg1([Temp])', columns);
    const ctxAvg1 = resAvg1.createContext!();
    expect(resAvg1.evaluate([10], ctxAvg1)).toBe(10);
    expect(resAvg1.evaluate([20], ctxAvg1)).toBe(20);

    // Test for 'avg1m' with minute unit
    const resAvg1m = compileFormula('avg1m([Temp])', columns);
    const ctxAvg1m = resAvg1m.createContext!();
    expect(resAvg1m.evaluate([10, 1000], ctxAvg1m)).toBe(10);

    // Test for 'avg1h' with hour unit
    const resAvg1h = compileFormula('avg1h([Temp])', columns);
    const ctxAvg1h = resAvg1h.createContext!();
    expect(resAvg1h.evaluate([10, 1000], ctxAvg1h)).toBe(10);

    // Test for 'avg1d' with day unit
    const resAvg1d = compileFormula('avg1d([Temp])', columns);
    const ctxAvg1d = resAvg1d.createContext!();
    expect(resAvg1d.evaluate([10, 1000], ctxAvg1d)).toBe(10);

    // Defensive fallback testing - providing unknown functions triggers an error
    // earlier in the lexer as checked in 'should return error for invalid characters'
    // but the token evaluation includes a fallback. This handles edge
    // cases we cannot easily trigger through the string compiler directly without mock modifications.
  });
});
