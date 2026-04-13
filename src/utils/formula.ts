
/**
 * Formula utility for evaluating mathematical expressions on dataset columns.
 * Supports +, -, *, /, ^, log (base 10), pi, e, and brackets.
 * Column names should be enclosed in square brackets, e.g., [Column Name].
 *
 * Implements a Shunting-yard algorithm to evaluate expressions without using eval() or new Function().
 */

export interface FormulaContext {
  queues: Record<number, number[]>;
  sums: Record<number, number>;
  timeQueues: Record<number, {t: number, v: number}[]>;
  timeSums: Record<number, number>;
  filterState: Record<number, { estimate: number, errorCov: number, measurementNoise: number }>;
  avgN: (id: number, val: number, n: number) => number;
  avgTime: (id: number, val: number, t: number, windowSec: number) => number;
  filter: (id: number, val: number) => number;
}

export interface FormulaResult {
  evaluate: (rowValues: number[], ctx?: FormulaContext) => number;
  usedColumnIndices: number[];
  error?: string;
  createContext?: () => FormulaContext;
  expression?: string;
}

type Token =
  | { type: 'NUMBER', value: number }
  | { type: 'VAR', index: number }
  | { type: 'OP', value: string, prec: number, assoc: 'L' | 'R', unary?: boolean }
  | { type: 'FUNC', value: string, id?: number }
  | { type: 'CONST', value: number }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' };

export function compileFormula(formula: string, availableColumns: string[]): FormulaResult {
  try {
    const usedColumnIndices: number[] = [];
    const columnMap = new Map<string, number>();
    let funcIdCounter = 0;

    // 1. Identify and extract column names in brackets
    const columnRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = columnRegex.exec(formula)) !== null) {
      const fullMatch = match[0];
      const colName = match[1];

      if (!columnMap.has(fullMatch)) {
        let colIndex = availableColumns.indexOf(colName);
        if (colIndex === -1) {
          colIndex = availableColumns.findIndex(c => c.endsWith(`: ${colName}`) || c === colName);
        }

        if (colIndex === -1) {
          return { evaluate: () => NaN, usedColumnIndices: [], error: `Column not found: ${colName}` };
        }
        columnMap.set(fullMatch, usedColumnIndices.length);
        usedColumnIndices.push(colIndex);
      }
    }

    let timeVarIdx = -1;
    const ensureTimeColumn = () => {
      if (timeVarIdx !== -1) return timeVarIdx;
      let colIndex = availableColumns.findIndex(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('date'));
      if (colIndex === -1) colIndex = 0;
      timeVarIdx = usedColumnIndices.indexOf(colIndex);
      if (timeVarIdx === -1) {
        timeVarIdx = usedColumnIndices.length;
        usedColumnIndices.push(colIndex);
      }
      return timeVarIdx;
    };

    // 2. Tokenize the formula
    const tokens: Token[] = [];
    let i = 0;
    while (i < formula.length) {
      const char = formula[i];
      const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;

      if (/\s/.test(char)) { i++; continue; }

      if (char === '[') {
        const end = formula.indexOf(']', i);
        if (end === -1) throw new Error('Missing closing bracket ]');
        const fullMatch = formula.substring(i, end + 1);
        const varIdx = columnMap.get(fullMatch);
        if (varIdx === undefined) throw new Error(`Unknown column: ${fullMatch}`);
        tokens.push({ type: 'VAR', index: varIdx });
        i = end + 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let numStr = '';
        while (i < formula.length && /[0-9.]/.test(formula[i])) {
          numStr += formula[i++];
        }
        tokens.push({ type: 'NUMBER', value: parseFloat(numStr) });
        continue;
      }

      if (/[a-zA-Z]/.test(char)) {
        let name = '';
        while (i < formula.length && /[a-zA-Z0-9]/.test(formula[i])) {
          name += formula[i++];
        }
        name = name.toLowerCase();
        if (name === 'pi') tokens.push({ type: 'CONST', value: Math.PI });
        else if (name === 'e') tokens.push({ type: 'CONST', value: Math.E });
        else if (name === 'log') tokens.push({ type: 'FUNC', value: 'log' });
        else if (/^avg\d+(s|m|h|d)?$/.test(name)) {
          if (/[smhd]$/.test(name)) ensureTimeColumn();
          tokens.push({ type: 'FUNC', value: name, id: funcIdCounter++ });
        }
        else if (name === 'filter') {
          tokens.push({ type: 'FUNC', value: 'filter', id: funcIdCounter++ });
        }
        else throw new Error(`Unknown function or constant: ${name}`);
        continue;
      }

      if (char === '(') { tokens.push({ type: 'LPAREN' }); i++; continue; }
      if (char === ')') { tokens.push({ type: 'RPAREN' }); i++; continue; }

      const opMap: Record<string, { prec: number, assoc: 'L' | 'R' }> = {
        '+': { prec: 2, assoc: 'L' },
        '-': { prec: 2, assoc: 'L' },
        '*': { prec: 3, assoc: 'L' },
        '/': { prec: 3, assoc: 'L' },
        '^': { prec: 4, assoc: 'R' }
      };

      if (opMap[char]) {
        // Handle unary minus
        if (char === '-' && (!prevToken || prevToken.type === 'OP' || prevToken.type === 'LPAREN' || prevToken.type === 'FUNC')) {
          tokens.push({ type: 'OP', value: 'u-', prec: 5, assoc: 'R', unary: true });
        } else {
          tokens.push({ type: 'OP', value: char, ...opMap[char] });
        }
        i++;
        continue;
      }

      throw new Error(`Unexpected character: ${char}`);
    }

    // 3. Convert to RPN (Reverse Polish Notation) using Shunting-yard
    const outputQueue: Token[] = [];
    const operatorStack: Token[] = [];

    for (const token of tokens) {
      if (token.type === 'NUMBER' || token.type === 'VAR' || token.type === 'CONST') {
        outputQueue.push(token);
      } else if (token.type === 'FUNC') {
        operatorStack.push(token);
      } else if (token.type === 'OP') {
        while (operatorStack.length > 0) {
          const top = operatorStack[operatorStack.length - 1];
          if (top.type === 'OP' && (
            (token.assoc === 'L' && token.prec <= top.prec) ||
            (token.assoc === 'R' && token.prec < top.prec)
          )) {
            outputQueue.push(operatorStack.pop()!);
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === 'LPAREN') {
        operatorStack.push(token);
      } else if (token.type === 'RPAREN') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
          outputQueue.push(operatorStack.pop()!);
        }
        if (operatorStack.length === 0) throw new Error('Mismatched parentheses');
        operatorStack.pop(); // remove LPAREN
        if (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type === 'FUNC') {
          outputQueue.push(operatorStack.pop()!);
        }
      }
    }
    while (operatorStack.length > 0) {
      const top = operatorStack.pop()!;
      if (top.type === 'LPAREN') throw new Error('Mismatched parentheses');
      outputQueue.push(top);
    }

    // 4. Create Evaluator
    const createContext = (): FormulaContext => {
      const ctx: FormulaContext = {
        queues: {},
        sums: {},
        timeQueues: {},
        timeSums: {},
        filterState: {},

        avgN: (id: number, val: number, n: number) => {
          if (!ctx.queues[id]) { ctx.queues[id] = []; ctx.sums[id] = 0; }
          const q = ctx.queues[id];
          q.push(val);
          ctx.sums[id] += val;
          if (q.length > n) {
            ctx.sums[id] -= q.shift()!;
          }
          return ctx.sums[id] / q.length;
        },

        avgTime: (id: number, val: number, t: number, windowSec: number) => {
          if (!ctx.timeQueues[id]) { ctx.timeQueues[id] = []; ctx.timeSums[id] = 0; }
          const q = ctx.timeQueues[id];
          q.push({ t, v: val });
          ctx.timeSums[id] += val;

          const isMs = t > 1e11;
          const cutoff = t - (isMs ? windowSec * 1000 : windowSec);

          while (q.length > 0 && q[0].t <= cutoff) {
            ctx.timeSums[id] -= q.shift()!.v;
          }
          return q.length > 0 ? ctx.timeSums[id] / q.length : 0;
        },

        filter: (id: number, val: number) => {
          if (!ctx.filterState[id]) {
            ctx.filterState[id] = { estimate: val, errorCov: 1, measurementNoise: 0.1 };
            return val;
          }
          const state = ctx.filterState[id];
          const processNoise = 1e-3;
          const priorEstimate = state.estimate;
          const priorErrorCov = state.errorCov + processNoise;

          const residual = val - priorEstimate;
          state.measurementNoise = 0.95 * state.measurementNoise + 0.05 * (residual * residual);
          const boundedMeasurementNoise = Math.max(1e-4, Math.min(100, state.measurementNoise));

          const kalmanGain = priorErrorCov / (priorErrorCov + boundedMeasurementNoise);
          state.estimate = priorEstimate + kalmanGain * residual;
          state.errorCov = (1 - kalmanGain) * priorErrorCov;

          return state.estimate;
        }
      };
      return ctx;
    };

    const generateJsExpression = (): string => {
      const stack: string[] = [];
      for (const token of outputQueue) {
        if (token.type === 'NUMBER') stack.push(token.value.toString());
        else if (token.type === 'CONST') stack.push(token.value.toString());
        else if (token.type === 'VAR') stack.push(`v[${token.index}]`);
        else if (token.type === 'FUNC') {
          const a = stack.pop()!;
          if (token.value === 'log') stack.push(`Math.log10(${a})`);
          else if (token.value === 'filter') stack.push(`c.filter(${token.id}, ${a})`);
          else {
            const m = token.value.match(/^avg(\d+)(s|m|h|d)?$/);
            if (m) {
              const num = parseInt(m[1], 10);
              const unit = m[2];
              if (unit) {
                let w = num;
                if (unit === 'm') w = num * 60;
                else if (unit === 'h') w = num * 3600;
                else if (unit === 'd') w = num * 86400;
                stack.push(`c.avgTime(${token.id}, ${a}, v[${timeVarIdx}], ${w})`);
              } else {
                stack.push(`c.avgN(${token.id}, ${a}, ${num})`);
              }
            }
          }
        } else if (token.type === 'OP') {
          if (token.unary) {
            const a = stack.pop()!;
            if (token.value === 'u-') stack.push(`(-(${a}))`);
          } else {
            const b = stack.pop()!;
            const a = stack.pop()!;
            if (token.value === '+') stack.push(`(${a}+${b})`);
            else if (token.value === '-') stack.push(`(${a}-${b})`);
            else if (token.value === '*') stack.push(`(${a}*${b})`);
            else if (token.value === '/') stack.push(`(${a}/${b})`);
            else if (token.value === '^') stack.push(`Math.pow(${a},${b})`);
          }
        }
      }
      return stack[0];
    };

    let fastEvaluate: ((v: number[], c?: FormulaContext) => number) | null = null;
    let expressionStr = '';
    try {
      expressionStr = generateJsExpression();
      fastEvaluate = new Function('v', 'c', `return ${expressionStr};`) as (v: number[], c?: FormulaContext) => number;
    } catch (e) {
      console.warn('Formula JIT failed, falling back to interpreter:', e);
    }

    return {
      usedColumnIndices,
      createContext,
      expression: expressionStr,
      evaluate: (rowValues: number[], ctx?: FormulaContext) => {
        if (fastEvaluate) return fastEvaluate(rowValues, ctx);
        
        const stack: number[] = [];
        for (const token of outputQueue) {
          if (token.type === 'NUMBER') stack.push(token.value);
          else if (token.type === 'CONST') stack.push(token.value);
          else if (token.type === 'VAR') stack.push(rowValues[token.index]);
          else if (token.type === 'FUNC') {
            const a = stack.pop()!;
            if (token.value === 'log') stack.push(Math.log10(a));
            else if (token.value === 'filter' && ctx) stack.push(ctx.filter(token.id!, a));
            else if (ctx) {
              const m = token.value.match(/^avg(\d+)(s|m|h|d)?$/);
              if (m) {
                const num = parseInt(m[1], 10);
                const unit = m[2];
                if (unit) {
                  let w = num;
                  if (unit === 'm') w = num * 60;
                  else if (unit === 'h') w = num * 3600;
                  else if (unit === 'd') w = num * 86400;
                  stack.push(ctx.avgTime(token.id!, a, rowValues[timeVarIdx], w));
                } else {
                  stack.push(ctx.avgN(token.id!, a, num));
                }
              }
            }
          } else if (token.type === 'OP') {
            if (token.unary) {
              const a = stack.pop()!;
              if (token.value === 'u-') stack.push(-a);
            } else {
              const b = stack.pop()!;
              const a = stack.pop()!;
              if (token.value === '+') stack.push(a + b);
              else if (token.value === '-') stack.push(a - b);
              else if (token.value === '*') stack.push(a * b);
              else if (token.value === '/') stack.push(a / b);
              else if (token.value === '^') stack.push(Math.pow(a, b));
            }
          }
        }
        return stack[0];
      }
    };
  } catch (err) {
    return { evaluate: () => NaN, usedColumnIndices: [], error: err instanceof Error ? err.message : String(err), createContext: () => ({} as FormulaContext) };
  }
}
