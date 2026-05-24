/**
 * Formula engine for calculated columns.
 *
 * Pipeline: text → tokens (lexer) → RPN (shunting-yard) → row-wise interpreter
 * over a pre-allocated Float64Array stack. No eval/new Function — column
 * references and function names are validated against the dataset and a
 * single source of truth (formulaFunctions.ts).
 *
 * Top-level regression and group-average formulas take a separate path in
 * evaluateFormulaSync that needs full-column access.
 */

import { processRawColumn } from "./data-processing";
import {
	FUNCTION_BY_NAME,
	KNOWN_FUNCTION_NAMES,
	resolveLegacyName,
} from "./formulaFunctions";
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
	sumsSq: Record<number, number>;
	timeQueues: Record<number, { t: number; v: number }[]>;
	timeSums: Record<number, number>;
	groupSums: Record<number, number>;
	groupCounts: Record<number, number>;
	groupLastKey: Record<number, string | number>;
	lagBuffers: Record<number, number[]>;
	prevVals: Record<number, number>;
	hasPrev: Record<number, boolean>;
	cumState: Record<number, number>;
	cumHas: Record<number, boolean>;
	filterState: Record<
		number,
		{ estimate: number; errorCov: number; measurementNoise: number }
	>;
}

interface FormulaResult {
	evaluate: (rowValues: number[], ctx?: FormulaContext) => number;
	usedColumnIndices: number[];
	error?: string;
	errorPos?: number;
	createContext?: () => FormulaContext;
	expression?: string;
}

type Token =
	| { type: "NUMBER"; value: number; pos: number }
	| { type: "VAR"; index: number; pos: number }
	| {
			type: "OP";
			value: string;
			prec: number;
			assoc: "L" | "R";
			unary?: boolean;
			pos: number;
	  }
	| {
			type: "FUNC";
			value: string;
			id: number;
			args?: number;
			constN?: number;
			pos: number;
	  }
	| { type: "CONST"; value: number; pos: number }
	| { type: "LPAREN"; pos: number }
	| { type: "RPAREN"; pos: number }
	| { type: "COMMA"; pos: number };

const columnMapCache = new WeakMap<string[], Map<string, number>>();

class FormulaError extends Error {
	pos: number;
	constructor(message: string, pos: number) {
		super(message);
		this.pos = pos;
	}
}

// ── Math primitives ────────────────────────────────────────────────────────

const MATH_UNARY: Record<string, (a: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	sqrt: Math.sqrt,
	abs: Math.abs,
	exp: Math.exp,
	log: Math.log10,
	log2: Math.log2,
	ln: Math.log,
	round: Math.round,
	floor: Math.floor,
	ceil: Math.ceil,
	trunc: Math.trunc,
	sign: Math.sign,
	isnan: (a) => (Number.isNaN(a) ? 1 : 0),
};

function mathModulo(a: number, b: number): number {
	if (b === 0) return NaN;
	return a - b * Math.floor(a / b);
}

function isTruthy(x: number): boolean {
	return !Number.isNaN(x) && x !== 0;
}

function sampleVariance(values: number[]): number {
	const n = values.length;
	if (n < 2) return 0;
	let mean = 0;
	for (let i = 0; i < n; i++) mean += values[i];
	mean /= n;
	let acc = 0;
	for (let i = 0; i < n; i++) {
		const d = values[i] - mean;
		acc += d * d;
	}
	return acc / (n - 1);
}

function median(values: number[]): number {
	if (values.length === 0) return NaN;
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}

// ── Date-key helper (one source of truth) ──────────────────────────────────

/** Coerce a raw timestamp value into milliseconds since epoch. */
function toMillis(t: number): number {
	if (t > 1e14) return t / 1000; // microseconds
	if (t > 1e11) return t; // milliseconds
	return t * 1000; // seconds
}

type Granularity = "day" | "hour" | "minute" | "second";

function dateKey(d: Date, granularity: Granularity): string {
	const y = d.getFullYear();
	const mo = d.getMonth();
	const da = d.getDate();
	if (granularity === "day") return `${y}-${mo}-${da}`;
	const hr = d.getHours();
	if (granularity === "hour") return `${y}-${mo}-${da}-${hr}`;
	const mi = d.getMinutes();
	if (granularity === "minute") return `${y}-${mo}-${da}-${hr}-${mi}`;
	return `${y}-${mo}-${da}-${hr}-${mi}-${d.getSeconds()}`;
}

const _scratchDate = new Date();
function granularityOf(funcName: string): Granularity {
	if (funcName.endsWith("day")) return "day";
	if (funcName.endsWith("hour")) return "hour";
	if (funcName.endsWith("minute")) return "minute";
	return "second";
}

// ── Function dispatch ──────────────────────────────────────────────────────

function evaluateBucketFunc(
	token: Extract<Token, { type: "FUNC" }>,
	a: number,
	rowValues: number[],
	timeVarIdx: number,
	ctx?: FormulaContext,
): number {
	if (!ctx) return a;
	const t = rowValues[timeVarIdx];
	_scratchDate.setTime(toMillis(t));
	const key = dateKey(_scratchDate, granularityOf(token.value));
	if (token.value.startsWith("avg"))
		return statefulAvgGroup(ctx, token.id, a, key);
	return statefulSumGroup(ctx, token.id, a, key);
}

function evaluateRolling(
	token: Extract<Token, { type: "FUNC" }>,
	args: number[],
	rowValues: number[],
	timeVarIdx: number,
	ctx?: FormulaContext,
): number {
	if (!ctx) return args[0];
	const name = token.value;
	const id = token.id;
	const val = args[0];
	const n = token.constN ?? args[1] ?? 1;

	switch (name) {
		case "rolling":
		case "rollingc":
		case "rollingr":
			return statefulAvgN(ctx, id, val, Math.max(1, Math.round(n)));
		case "rollingmed":
			return statefulRollingMed(ctx, id, val, Math.max(1, Math.round(n)));
		case "rollingstd":
			return statefulRollingStd(ctx, id, val, Math.max(1, Math.round(n)));
		case "rollingmin":
			return statefulRollingMin(ctx, id, val, Math.max(1, Math.round(n)));
		case "rollingmax":
			return statefulRollingMax(ctx, id, val, Math.max(1, Math.round(n)));
		case "rollingtime":
		case "rollingtimec":
		case "rollingtimer":
			return statefulAvgTime(ctx, id, val, rowValues[timeVarIdx], n);
	}
	return val;
}

function evaluateRowRelative(
	token: Extract<Token, { type: "FUNC" }>,
	args: number[],
	ctx?: FormulaContext,
): number {
	if (!ctx) return args[0];
	const id = token.id;
	const val = args[0];
	switch (token.value) {
		case "lag":
			return statefulLag(
				ctx,
				id,
				val,
				Math.max(1, Math.round(token.constN ?? args[1] ?? 1)),
			);
		case "diff":
			return statefulDiff(ctx, id, val);
		case "cumsum":
			return statefulCumsum(ctx, id, val);
		case "cumprod":
			return statefulCumprod(ctx, id, val);
		case "cummax":
			return statefulCummax(ctx, id, val);
		case "cummin":
			return statefulCummin(ctx, id, val);
	}
	return val;
}

function evaluateAggregate(
	name: string,
	args: number[],
	rowValues: number[],
	finalDataColumnIndices: number[],
): number {
	let values: number[];
	if (args.length === 0) {
		values = new Array(finalDataColumnIndices.length);
		for (let j = 0; j < finalDataColumnIndices.length; j++) {
			values[j] = rowValues[finalDataColumnIndices[j]];
		}
	} else {
		values = args;
	}

	switch (name) {
		case "min":
			return values.length ? Math.min.apply(null, values) : NaN;
		case "max":
			return values.length ? Math.max.apply(null, values) : NaN;
		case "sum": {
			let s = 0;
			for (let i = 0; i < values.length; i++) s += values[i];
			return s;
		}
		case "avg": {
			if (!values.length) return 0;
			let s = 0;
			for (let i = 0; i < values.length; i++) s += values[i];
			return s / values.length;
		}
		case "median":
			return median(values);
		case "var":
			return sampleVariance(values);
		case "std":
			return Math.sqrt(sampleVariance(values));
	}
	return NaN;
}

function evaluateFuncToken(
	token: Extract<Token, { type: "FUNC" }>,
	args: number[],
	rowValues: number[],
	finalDataColumnIndices: number[],
	timeVarIdx: number,
	ctx?: FormulaContext,
): number {
	const name = token.value;
	const a = args[0];

	const unary = MATH_UNARY[name];
	if (unary) return unary(a);

	switch (name) {
		case "logn":
			return Math.log(args[1]) / Math.log(args[0]);
		case "pow":
			return args[0] ** args[1];
		case "mod":
			return mathModulo(args[0], args[1]);
		case "atan2":
			return Math.atan2(args[0], args[1]);
		case "hypot":
			return Math.hypot.apply(null, args);
		case "clamp":
			return Math.min(args[2], Math.max(args[1], args[0]));
		case "min":
		case "max":
		case "sum":
		case "avg":
		case "median":
		case "std":
		case "var":
			return evaluateAggregate(name, args, rowValues, finalDataColumnIndices);
		case "if":
			return isTruthy(args[0]) ? args[1] : args[2];
		case "coalesce":
			for (let i = 0; i < args.length; i++) {
				if (!Number.isNaN(args[i])) return args[i];
			}
			return NaN;
		case "filter":
			return ctx ? statefulFilter(ctx, token.id, a, args[1]) : a;
	}

	if (
		name === "avgday" ||
		name === "avghour" ||
		name === "avgminute" ||
		name === "avgsecond" ||
		name === "sumday" ||
		name === "sumhour" ||
		name === "summinute" ||
		name === "sumsecond"
	) {
		return evaluateBucketFunc(token, a, rowValues, timeVarIdx, ctx);
	}

	if (name.startsWith("rolling")) {
		return evaluateRolling(token, args, rowValues, timeVarIdx, ctx);
	}

	if (
		name === "lag" ||
		name === "diff" ||
		name === "cumsum" ||
		name === "cumprod" ||
		name === "cummax" ||
		name === "cummin"
	) {
		return evaluateRowRelative(token, args, ctx);
	}

	return a;
}

// ── Stateful primitives (one slot per FUNC id) ─────────────────────────────

function statefulAvgN(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	if (!ctx.queues[id]) {
		ctx.queues[id] = [];
		ctx.sums[id] = 0;
	}
	const q = ctx.queues[id];
	q.push(val);
	ctx.sums[id] += val;
	while (q.length > n) ctx.sums[id] -= q.shift()!;
	return ctx.sums[id] / q.length;
}

function statefulAvgTime(
	ctx: FormulaContext,
	id: number,
	val: number,
	t: number,
	windowSec: number,
): number {
	if (!ctx.timeQueues[id]) {
		ctx.timeQueues[id] = [];
		ctx.timeSums[id] = 0;
	}
	const q = ctx.timeQueues[id];
	const tMs = toMillis(t);
	q.push({ t: tMs, v: val });
	ctx.timeSums[id] += val;
	const cutoff = tMs - windowSec * 1000;
	while (q.length > 0 && q[0].t <= cutoff) {
		ctx.timeSums[id] -= q.shift()?.v ?? 0;
	}
	return q.length > 0 ? ctx.timeSums[id] / q.length : 0;
}

function statefulAvgGroup(
	ctx: FormulaContext,
	id: number,
	val: number,
	key: string | number,
): number {
	if (ctx.groupLastKey[id] === key) {
		ctx.groupSums[id] += val;
		ctx.groupCounts[id] += 1;
		return ctx.groupSums[id] / ctx.groupCounts[id];
	}

	ctx.groupSums[id] = val;
	ctx.groupCounts[id] = 1;
	ctx.groupLastKey[id] = key;
	return val;
}

function statefulSumGroup(
	ctx: FormulaContext,
	id: number,
	val: number,
	key: string | number,
): number {
	if (ctx.groupLastKey[id] === key) {
		ctx.groupSums[id] += val;
		return ctx.groupSums[id];
	}

	ctx.groupSums[id] = val;
	ctx.groupLastKey[id] = key;
	return val;
}

function pushBoundedQueue(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number[] {
	const q = (ctx.queues[id] ??= []);
	q.push(val);
	while (q.length > n) q.shift();
	return q;
}

function statefulRollingMed(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	return median(pushBoundedQueue(ctx, id, val, n));
}

function statefulRollingStd(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	if (!ctx.queues[id]) {
		ctx.queues[id] = [];
		ctx.sums[id] = 0;
		ctx.sumsSq[id] = 0;
	}
	const q = ctx.queues[id];
	q.push(val);
	ctx.sums[id] += val;
	ctx.sumsSq[id] += val * val;
	while (q.length > n) {
		const old = q.shift()!;
		ctx.sums[id] -= old;
		ctx.sumsSq[id] -= old * old;
	}
	const k = q.length;
	if (k < 2) return 0;
	const mean = ctx.sums[id] / k;
	const variance = (ctx.sumsSq[id] - k * mean * mean) / (k - 1);
	return Math.sqrt(Math.max(0, variance));
}

function statefulRollingMin(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	const q = pushBoundedQueue(ctx, id, val, n);
	let m = Infinity;
	for (let i = 0; i < q.length; i++) if (q[i] < m) m = q[i];
	return m;
}

function statefulRollingMax(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	const q = pushBoundedQueue(ctx, id, val, n);
	let m = -Infinity;
	for (let i = 0; i < q.length; i++) if (q[i] > m) m = q[i];
	return m;
}

function statefulLag(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	if (!ctx.lagBuffers[id]) ctx.lagBuffers[id] = [];
	const buf = ctx.lagBuffers[id];
	buf.push(val);
	if (buf.length > n + 1) buf.shift();
	if (buf.length <= n) return NaN;
	return buf[0];
}

function statefulDiff(ctx: FormulaContext, id: number, val: number): number {
	if (!ctx.hasPrev[id]) {
		ctx.hasPrev[id] = true;
		ctx.prevVals[id] = val;
		return NaN;
	}
	const prev = ctx.prevVals[id];
	ctx.prevVals[id] = val;
	return val - prev;
}

function cumReduce(
	ctx: FormulaContext,
	id: number,
	val: number,
	identity: number,
	op: (acc: number, v: number) => number,
): number {
	if (!ctx.cumHas[id]) {
		ctx.cumState[id] = identity;
		ctx.cumHas[id] = true;
	}
	ctx.cumState[id] = op(ctx.cumState[id], val);
	return ctx.cumState[id];
}

const statefulCumsum = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, 0, (a, v) => a + v);
const statefulCumprod = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, 1, (a, v) => a * v);
const statefulCummax = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, -Infinity, Math.max);
const statefulCummin = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, Infinity, Math.min);

function statefulFilter(
	ctx: FormulaContext,
	id: number,
	val: number,
	processNoiseArg?: number,
): number {
	const processNoise =
		processNoiseArg !== undefined && Number.isFinite(processNoiseArg)
			? processNoiseArg
			: 1e-3;
	if (!ctx.filterState[id]) {
		ctx.filterState[id] = {
			estimate: val,
			errorCov: 1,
			measurementNoise: 0.1,
		};
		return val;
	}
	const state = ctx.filterState[id];
	const priorEstimate = state.estimate;
	const priorErrorCov = state.errorCov + processNoise;

	const residual = val - priorEstimate;
	state.measurementNoise =
		0.95 * state.measurementNoise + 0.05 * (residual * residual);
	const boundedMeasurementNoise = Math.max(
		1e-4,
		Math.min(100, state.measurementNoise),
	);

	const kalmanGain = priorErrorCov / (priorErrorCov + boundedMeasurementNoise);
	state.estimate = priorEstimate + kalmanGain * residual;
	state.errorCov = (1 - kalmanGain) * priorErrorCov;

	return state.estimate;
}

// ── Precedence ─────────────────────────────────────────────────────────────

const OP_PRECEDENCE: Record<string, { prec: number; assoc: "L" | "R" }> = {
	"||": { prec: 1, assoc: "L" },
	"&&": { prec: 2, assoc: "L" },
	"==": { prec: 3, assoc: "L" },
	"!=": { prec: 3, assoc: "L" },
	"<": { prec: 4, assoc: "L" },
	">": { prec: 4, assoc: "L" },
	"<=": { prec: 4, assoc: "L" },
	">=": { prec: 4, assoc: "L" },
	"+": { prec: 5, assoc: "L" },
	"-": { prec: 5, assoc: "L" },
	"*": { prec: 6, assoc: "L" },
	"/": { prec: 6, assoc: "L" },
	"%": { prec: 6, assoc: "L" },
	"^": { prec: 7, assoc: "R" },
};

const UNARY_PREC = 8;

// ── Compile ────────────────────────────────────────────────────────────────

function resolveBracketedReferences(
	formula: string,
	map1: Map<string, number>,
	columnMap: Map<string, number>,
	usedColumnIndices: number[],
): FormulaResult | null {
	let maxKeyLen = 0;
	for (const key of map1.keys()) {
		if (key.length > maxKeyLen) maxKeyLen = key.length;
	}
	let scanPos = 0;
	while (scanPos < formula.length) {
		const start = formula.indexOf("[", scanPos);
		if (start === -1) break;
		let bestEnd = -1;
		let end = start;
		while ((end = formula.indexOf("]", end + 1)) !== -1) {
			if (end - start - 1 > maxKeyLen) break;
			const candidate = formula.substring(start + 1, end);
			if (map1.has(candidate)) bestEnd = end;
		}
		if (bestEnd === -1) {
			end = formula.indexOf("]", start + 1);
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
					errorPos: start,
				};
			}
			scanPos = end + 1;
		} else {
			const fullMatch = formula.substring(start, bestEnd + 1);
			if (!columnMap.has(fullMatch)) {
				const colName = formula.substring(start + 1, bestEnd);
				const colIndex = map1.get(colName)!;
				columnMap.set(fullMatch, usedColumnIndices.length);
				usedColumnIndices.push(colIndex);
			}
			scanPos = bestEnd + 1;
		}
	}
	return null;
}

function tokenizeFormula(
	formula: string,
	columnMap: Map<string, number>,
	ensureTimeColumn: () => void,
	nextFuncId: () => number,
): Token[] {
	let maxKeyLen = 0;
	for (const key of columnMap.keys()) {
		if (key.length > maxKeyLen) maxKeyLen = key.length;
	}
	const tokens: Token[] = [];
	let i = 0;
	while (i < formula.length) {
		const char = formula[i];
		const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;
		const startPos = i;

		if (/\s/.test(char)) {
			i++;
			continue;
		}

		// Column reference [Foo]
		if (char === "[") {
			let bestEnd = -1;
			let end = i;
			while ((end = formula.indexOf("]", end + 1)) !== -1) {
				if (end - i + 1 > maxKeyLen) break;
				if (columnMap.has(formula.substring(i, end + 1))) bestEnd = end;
			}
			if (bestEnd === -1) {
				end = formula.indexOf("]", i + 1);
				if (end === -1) throw new FormulaError("Missing closing bracket ]", i);
				throw new FormulaError(
					`Unknown column: ${formula.substring(i + 1, end)}`,
					i,
				);
			}
			const fullMatch = formula.substring(i, bestEnd + 1);
			tokens.push({
				type: "VAR",
				index: columnMap.get(fullMatch)!,
				pos: startPos,
			});
			i = bestEnd + 1;
			continue;
		}

		// Numeric literal with optional scientific notation
		if (/[0-9.]/.test(char)) {
			const start = i;
			let sawDot = char === ".";
			i++;
			while (i < formula.length) {
				const c = formula[i];
				if (c >= "0" && c <= "9") {
					i++;
				} else if (c === "." && !sawDot) {
					sawDot = true;
					i++;
				} else {
					break;
				}
			}
			// Scientific notation: e[+-]?digits  — only if preceded by digits
			if (
				i < formula.length &&
				(formula[i] === "e" || formula[i] === "E") &&
				/[0-9.]/.test(formula[start])
			) {
				const eStart = i;
				let j = i + 1;
				if (j < formula.length && (formula[j] === "+" || formula[j] === "-")) {
					j++;
				}
				let digits = 0;
				while (j < formula.length && formula[j] >= "0" && formula[j] <= "9") {
					j++;
					digits++;
				}
				if (digits > 0) i = j;
				else i = eStart; // bare 'e' is a constant
			}
			const numStr = formula.substring(start, i);
			const value = parseFloat(numStr);
			if (Number.isNaN(value)) {
				throw new FormulaError(`Invalid number: ${numStr}`, start);
			}
			tokens.push({ type: "NUMBER", value, pos: startPos });
			continue;
		}

		// Identifier (function, constant, alias)
		if (/[a-zA-Z_]/.test(char)) {
			let name = "";
			while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
				name += formula[i++];
			}
			const lower = name.toLowerCase();

			if (lower === "pi") {
				tokens.push({ type: "CONST", value: Math.PI, pos: startPos });
				continue;
			}
			if (lower === "e") {
				tokens.push({ type: "CONST", value: Math.E, pos: startPos });
				continue;
			}

			// Legacy alias resolution (avg5, avgday, avg1hc, …)
			const alias = resolveLegacyName(lower);
			if (alias) {
				const canonical = alias.canonical;
				const meta = FUNCTION_BY_NAME.get(canonical);
				if (meta?.needsTime) ensureTimeColumn();
				tokens.push({
					type: "FUNC",
					value: canonical,
					id: nextFuncId(),
					constN: alias.constArg,
					pos: startPos,
				});
				continue;
			}

			if (KNOWN_FUNCTION_NAMES.has(lower)) {
				const meta = FUNCTION_BY_NAME.get(lower)!;
				if (meta.needsTime) ensureTimeColumn();
				tokens.push({
					type: "FUNC",
					value: lower,
					id: nextFuncId(),
					pos: startPos,
				});
				continue;
			}

			throw new FormulaError(`Unknown function or constant: ${name}`, startPos);
		}

		// Multi-char and single-char operators
		const two = formula.substring(i, i + 2);
		if (
			two === "==" ||
			two === "!=" ||
			two === "<=" ||
			two === ">=" ||
			two === "&&" ||
			two === "||"
		) {
			tokens.push({
				type: "OP",
				value: two,
				prec: OP_PRECEDENCE[two].prec,
				assoc: OP_PRECEDENCE[two].assoc,
				pos: startPos,
			});
			i += 2;
			continue;
		}

		if (char === "(") {
			tokens.push({ type: "LPAREN", pos: startPos });
			i++;
			continue;
		}
		if (char === ")") {
			tokens.push({ type: "RPAREN", pos: startPos });
			i++;
			continue;
		}
		if (char === ",") {
			tokens.push({ type: "COMMA", pos: startPos });
			i++;
			continue;
		}

		if (OP_PRECEDENCE[char]) {
			// Unary minus and unary not
			const isPrefixContext =
				!prevToken ||
				prevToken.type === "OP" ||
				prevToken.type === "LPAREN" ||
				prevToken.type === "FUNC" ||
				prevToken.type === "COMMA";
			if (char === "-" && isPrefixContext) {
				tokens.push({
					type: "OP",
					value: "u-",
					prec: UNARY_PREC,
					assoc: "R",
					unary: true,
					pos: startPos,
				});
			} else {
				const meta = OP_PRECEDENCE[char];
				tokens.push({
					type: "OP",
					value: char,
					prec: meta.prec,
					assoc: meta.assoc,
					pos: startPos,
				});
			}
			i++;
			continue;
		}

		if (char === "!") {
			tokens.push({
				type: "OP",
				value: "!",
				prec: UNARY_PREC,
				assoc: "R",
				unary: true,
				pos: startPos,
			});
			i++;
			continue;
		}

		throw new FormulaError(`Unexpected character: ${char}`, startPos);
	}
	return tokens;
}

function shuntingYard(tokens: Token[]): {
	outputQueue: Token[];
	setUsesAllColumns: boolean;
} {
	const outputQueue: Token[] = [];
	const operatorStack: Token[] = [];
	const argCountStack: number[] = [];
	let usesAllColumns = false;

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
				throw new FormulaError("Unexpected comma", token.pos);
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
				throw new FormulaError("Mismatched parentheses", token.pos);
			operatorStack.pop();

			if (
				operatorStack.length > 0 &&
				operatorStack[operatorStack.length - 1].type === "FUNC"
			) {
				const func = operatorStack.pop()! as Extract<Token, { type: "FUNC" }>;
				let args = argCountStack.pop()!;
				const prevWasLparen = tokens[j - 1] && tokens[j - 1].type === "LPAREN";
				if (!prevWasLparen) args++;

				// If the function expects a constant N at constArgIndex and the
				// user wrote it inline (e.g. rolling([col], 5)), lift that NUMBER
				// off the output queue into the FUNC token.
				const meta = FUNCTION_BY_NAME.get(func.value);
				if (
					meta?.constArgIndex !== undefined &&
					func.constN === undefined &&
					args === meta.constArgIndex + 1
				) {
					const lastOut = outputQueue[outputQueue.length - 1];
					if (lastOut?.type !== "NUMBER") {
						throw new FormulaError(
							`${meta.signature}: argument #${meta.constArgIndex + 1} must be a constant number`,
							func.pos,
						);
					}
					func.constN = lastOut.value;
					outputQueue.pop();
					args--;
				}

				// Arity validation
				if (meta) {
					const provided = args + (func.constN !== undefined ? 1 : 0);
					const min = meta.minArgs;
					const max = meta.maxArgs;
					if (provided < min || (max !== -1 && provided > max)) {
						throw new FormulaError(
							`${meta.signature}: expected ${
								max === -1
									? `at least ${min}`
									: min === max
										? `${min}`
										: `${min}–${max}`
							} argument(s), got ${provided}`,
							func.pos,
						);
					}
				}

				func.args = args;
				outputQueue.push(func);

				if (
					args === 0 &&
					(func.value === "avg" ||
						func.value === "sum" ||
						func.value === "min" ||
						func.value === "max" ||
						func.value === "median" ||
						func.value === "std" ||
						func.value === "var")
				) {
					usesAllColumns = true;
				}
			}
		}
	}
	while (operatorStack.length > 0) {
		const top = operatorStack.pop()!;
		if (top.type === "LPAREN")
			throw new FormulaError("Mismatched parentheses", top.pos);
		outputQueue.push(top);
	}
	return { outputQueue, setUsesAllColumns: usesAllColumns };
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

		// 1. Resolve bracketed column references (longest-match).
		const err = resolveBracketedReferences(
			formula,
			ensureAvailableColumnsMap(),
			columnMap,
			usedColumnIndices,
		);
		if (err) return err;

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
			const existingIndices = new Int32Array(availableColumns.length).fill(-1);
			for (let idx = 0; idx < usedColumnIndices.length; idx++) {
				existingIndices[usedColumnIndices[idx]] = idx;
			}
			for (let i = 0; i < availableColumns.length; i++) {
				const lower = availableColumns[i].toLowerCase();
				if (lower.includes("time") || lower.includes("date")) continue;

				let varIdx = existingIndices[i];
				if (varIdx === -1) {
					varIdx = usedColumnIndices.length;
					existingIndices[i] = varIdx;
					usedColumnIndices.push(i);
				}
				dataColumnIndices.push(varIdx);
			}
			return dataColumnIndices;
		};

		// 2 & 3. Tokenize and convert to RPN via shunting-yard.
		const tokens = tokenizeFormula(
			formula,
			columnMap,
			ensureTimeColumn,
			() => funcIdCounter++,
		);

		const { outputQueue, setUsesAllColumns } = shuntingYard(tokens);
		if (setUsesAllColumns) usesAllColumns = true;

		const finalDataColumnIndices = usesAllColumns
			? [...ensureAllDataColumns()]
			: [];

		// 4. Build evaluator.
		const createContext = (): FormulaContext => ({
			queues: {},
			sums: {},
			sumsSq: {},
			timeQueues: {},
			timeSums: {},
			groupSums: {},
			groupCounts: {},
			groupLastKey: {},
			lagBuffers: {},
			prevVals: {},
			hasPrev: {},
			cumState: {},
			cumHas: {},
			filterState: {},
		});

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
						const argCount = token.args ?? 1;
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
							if (op === "u-") stack[sp++] = -a;
							else if (op === "!") stack[sp++] = isTruthy(a) ? 0 : 1;
							else stack[sp++] = a;
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
								case "%":
									r = mathModulo(a, b);
									break;
								case "^":
									r = a ** b;
									break;
								case "==":
									r = a === b ? 1 : 0;
									break;
								case "!=":
									r = a !== b ? 1 : 0;
									break;
								case "<":
									r = a < b ? 1 : 0;
									break;
								case ">":
									r = a > b ? 1 : 0;
									break;
								case "<=":
									r = a <= b ? 1 : 0;
									break;
								case ">=":
									r = a >= b ? 1 : 0;
									break;
								case "&&":
									r = isTruthy(a) ? b : a;
									break;
								case "||":
									r = isTruthy(a) ? a : b;
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
		if (err instanceof FormulaError) {
			return {
				evaluate: () => NaN,
				usedColumnIndices: [],
				error: err.message,
				errorPos: err.pos,
				createContext: () => ({}) as FormulaContext,
			};
		}
		return {
			evaluate: () => NaN,
			usedColumnIndices: [],
			error: err instanceof Error ? err.message : String(err),
			createContext: () => ({}) as FormulaContext,
		};
	}
}

// ── Whole-column passes (regression + group-aggregate) ─────────────────────

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
		// Callers (useGraphStore.addCalculatedColumn) pass columnData as [x, y]
		// in fixed order. We only need to validate the column name exists in
		// the dataset; the positional contract supplies the data.
		const colExists = columns.some(
			(c) => c === colName || c.endsWith(`: ${colName}`),
		);
		if (!colExists) return null;

		const xArr = new Float64Array(rowCount);
		const yArr = new Float64Array(rowCount);
		const xRef = columnData[0]?.refPoint || 0;
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
	/** Request id, assigned by the worker client to correlate responses. */
	id?: number;
	datasetId: string;
	name: string;
	formula: string;
	columns: string[];
	rowCount: number;
	columnData: { data: Float32Array; refPoint: number }[];
}

export interface FormulaEvaluationResult {
	/** Echoes the originating request id so concurrent calls can be matched. */
	id?: number;
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
	const granularity = groupAvgMatch[1].toLowerCase() as Granularity;
	const align = (groupAvgMatch[2]?.toLowerCase() ?? "c") as "l" | "c" | "r";
	const colName = groupAvgMatch[3];

	const compiled = compileFormula(formula, columns);
	if (compiled.error) {
		return { type: "error", error: compiled.error };
	}

	const timeColIdx = columns.findIndex(
		(c) => c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
	);
	// Mirror compileFormula's ensureTimeColumn fallback: column 0 stands in
	// when no explicit time/date column exists.
	const timeGlobalIdx = timeColIdx === -1 ? 0 : timeColIdx;
	const valueGlobalIdx = (() => {
		let idx = columns.indexOf(colName);
		if (idx === -1)
			idx = columns.findIndex(
				(c) => c.endsWith(`: ${colName}`) || c === colName,
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

	// Cached key reuse — incrementing through rows usually hits the same bucket.
	const cacheDate = new Date();
	let lastMs = NaN;
	let lastKey = "";
	const getKey = (t: number): string => {
		const ms = toMillis(t);
		if (ms === lastMs) return lastKey;
		lastMs = ms;
		cacheDate.setTime(ms);
		lastKey = dateKey(cacheDate, granularity);
		return lastKey;
	};

	const groupSums = new Map<string, number>();
	const groupCounts = new Map<string, number>();
	const groupFirst = new Map<string, number>();
	const groupLast = new Map<string, number>();
	for (let i = 0; i < rowCount; i++) {
		const t = timeCol.data[i] + timeCol.refPoint;
		const v = valCol.data[i] + valCol.refPoint;
		const key = getKey(t);
		groupSums.set(key, (groupSums.get(key) ?? 0) + v);
		groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
		if (!groupFirst.has(key)) groupFirst.set(key, i);
		groupLast.set(key, i);
	}

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

/**
 * Matches the top-level rolling call that should drive alignment.
 * Handles legacy avgN/avgNs… and new rolling/rollingC/rollingR/rollingTime[CR].
 *
 * Capture groups: 1=N (rows or seconds, may be absent for new form), 2=unit
 *   (s|m|h|d, may be absent), 3=alignment (c|l|r, may be absent),
 *   4=N when the new-form 2nd arg is a literal.
 */
const ROLLING_TOP_LEVEL =
	/^(?:avg(\d+)(s|m|h|d)?([lcr])?|rolling(time)?([cr])?)\s*\(/i;

function applyRollingAverageAlignment(
	formula: string,
	resultData: Float64Array,
	rowCount: number,
	columnData: { data: Float32Array; refPoint: number }[],
) {
	const trimmed = formula.trim();
	const m = trimmed.match(ROLLING_TOP_LEVEL);
	if (!m) return;

	let num: number;
	let unit: string | undefined;
	let align: "l" | "c" | "r";

	if (m[1]) {
		// legacy avgN[s|m|h|d][c|l|r]
		num = parseInt(m[1], 10);
		unit = m[2]?.toLowerCase();
		align = (m[3]?.toLowerCase() as "l" | "c" | "r") ?? "c";
	} else {
		// new rolling(...)/rollingTime(...) — need to find the N literal inside
		const isTime = !!m[4];
		const alignChar = m[5]?.toLowerCase();
		align = (alignChar as "l" | "c" | "r") ?? "l";
		unit = isTime ? "s" : undefined;
		// Extract the second top-level argument as the constant N.
		const open = trimmed.indexOf("(");
		let depth = 0;
		let argStart = open + 1;
		let secondArg = "";
		for (let i = open; i < trimmed.length; i++) {
			const c = trimmed[i];
			if (c === "(") depth++;
			else if (c === ")") {
				depth--;
				if (depth === 0) {
					secondArg = trimmed.substring(argStart, i).trim();
					break;
				}
			} else if (c === "," && depth === 1) {
				argStart = i + 1;
			}
		}
		const n = parseFloat(secondArg);
		if (!Number.isFinite(n)) return;
		num = n;
	}

	let shift = 0;
	if (unit) {
		if (align !== "l") {
			let windowSec = num;
			if (unit === "m") windowSec = num * 60;
			else if (unit === "h") windowSec = num * 3600;
			else if (unit === "d") windowSec = num * 86400;

			const timeColData = columnData[0];
			if (timeColData && rowCount > 1) {
				const sampleSize = Math.min(rowCount - 1, 200);
				const step = Math.max(1, Math.floor((rowCount - 1) / sampleSize));
				let totalInterval = 0;
				let count = 0;
				for (let i = 0; i < rowCount - 1; i += step) {
					const t0 = timeColData.data[i] + timeColData.refPoint;
					const t1 = timeColData.data[i + 1] + timeColData.refPoint;
					const dtMs = Math.abs(toMillis(t1) - toMillis(t0));
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
		if (error) return { type: "error", error };

		const resultData = new Float64Array(rowCount);
		const rowValues = new Array(usedColumnIndices.length);
		const ctx = createContext ? createContext() : undefined;

		for (let i = 0; i < rowCount; i++) {
			for (let j = 0; j < usedColumnIndices.length; j++) {
				rowValues[j] = columnData[j].data[i] + columnData[j].refPoint;
			}
			resultData[i] = evaluate(rowValues, ctx);
		}

		applyRollingAverageAlignment(formula, resultData, rowCount, columnData);

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
