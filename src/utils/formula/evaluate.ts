import { MATH_UNARY, mathModulo, isTruthy, sampleVariance, median } from "./math";
import { toMillis, dateKey, granularityOf, _scratchDate } from "./date";
import type { Token, FormulaContext } from "./types";
import {
	statefulAvgN,
	statefulAvgTime,
	statefulAvgGroup,
	statefulSumGroup,
	statefulRollingMed,
	statefulRollingStd,
	statefulRollingMin,
	statefulRollingMax,
	statefulLag,
	statefulDiff,
	statefulCumsum,
	statefulCumprod,
	statefulCummax,
	statefulCummin,
	statefulFilter
} from "./stateful";

// ── Function dispatch ──────────────────────────────────────────────────────

export function evaluateBucketFunc(
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

export function evaluateRolling(
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

export function evaluateRowRelative(
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

export function evaluateAggregate(
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

export function evaluateFuncToken(
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
