/**
 * Formula utility for evaluating mathematical expressions on dataset columns.
 * Supports basic arithmetic, trig functions, sqrt, log, averages, and grouping.
 * Column names should be enclosed in square brackets, e.g., [Column Name].
 *
 * Implements a Shunting-yard algorithm to evaluate expressions without using eval() or new Function().
 */

import { processRawColumn } from "./data-processing";
import {
  exponentialRegression,
  kdeSmoothing,
  linearRegression,
  logisticRegression,
  polynomialRegression,
} from "./regression";

interface FormulaContext {
  queues: Record<number, number[]>;
  sums: Record<number, number>;
  timeQueues: Record<number, { t: number; v: number }[]>;
  timeSums: Record<number, number>;
  groupSums: Record<number, number>;
  groupCounts: Record<number, number>;
  groupLastKey: Record<number, string | number>;
  filterState: Record<
    number,
    { estimate: number; errorCov: number; measurementNoise: number }
  >;
  avgN: (id: number, val: number, n: number) => number;
  avgTime: (id: number, val: number, t: number, windowSec: number) => number;
  avgGroup: (id: number, val: number, key: string | number) => number;
  sumGroup: (id: number, val: number, key: string | number) => number;
  filter: (id: number, val: number) => number;
}

interface FormulaResult {
  evaluate: (rowValues: number[], ctx?: FormulaContext) => number;
  usedColumnIndices: number[];
  error?: string;
  createContext?: () => FormulaContext;
  expression?: string;
}

type Token =
  | { type: "NUMBER"; value: number }
  | { type: "VAR"; index: number }
  | {
      type: "OP";
      value: string;
      prec: number;
      assoc: "L" | "R";
      unary?: boolean;
    }
  | { type: "FUNC"; value: string; id?: number; args?: number }
  | { type: "CONST"; value: number }
  | { type: "LPAREN" }
  | { type: "RPAREN" }
  | { type: "COMMA" };

const columnMapCache = new WeakMap<string[], Map<string, number>>();

const MATH_FUNCTIONS: Record<string, (a: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	sqrt: Math.sqrt,
	abs: Math.abs,
	exp: Math.exp,
	log: Math.log10,
	ln: Math.log,
	round: Math.round,
	floor: Math.floor,
	ceil: Math.ceil,
};

function evaluateSum(
	args: number[],
	rowValues: number[],
	finalDataColumnIndices: number[],
): number {
	const argCount = args.length;
	if (argCount === 0) {
		let s = 0;
		for (let j = 0; j < finalDataColumnIndices.length; j++) {
			s += rowValues[finalDataColumnIndices[j]];
		}
		return s;
	}
	let s = 0;
	for (let i = 0; i < argCount; i++) {
		s += args[i];
	}
	return s;
}

function evaluateAvg(
	args: number[],
	rowValues: number[],
	finalDataColumnIndices: number[],
): number {
	const argCount = args.length;
	if (argCount === 0) {
		let s = 0;
		for (let j = 0; j < finalDataColumnIndices.length; j++) {
			s += rowValues[finalDataColumnIndices[j]];
		}
		return finalDataColumnIndices.length > 0
			? s / finalDataColumnIndices.length
			: 0;
	}
	let s = 0;
	for (let i = 0; i < argCount; i++) {
		s += args[i];
	}
	return s / argCount;
}

function evaluateTimeGroup(
	token: Extract<Token, { type: "FUNC" }>,
	a: number,
	rowValues: number[],
	timeVarIdx: number,
	ctx?: FormulaContext,
): number {
	if (!ctx) return a;
	const t = rowValues[timeVarIdx];
	const date = new Date(t > 1e14 ? t / 1000 : t > 1e11 ? t : t * 1000);
	let key: string;
	const v = token.value;
	if (v.endsWith("day")) {
		key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
	} else if (v.endsWith("hour")) {
		key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}`;
	} else if (v.endsWith("minute")) {
		key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}`;
	} else {
		key = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}-${date.getHours()}-${date.getMinutes()}-${date.getSeconds()}`;
	}
	if (token.id) {
		if (v.startsWith("avg")) return ctx.avgGroup(token.id, a, key);
		return ctx.sumGroup(token.id, a, key);
	}
	return a;
}

function evaluateDynamicAvg(
	token: Extract<Token, { type: "FUNC" }>,
	a: number,
	rowValues: number[],
	timeVarIdx: number,
	ctx?: FormulaContext,
): number {
	if (!ctx) return a;
	const m = token.value.match(/^avg(\d+)(s|m|h|d)?[lcr]?$/);
	if (m) {
		const num = parseInt(m[1], 10);
		const unit = m[2];
		if (token.id) {
			if (unit) {
				let w = num;
				if (unit === "m") w = num * 60;
				else if (unit === "h") w = num * 3600;
				else if (unit === "d") w = num * 86400;
				return ctx.avgTime(token.id, a, rowValues[timeVarIdx], w);
			}
			return ctx.avgN(token.id, a, num);
		}
	}
	return a;
}

function evaluateFuncToken(
  token: Extract<Token, { type: "FUNC" }>,
  args: number[],
  rowValues: number[],
  finalDataColumnIndices: number[],
  timeVarIdx: number,
  ctx?: FormulaContext,
): number {
  const a = args[0];

  if (MATH_FUNCTIONS[token.value]) {
    return MATH_FUNCTIONS[token.value](a);
  }

  switch (token.value) {
    case "min":
      return Math.min(...args);
    case "max":
      return Math.max(...args);
    case "sum":
      return evaluateSum(args, rowValues, finalDataColumnIndices);
    case "avg":
      return evaluateAvg(args, rowValues, finalDataColumnIndices);
    case "filter":
      return ctx && token.id ? ctx.filter(token.id, a) : a;
    case "avgday":
    case "sumday":
    case "avghour":
    case "sumhour":
    case "avgminute":
    case "summinute":
    case "avgsecond":
    case "sumsecond":
      return evaluateTimeGroup(token, a, rowValues, timeVarIdx, ctx);
    default:
      return evaluateDynamicAvg(token, a, rowValues, timeVarIdx, ctx);
  }
}

export function compileFormula(
  formula: string,
  availableColumns: string[],
): FormulaResult {
  try {
    const usedColumnIndices: number[] = [];
    const columnMap = new Map<string, number>();
    let funcIdCounter = 1;
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
          const colonIdx = col.indexOf(": ");
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
    // Use longest-match to support column names containing brackets (e.g. "v_act [km/h]")
    const map1 = ensureAvailableColumnsMap();
    let scanPos = 0;
    while (scanPos < formula.length) {
      const start = formula.indexOf("[", scanPos);
      if (start === -1) break;
      // Try longest match first: find all ']' positions and pick the last one that maps to a known column
      let bestEnd = -1;
      let searchFrom = start + 1;
      while (true) {
        const end = formula.indexOf("]", searchFrom);
        if (end === -1) break;
        const candidate = formula.substring(start + 1, end);
        if (map1.has(candidate)) bestEnd = end;
        searchFrom = end + 1;
      }
      if (bestEnd === -1) {
        // No known column found — try first ] for error reporting
        const end = formula.indexOf("]", start + 1);
        if (end === -1) {
          scanPos = start + 1;
          continue;
        }
        const colName = formula.substring(start + 1, end);
        const fullMatch = formula.substring(start, end + 1);
        if (!columnMap.has(fullMatch)) {
          return {
            evaluate: () => NaN,
            usedColumnIndices: [],
            error: `Column not found: ${colName}`,
          };
        }
        scanPos = end + 1;
      } else {
        const fullMatch = formula.substring(start, bestEnd + 1);
        const colName = formula.substring(start + 1, bestEnd);
        if (!columnMap.has(fullMatch)) {
          const colIndex = map1.get(colName)!;
          columnMap.set(fullMatch, usedColumnIndices.length);
          usedColumnIndices.push(colIndex);
        }
        scanPos = bestEnd + 1;
      }
    }

    let timeVarIdx = -1;
    const ensureTimeColumn = () => {
      if (timeVarIdx !== -1) return timeVarIdx;
      let colIndex = availableColumns.findIndex(
        (c) =>
          c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
      );
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
        if (lower.includes("time") || lower.includes("date")) continue;

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

      if (/\s/.test(char)) {
        i++;
        continue;
      }

      if (char === "[") {
        // Longest-match: try each ']' and pick the last one that maps to a known column
        let bestEnd = -1;
        let searchFrom = i + 1;
        while (true) {
          const end = formula.indexOf("]", searchFrom);
          if (end === -1) break;
          if (columnMap.has(formula.substring(i, end + 1))) bestEnd = end;
          searchFrom = end + 1;
        }
        if (bestEnd === -1) {
          const end = formula.indexOf("]", i + 1);
          if (end === -1) throw new Error("Missing closing bracket ]");
          throw new Error(`Unknown column: ${formula.substring(i + 1, end)}`);
        }
        const fullMatch = formula.substring(i, bestEnd + 1);
        tokens.push({ type: "VAR", index: columnMap.get(fullMatch)! });
        i = bestEnd + 1;
        continue;
      }

      if (/[0-9.]/.test(char)) {
        let numStr = "";
        while (i < formula.length && /[0-9.]/.test(formula[i])) {
          numStr += formula[i++];
        }
        tokens.push({ type: "NUMBER", value: parseFloat(numStr) });
        continue;
      }

      if (/[a-zA-Z]/.test(char)) {
        let name = "";
        while (i < formula.length && /[a-zA-Z0-9]/.test(formula[i])) {
          name += formula[i++];
        }
        name = name.toLowerCase();
        if (name === "pi") tokens.push({ type: "CONST", value: Math.PI });
        else if (name === "e") tokens.push({ type: "CONST", value: Math.E });
        else if (
          [
            "sin",
            "cos",
            "tan",
            "asin",
            "acos",
            "atan",
            "sqrt",
            "abs",
            "exp",
            "log",
            "ln",
            "round",
            "floor",
            "ceil",
            "min",
            "max",
            "avg",
            "sum",
            "avgday",
            "avgdayc",
            "avgdayl",
            "avgdayr",
            "sumday",
            "avghour",
            "avghourc",
            "avghourl",
            "avghourr",
            "sumhour",
            "avgminute",
            "avgminutec",
            "avgminutel",
            "avgminuter",
            "summinute",
            "avgsecond",
            "avgsecondc",
            "avgsecondl",
            "avgsecondr",
            "sumsecond",
          ].includes(name)
        ) {
          if (/^(avg|sum)(day|hour|minute|second)/.test(name))
            ensureTimeColumn();
          tokens.push({ type: "FUNC", value: name, id: funcIdCounter++ });
        } else if (/^avg\d+((s|m|h|d)[lcr]?|[lcr])?$/.test(name)) {
          if (/^avg\d+(s|m|h|d)/.test(name)) ensureTimeColumn();
          tokens.push({ type: "FUNC", value: name, id: funcIdCounter++ });
        } else if (name === "filter") {
          tokens.push({ type: "FUNC", value: "filter", id: funcIdCounter++ });
        } else throw new Error(`Unknown function or constant: ${name}`);
        continue;
      }

      if (char === "(") {
        tokens.push({ type: "LPAREN" });
        i++;
        continue;
      }
      if (char === ")") {
        tokens.push({ type: "RPAREN" });
        i++;
        continue;
      }
      if (char === ",") {
        tokens.push({ type: "COMMA" });
        i++;
        continue;
      }

      const opMap: Record<string, { prec: number; assoc: "L" | "R" }> = {
        "+": { prec: 2, assoc: "L" },
        "-": { prec: 2, assoc: "L" },
        "*": { prec: 3, assoc: "L" },
        "/": { prec: 3, assoc: "L" },
        "^": { prec: 4, assoc: "R" },
      };

      if (opMap[char]) {
        // Handle unary minus
        if (
          char === "-" &&
          (!prevToken ||
            prevToken.type === "OP" ||
            prevToken.type === "LPAREN" ||
            prevToken.type === "FUNC" ||
            prevToken.type === "COMMA")
        ) {
          tokens.push({
            type: "OP",
            value: "u-",
            prec: 5,
            assoc: "R",
            unary: true,
          });
        } else {
          tokens.push({ type: "OP", value: char, ...opMap[char] });
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
      if (
        token.type === "NUMBER" ||
        token.type === "VAR" ||
        token.type === "CONST"
      ) {
        outputQueue.push(token);
      } else if (token.type === "FUNC") {
        operatorStack.push(token);
        argCountStack.push(0);
      } else if (token.type === "COMMA") {
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1].type !== "LPAREN"
        ) {
          outputQueue.push(operatorStack.pop()!);
        }
        if (argCountStack.length > 0) {
          argCountStack[argCountStack.length - 1]++;
        } else {
          throw new Error("Unexpected comma");
        }
      } else if (token.type === "OP") {
        while (operatorStack.length > 0) {
          const top = operatorStack[operatorStack.length - 1];
          if (
            top.type === "OP" &&
            ((token.assoc === "L" && token.prec <= top.prec) ||
              (token.assoc === "R" && token.prec < top.prec))
          ) {
            outputQueue.push(operatorStack.pop()!);
          } else {
            break;
          }
        }
        operatorStack.push(token);
      } else if (token.type === "LPAREN") {
        operatorStack.push(token);
      } else if (token.type === "RPAREN") {
        while (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1].type !== "LPAREN"
        ) {
          outputQueue.push(operatorStack.pop()!);
        }
        if (operatorStack.length === 0)
          throw new Error("Mismatched parentheses");
        operatorStack.pop(); // remove LPAREN

        if (
          operatorStack.length > 0 &&
          operatorStack[operatorStack.length - 1].type === "FUNC"
        ) {
          const func = operatorStack.pop()! as Extract<Token, { type: "FUNC" }>;
          let args = argCountStack.pop()!;
          const prevWasLparen =
            tokens[j - 1] && tokens[j - 1].type === "LPAREN";
          if (!prevWasLparen) args++;
          func.args = args;
          outputQueue.push(func);

          if (args === 0 && (func.value === "avg" || func.value === "sum")) {
            usesAllColumns = true;
          }
        }
      }
    }
    while (operatorStack.length > 0) {
      const top = operatorStack.pop()!;
      if (top.type === "LPAREN") throw new Error("Mismatched parentheses");
      outputQueue.push(top);
    }

    const finalDataColumnIndices = usesAllColumns
      ? [...ensureAllDataColumns()]
      : [];

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
          if (!ctx.queues[id]) {
            ctx.queues[id] = [];
            ctx.sums[id] = 0;
          }
          const q = ctx.queues[id];
          q.push(val);
          ctx.sums[id] += val;
          if (q.length > n) {
            ctx.sums[id] -= q.shift()!;
          }
          return ctx.sums[id] / q.length;
        },

        avgTime: (id: number, val: number, t: number, windowSec: number) => {
          if (!ctx.timeQueues[id]) {
            ctx.timeQueues[id] = [];
            ctx.timeSums[id] = 0;
          }
          const q = ctx.timeQueues[id];
          const tMs = t > 1e14 ? t / 1000 : t > 1e11 ? t : t * 1000;
          q.push({ t: tMs, v: val });
          ctx.timeSums[id] += val;

          const cutoff = tMs - windowSec * 1000;

          while (q.length > 0 && q[0].t <= cutoff) {
            ctx.timeSums[id] -= q.shift()?.v ?? 0;
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
            ctx.filterState[id] = {
              estimate: val,
              errorCov: 1,
              measurementNoise: 0.1,
            };
            return val;
          }
          const state = ctx.filterState[id];
          const processNoise = 1e-3;
          const priorEstimate = state.estimate;
          const priorErrorCov = state.errorCov + processNoise;

          const residual = val - priorEstimate;
          state.measurementNoise =
            0.95 * state.measurementNoise + 0.05 * (residual * residual);
          const boundedMeasurementNoise = Math.max(
            1e-4,
            Math.min(100, state.measurementNoise),
          );

          const kalmanGain =
            priorErrorCov / (priorErrorCov + boundedMeasurementNoise);
          state.estimate = priorEstimate + kalmanGain * residual;
          state.errorCov = (1 - kalmanGain) * priorErrorCov;

          return state.estimate;
        },
      };
      return ctx;
    };

    // Pre-allocated stack + args scratch — reused across every row evaluation.
    // The shunting-yard output rarely needs more than a handful of stack slots,
    // but 64 leaves headroom for deeply nested expressions without bounds checks.
    const stack = new Float64Array(64);
    const argsScratch: number[] = [];

    return {
      usedColumnIndices,
      createContext,
      evaluate: (rowValues: number[], ctx?: FormulaContext) => {
        let sp = 0;
        for (let i = 0; i < outputQueue.length; i++) {
          const token = outputQueue[i];
          const type = token.type;
          if (type === "NUMBER" || type === "CONST") {
            stack[sp++] = token.value;
          } else if (type === "VAR") {
            stack[sp++] = rowValues[token.index];
          } else if (type === "FUNC") {
            const argCount = token.args !== undefined ? token.args : 1;
            argsScratch.length = argCount;
            for (let j = argCount - 1; j >= 0; j--)
              argsScratch[j] = stack[--sp];
            stack[sp++] = evaluateFuncToken(
              token,
              argsScratch,
              rowValues,
              finalDataColumnIndices,
              timeVarIdx,
              ctx,
            );
          } else if (type === "OP") {
            const op = token.value;
            if (token.unary) {
              const a = stack[--sp];
              stack[sp++] = op === "u-" ? -a : a;
            } else {
              const b = stack[--sp];
              const a = stack[--sp];
              let r: number;
              switch (op) {
                case "+":
                  r = a + b;
                  break;
                case "-":
                  r = a - b;
                  break;
                case "*":
                  r = a * b;
                  break;
                case "/":
                  r = a / b;
                  break;
                case "^":
                  r = a ** b;
                  break;
                default:
                  r = a;
              }
              stack[sp++] = r;
            }
          }
        }
        return stack[0];
      },
    };
  } catch (err) {
    return {
      evaluate: () => NaN,
      usedColumnIndices: [],
      error: err instanceof Error ? err.message : String(err),
      createContext: () => ({}) as FormulaContext,
    };
  }
}

// --- Sync Evaluation Logic (Migrated from Worker) ---

const REGRESSION_PATTERNS: { pattern: RegExp; type: string }[] = [
  { pattern: /^linreg\(\[([^\]]+)\]\)$/i, type: "linear" },
  { pattern: /^polyreg\(\[([^\]]+)\]\s*,\s*(\d+)\)$/i, type: "poly" },
  { pattern: /^polyreg\(\[([^\]]+)\]\)$/i, type: "poly_default" },
  { pattern: /^expreg\(\[([^\]]+)\]\)$/i, type: "exponential" },
  { pattern: /^logreg\(\[([^\]]+)\]\)$/i, type: "logistic" },
  { pattern: /^kde\(\[([^\]]+)\]\)$/i, type: "kde" },
  { pattern: /^kde\(\[([^\]]+)\]\s*,\s*([0-9.]+)\)$/i, type: "kde_bw" },
];

function tryRegressionFormula(
  formula: string,
  columns: string[],
  rowCount: number,
  columnData: { data: Float32Array; refPoint: number }[],
): Float64Array | null {
  const trimmed = formula.trim();

  for (const { pattern, type } of REGRESSION_PATTERNS) {
    const match = trimmed.match(pattern);
    if (!match) continue;

    const colName = match[1];
    // Find column index
    let yColIdx = columns.indexOf(colName);
    if (yColIdx === -1) {
      yColIdx = columns.findIndex(
        (c) => c.endsWith(`: ${colName}`) || c === colName,
      );
    }
    if (yColIdx === -1) return null;

    // Build x and y arrays
    const xArr = new Float64Array(rowCount);
    const yArr = new Float64Array(rowCount);
    const xRef = columnData[0]?.refPoint || 0; // x column is first in columnData for regression
    const yRef = columnData[1]?.refPoint || 0;
    const xData = columnData[0]?.data;
    const yData = columnData[1]?.data;
    if (!xData || !yData) return null;

    for (let i = 0; i < rowCount; i++) {
      xArr[i] = xData[i] + xRef;
      yArr[i] = yData[i] + yRef;
    }

    switch (type) {
      case "linear":
        return linearRegression(xArr, yArr);
      case "poly":
        return polynomialRegression(xArr, yArr, parseInt(match[2], 10));
      case "poly_default":
        return polynomialRegression(xArr, yArr, 3);
      case "exponential":
        return exponentialRegression(xArr, yArr);
      case "logistic":
        return logisticRegression(xArr, yArr);
      case "kde":
        return kdeSmoothing(xArr, yArr);
      case "kde_bw":
        return kdeSmoothing(xArr, yArr, parseFloat(match[2]));
    }
  }
  return null;
}

export interface FormulaWorkerParams {
  datasetId: string;
  name: string;
  formula: string;
  columns: string[];
  rowCount: number;
  columnData: { data: Float32Array; refPoint: number }[];
}

export interface FormulaEvaluationResult {
  type: "success" | "error";
  newColumn?: {
    isFloat64: boolean;
    refPoint: number;
    bounds: { min: number; max: number };
    data: Float32Array;
    formula?: string;
  };
  sparseXColumn?: {
    isFloat64: boolean;
    refPoint: number;
    bounds: { min: number; max: number };
    data: Float32Array;
  };
  datasetId?: string;
  name?: string;
  error?: string;
}

function evaluateGroupAverage(
  groupAvgMatch: RegExpMatchArray,
  formula: string,
  columns: string[],
  rowCount: number,
  columnData: { data: Float32Array; refPoint: number }[],
  datasetId?: string,
  name?: string,
): FormulaEvaluationResult {
  const granularity = groupAvgMatch[1].toLowerCase();
  const align = (groupAvgMatch[2]?.toLowerCase() ?? "c") as "l" | "c" | "r";
  const colName = groupAvgMatch[3];

  const compiled = compileFormula(formula, columns);
  if (compiled.error) {
    return { type: "error", error: compiled.error };
  }

  const cols = columns as string[];
  const timeGlobalIdx =
    cols.findIndex(
      (c: string) =>
        c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
    ) ?? 0;
  const valueGlobalIdx = (() => {
    let idx = cols.indexOf(colName);
    if (idx === -1)
      idx = cols.findIndex(
        (c: string) => c.endsWith(`: ${colName}`) || c === colName,
      );
    return idx;
  })();
  if (valueGlobalIdx === -1) {
    return { type: "error", error: `Column not found: ${colName}` };
  }

  const localTimeIdx = compiled.usedColumnIndices.indexOf(timeGlobalIdx);
  const localValueIdx = compiled.usedColumnIndices.indexOf(valueGlobalIdx);
  if (localTimeIdx === -1 || localValueIdx === -1) {
    return { type: "error", error: "Could not resolve column indices" };
  }

  const timeCol = columnData[localTimeIdx];
  const valCol = columnData[localValueIdx];

  const d = new Date();
  let lastYr = -1,
    lastMo = -1,
    lastDa = -1,
    lastHr = -1,
    lastMin = -1,
    lastSec = -1;
  let lastRes = "";

  const getTimeKey = (t: number): string => {
    const ms = t > 1e14 ? t / 1000 : t > 1e11 ? t : t * 1000;
    d.setTime(ms);

    if (granularity === "day") {
      const yr = d.getFullYear(),
        mo = d.getMonth(),
        da = d.getDate();
      if (yr === lastYr && mo === lastMo && da === lastDa) return lastRes;
      lastYr = yr;
      lastMo = mo;
      lastDa = da;
      lastRes = `${yr}-${mo}-${da}`;
      return lastRes;
    }
    if (granularity === "hour") {
      const yr = d.getFullYear(),
        mo = d.getMonth(),
        da = d.getDate(),
        hr = d.getHours();
      if (yr === lastYr && mo === lastMo && da === lastDa && hr === lastHr)
        return lastRes;
      lastYr = yr;
      lastMo = mo;
      lastDa = da;
      lastHr = hr;
      lastRes = `${yr}-${mo}-${da}-${hr}`;
      return lastRes;
    }
    if (granularity === "minute") {
      const yr = d.getFullYear(),
        mo = d.getMonth(),
        da = d.getDate(),
        hr = d.getHours(),
        min = d.getMinutes();
      if (
        yr === lastYr &&
        mo === lastMo &&
        da === lastDa &&
        hr === lastHr &&
        min === lastMin
      )
        return lastRes;
      lastYr = yr;
      lastMo = mo;
      lastDa = da;
      lastHr = hr;
      lastMin = min;
      lastRes = `${yr}-${mo}-${da}-${hr}-${min}`;
      return lastRes;
    }

    const yr = d.getFullYear(),
      mo = d.getMonth(),
      da = d.getDate(),
      hr = d.getHours(),
      min = d.getMinutes(),
      sec = d.getSeconds();
    if (
      yr === lastYr &&
      mo === lastMo &&
      da === lastDa &&
      hr === lastHr &&
      min === lastMin &&
      sec === lastSec
    )
      return lastRes;
    lastYr = yr;
    lastMo = mo;
    lastDa = da;
    lastHr = hr;
    lastMin = min;
    lastSec = sec;
    lastRes = `${yr}-${mo}-${da}-${hr}-${min}-${sec}`;
    return lastRes;
  };

  // Pass 1: aggregate per group, track representative row index per alignment
  const groupSums = new Map<string, number>();
  const groupCounts = new Map<string, number>();
  const groupFirst = new Map<string, number>();
  const groupLast = new Map<string, number>();
  for (let i = 0; i < rowCount; i++) {
    const t = timeCol.data[i] + timeCol.refPoint;
    const v = valCol.data[i] + valCol.refPoint;
    const key = getTimeKey(t);
    groupSums.set(key, (groupSums.get(key) ?? 0) + v);
    groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
    if (!groupFirst.has(key)) groupFirst.set(key, i);
    groupLast.set(key, i);
  }

  // Build compact (x, y) arrays — one point per group at representative position
  const repXVals: number[] = [];
  const repYVals: number[] = [];
  groupFirst.forEach((firstIdx, key) => {
    const lastIdx = groupLast.get(key)!;
    let repIdx: number;
    if (align === "l") repIdx = firstIdx;
    else if (align === "r") repIdx = lastIdx;
    else repIdx = Math.round((firstIdx + lastIdx) / 2);
    repXVals.push(timeCol.data[repIdx] + timeCol.refPoint);
    repYVals.push(groupSums.get(key)! / groupCounts.get(key)!);
  });

  const compactX = new Float64Array(repXVals);
  const compactY = new Float64Array(repYVals);
  const orderLen = compactX.length;
  const order = new Uint32Array(orderLen);
  for (let i = 0; i < orderLen; i++) order[i] = i;
  order.sort((a, b) => compactX[a] - compactX[b]);
  const sortedX = new Float64Array(orderLen);
  const sortedY = new Float64Array(orderLen);
  for (let i = 0; i < orderLen; i++) {
    sortedX[i] = compactX[order[i]];
    sortedY[i] = compactY[order[i]];
  }

  const processedX = processRawColumn(sortedX);
  const processedY = processRawColumn(sortedY);
  return {
    type: "success",
    newColumn: {
      isFloat64: false,
      refPoint: processedY.refPoint,
      bounds: processedY.bounds,
      data: processedY.data,
    },
    sparseXColumn: {
      isFloat64: false,
      refPoint: processedX.refPoint,
      bounds: processedX.bounds,
      data: processedX.data,
    },
    datasetId,
    name,
  };
}

function applyRollingAverageAlignment(
  avgAlignMatch: RegExpMatchArray,
  resultData: Float64Array,
  rowCount: number,
  columnData: { data: Float32Array; refPoint: number }[],
) {
  const num = parseInt(avgAlignMatch[1], 10);
  const unit = avgAlignMatch[2]?.toLowerCase();
  const align = (avgAlignMatch[3]?.toLowerCase() ?? "c") as "l" | "c" | "r";

  let shift = 0;
  if (unit) {
    if (align !== "l") {
      let windowSec = num;
      if (unit === "m") windowSec = num * 60;
      else if (unit === "h") windowSec = num * 3600;
      else if (unit === "d") windowSec = num * 86400;

      const timeLocalIdx = 0;
      const timeColData = columnData[timeLocalIdx];
      if (timeColData && rowCount > 1) {
        const sampleSize = Math.min(rowCount - 1, 200);
        const step = Math.floor((rowCount - 1) / sampleSize);
        let totalInterval = 0;
        let count = 0;
        for (let i = 0; i < rowCount - 1; i += step) {
          const t0 = timeColData.data[i] + timeColData.refPoint;
          const t1 = timeColData.data[i + 1] + timeColData.refPoint;
          const dtMs = Math.abs(
            (t1 > 1e11 ? t1 : t1 * 1000) - (t0 > 1e11 ? t0 : t0 * 1000),
          );
          if (dtMs > 0) {
            totalInterval += dtMs;
            count++;
          }
        }
        if (count > 0) {
          const medianIntervalSec = totalInterval / count / 1000;
          const halfRows = Math.round(windowSec / 2 / medianIntervalSec);
          shift = align === "c" ? halfRows : windowSec / medianIntervalSec - 1;
          if (align === "r")
            shift = Math.round(windowSec / medianIntervalSec) - 1;
        }
      }
    }
  } else {
    if (align === "c") shift = Math.floor(num / 2);
    else if (align === "r") shift = num - 1;
  }

  if (shift > 0 && shift < rowCount) {
    const out = new Float64Array(rowCount);
    for (let i = 0; i < rowCount - shift; i++) out[i] = resultData[i + shift];
    for (let i = rowCount - shift; i < rowCount; i++)
      out[i] = resultData[rowCount - 1];
    resultData.set(out);
  }
}

export function evaluateFormulaSync(
  params: FormulaWorkerParams,
): FormulaEvaluationResult {
  const { datasetId, name, formula, columns, rowCount, columnData } = params;

  try {
    // Try regression formulas first (they need full-column access)
    const regressionResult = tryRegressionFormula(
      formula,
      columns,
      rowCount,
      columnData,
    );
    if (regressionResult) {
      const processed = processRawColumn(regressionResult);
      return {
        type: "success",
        newColumn: {
          isFloat64: false,
          refPoint: processed.refPoint,
          bounds: processed.bounds,
          data: processed.data,
        },
        datasetId,
        name,
      };
    }

    // Two-pass for group-average functions (avgday/avghour/avgminute/avgsecond)
    const groupAvgMatch = formula
      .trim()
      .match(/^avg(day|hour|minute|second)([lcr])?\(\[(.+)\]\)$/i);
    if (groupAvgMatch) {
      return evaluateGroupAverage(
        groupAvgMatch,
        formula,
        columns,
        rowCount,
        columnData,
        datasetId,
        name,
      );
    }

    const { evaluate, usedColumnIndices, error, createContext } =
      compileFormula(formula, columns);
    if (error) {
      return { type: "error", error };
    }

    const resultData = new Float64Array(rowCount);
    const rowValues = new Array(usedColumnIndices.length);
    const ctx = createContext ? createContext() : undefined;

    for (let i = 0; i < rowCount; i++) {
      for (let j = 0; j < usedColumnIndices.length; j++) {
        rowValues[j] = columnData[j].data[i] + columnData[j].refPoint;
      }
      resultData[i] = evaluate(rowValues, ctx);
    }

    const avgAlignMatch = formula.match(/avg(\d+)(s|m|h|d)?([lcr])?\s*\(/i);
    if (avgAlignMatch) {
      applyRollingAverageAlignment(
        avgAlignMatch,
        resultData,
        rowCount,
        columnData,
      );
    }

    const processed = processRawColumn(resultData);

    return {
      type: "success",
      newColumn: {
        isFloat64: false,
        refPoint: processed.refPoint,
        bounds: processed.bounds,
        data: processed.data,
      },
      datasetId,
      name,
    };
  } catch (err) {
    return {
      type: "error",
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
