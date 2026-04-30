
/**
 * Formula utility for evaluating mathematical expressions on dataset columns.
 * Supports basic arithmetic, trig functions, sqrt, log, averages, and grouping.
 * Column names should be enclosed in square brackets, e.g., [Column Name].
 *
 * Implements a Shunting-yard algorithm to evaluate expressions without using eval() or new Function().
 */

export interface FormulaContext {
  queues: Record<number, number[]>;
  sums: Record<number, number>;
  timeQueues: Record<number, {t: number, v: number}[]>;
  timeSums: Record<number, number>;
  groupSums: Record<number, number>;
  groupCounts: Record<number, number>;
  groupLastKey: Record<number, string | number>;
  filterState: Record<number, { estimate: number, errorCov: number, measurementNoise: number }>;
  avgN: (id: number, val: number, n: number) => number;
  avgTime: (id: number, val: number, t: number, windowSec: number) => number;
  avgGroup: (id: number, val: number, key: string | number) => number;
  sumGroup: (id: number, val: number, key: string | number) => number;
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
  | { type: 'FUNC', value: string, id?: number, args?: number }
  | { type: 'CONST', value: number }
  | { type: 'LPAREN' }
  | { type: 'RPAREN' }
  | { type: 'COMMA' };

const columnMapCache = new WeakMap<string[], Map<string, number>>();


function evaluateFuncToken(
  token: Extract<Token, { type: 'FUNC' }>,
  args: number[],
  rowValues: number[],
  finalDataColumnIndices: number[],
  timeVarIdx: number,
  ctx?: FormulaContext
): number {
  const argCount = args.length;
  const a = args[0];

  switch (token.value) {
    case 'sin': return Math.sin(a);
    case 'cos': return Math.cos(a);
    case 'tan': return Math.tan(a);
    case 'asin': return Math.asin(a);
    case 'acos': return Math.acos(a);
    case 'atan': return Math.atan(a);
    case 'sqrt': return Math.sqrt(a);
    case 'abs': return Math.abs(a);
    case 'exp': return Math.exp(a);
    case 'log': return Math.log10(a);
    case 'ln': return Math.log(a);
    case 'round': return Math.round(a);
    case 'floor': return Math.floor(a);
    case 'ceil': return Math.ceil(a);
    case 'min': return Math.min(...args);
    case 'max': return Math.max(...args);
    case 'sum': {
      if (argCount === 0) {
        let s = 0;
        for (let j = 0; j < finalDataColumnIndices.length; j++) {
          s += rowValues[finalDataColumnIndices[j]];
        }
        return s;
      }
      return args.reduce((s, v) => s + v, 0);
    }
    case 'avg': {
      if (argCount === 0) {
        let s = 0;
        for (let j = 0; j < finalDataColumnIndices.length; j++) {
          s += rowValues[finalDataColumnIndices[j]];
        }
        return finalDataColumnIndices.length > 0 ? s / finalDataColumnIndices.length : 0;
      }
      return args.reduce((s, v) => s + v, 0) / argCount;
    }
    case 'filter':
      return ctx ? ctx.filter(token.id!, a) : a;
    case 'avgday':
    case 'sumday':
    case 'avghour':
    case 'sumhour': {
      if (ctx) {
        const t = rowValues[timeVarIdx];
        const date = new Date(t * (t > 1e11 ? 1 : 1000));
        let key: string;
        if (token.value.endsWith('day')) {
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
        } else {
          key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
        }
        if (token.value.startsWith('avg')) return ctx.avgGroup(token.id!, a, key);
        return ctx.sumGroup(token.id!, a, key);
      }
      return a;
    }
    default:
      if (ctx) {
        const m = token.value.match(/^avg(\d+)(s|m|h|d)?$/);
        if (m) {
          const num = parseInt(m[1], 10);
          const unit = m[2];
          if (unit) {
            let w = num;
            if (unit === 'm') w = num * 60;
            else if (unit === 'h') w = num * 3600;
            else if (unit === 'd') w = num * 86400;
            return ctx.avgTime(token.id!, a, rowValues[timeVarIdx], w);
          }
          return ctx.avgN(token.id!, a, num);
        }
      }
      return a; // Fallback
  }
}

function evaluateOpToken(token: Extract<Token, { type: 'OP' }>, stack: number[]): number {
  if (token.unary) {
    const a = stack.pop()!;
    if (token.value === 'u-') return -a;
    return a;
  } else {
    const b = stack.pop()!;
    const a = stack.pop()!;
    switch (token.value) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/': return a / b;
      case '^': return Math.pow(a, b);
      default: return a;
    }
  }
}

export function compileFormula(formula: string, availableColumns: string[]): FormulaResult {
  try {
    const usedColumnIndices: number[] = [];
    const columnMap = new Map<string, number>();
    let funcIdCounter = 0;
    let usesAllColumns = false;

    let availableColumnsMap = columnMapCache.get(availableColumns);

    const ensureAvailableColumnsMap = () => {
      if (!availableColumnsMap) {
        availableColumnsMap = new Map<string, number>();
        for (let i = 0; i < availableColumns.length; i++) {
          const col = availableColumns[i];
          if (!availableColumnsMap.has(col)) {
            availableColumnsMap.set(col, i);
          }
          const colonIdx = col.indexOf(': ');
          if (colonIdx !== -1) {
            const suffix = col.substring(colonIdx + 2);
            if (!availableColumnsMap.has(suffix)) {
              availableColumnsMap.set(suffix, i);
            }
          }
        }
        columnMapCache.set(availableColumns, availableColumnsMap);
      }
      return availableColumnsMap;
    };

    // 1. Identify and extract column names in brackets
    const columnRegex = /\[([^\]]+)\]/g;
    let match;
    while ((match = columnRegex.exec(formula)) !== null) {
      const fullMatch = match[0];
      const colName = match[1];

      if (!columnMap.has(fullMatch)) {
        const map = ensureAvailableColumnsMap();
        const colIndex = map.has(colName) ? map.get(colName)! : -1;

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

    const dataColumnIndices: number[] = [];
    const ensureAllDataColumns = () => {
      dataColumnIndices.length = 0;
      for (let i = 0; i < availableColumns.length; i++) {
        const lower = availableColumns[i].toLowerCase();
        if (lower.includes('time') || lower.includes('date')) continue;

        let varIdx = usedColumnIndices.indexOf(i);
        if (varIdx === -1) {
          varIdx = usedColumnIndices.length;
          usedColumnIndices.push(i);
        }
        dataColumnIndices.push(varIdx);
      }
      return dataColumnIndices;
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
        else if (['sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'sqrt', 'abs', 'exp', 'log', 'ln', 'round', 'floor', 'ceil', 'min', 'max', 'avg', 'sum', 'avgday', 'sumday', 'avghour', 'sumhour'].includes(name)) {
          if (['avgday', 'sumday', 'avghour', 'sumhour'].includes(name)) ensureTimeColumn();
          tokens.push({ type: 'FUNC', value: name, id: funcIdCounter++ });
        }
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
      if (char === ',') { tokens.push({ type: 'COMMA' }); i++; continue; }

      const opMap: Record<string, { prec: number, assoc: 'L' | 'R' }> = {
        '+': { prec: 2, assoc: 'L' },
        '-': { prec: 2, assoc: 'L' },
        '*': { prec: 3, assoc: 'L' },
        '/': { prec: 3, assoc: 'L' },
        '^': { prec: 4, assoc: 'R' }
      };

      if (opMap[char]) {
        // Handle unary minus
        if (char === '-' && (!prevToken || prevToken.type === 'OP' || prevToken.type === 'LPAREN' || prevToken.type === 'FUNC' || prevToken.type === 'COMMA')) {
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
    const argCountStack: number[] = [];

    for (let j = 0; j < tokens.length; j++) {
      const token = tokens[j];
      if (token.type === 'NUMBER' || token.type === 'VAR' || token.type === 'CONST') {
        outputQueue.push(token);
      } else if (token.type === 'FUNC') {
        operatorStack.push(token);
        argCountStack.push(0);
      } else if (token.type === 'COMMA') {
        while (operatorStack.length > 0 && operatorStack[operatorStack.length - 1].type !== 'LPAREN') {
          outputQueue.push(operatorStack.pop()!);
        }
        if (argCountStack.length > 0) {
          argCountStack[argCountStack.length - 1]++;
        } else {
          throw new Error('Unexpected comma');
        }
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
          const func = operatorStack.pop()! as Extract<Token, { type: 'FUNC' }>;
          let args = argCountStack.pop()!;
          const prevWasLparen = tokens[j - 1] && tokens[j - 1].type === 'LPAREN';
          if (!prevWasLparen) args++;
          func.args = args;
          outputQueue.push(func);

          if (args === 0 && (func.value === 'avg' || func.value === 'sum')) {
             usesAllColumns = true;
          }
        }
      }
    }
    while (operatorStack.length > 0) {
      const top = operatorStack.pop()!;
      if (top.type === 'LPAREN') throw new Error('Mismatched parentheses');
      outputQueue.push(top);
    }

    const finalDataColumnIndices = usesAllColumns ? [...ensureAllDataColumns()] : [];

    // 4. Create Evaluator (RPN interpreter, no new Function())
    const createContext = (): FormulaContext => {
      const ctx: FormulaContext = {
        queues: {},
        sums: {},
        timeQueues: {},
        timeSums: {},
        groupSums: {},
        groupCounts: {},
        groupLastKey: {},
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

        avgGroup: (id: number, val: number, key: string | number) => {
           if (ctx.groupLastKey[id] !== key) {
             ctx.groupSums[id] = 0;
             ctx.groupCounts[id] = 0;
             ctx.groupLastKey[id] = key;
           }
           ctx.groupSums[id] = (ctx.groupSums[id] || 0) + val;
           ctx.groupCounts[id] = (ctx.groupCounts[id] || 0) + 1;
           return ctx.groupSums[id] / ctx.groupCounts[id];
        },

        sumGroup: (id: number, val: number, key: string | number) => {
          if (ctx.groupLastKey[id] !== key) {
            ctx.groupSums[id] = 0;
            ctx.groupLastKey[id] = key;
          }
          ctx.groupSums[id] = (ctx.groupSums[id] || 0) + val;
          return ctx.groupSums[id];
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

    return {
      usedColumnIndices,
      createContext,
      evaluate: (rowValues: number[], ctx?: FormulaContext) => {
        const stack: number[] = [];
        for (const token of outputQueue) {
          if (token.type === 'NUMBER') stack.push(token.value);
          else if (token.type === 'CONST') stack.push(token.value);
          else if (token.type === 'VAR') stack.push(rowValues[token.index]);
          else if (token.type === 'FUNC') {
            const argCount = token.args !== undefined ? token.args : 1;
            const args: number[] = [];
            for (let j = 0; j < argCount; j++) args.push(stack.pop()!);
            args.reverse();

            stack.push(evaluateFuncToken(token as Extract<Token, { type: 'FUNC' }>, args, rowValues, finalDataColumnIndices, timeVarIdx, ctx));
          } else if (token.type === 'OP') {
            stack.push(evaluateOpToken(token as Extract<Token, { type: 'OP' }>, stack));
          }
        }
        return stack[0];
      }
    };
  } catch (err) {
    return { evaluate: () => NaN, usedColumnIndices: [], error: err instanceof Error ? err.message : String(err), createContext: () => ({} as FormulaContext) };
  }
}
