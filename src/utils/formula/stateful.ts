import { median } from "./math";
import { toMillis } from "./date";
import type { FormulaContext } from "./types";

// ── Stateful primitives (one slot per FUNC id) ─────────────────────────────

export function statefulAvgN(
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

export function statefulAvgTime(
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

export function statefulAvgGroup(
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

export function statefulSumGroup(
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

export function pushBoundedQueue(
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

export function statefulRollingMed(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	return median(pushBoundedQueue(ctx, id, val, n));
}

export function statefulRollingStd(
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

export function statefulRollingMin(
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

export function statefulRollingMax(
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

export function statefulLag(
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

export function statefulDiff(ctx: FormulaContext, id: number, val: number): number {
	if (!ctx.hasPrev[id]) {
		ctx.hasPrev[id] = true;
		ctx.prevVals[id] = val;
		return NaN;
	}
	const prev = ctx.prevVals[id];
	ctx.prevVals[id] = val;
	return val - prev;
}

export function cumReduce(
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

export const statefulCumsum = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, 0, (a, v) => a + v);
export const statefulCumprod = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, 1, (a, v) => a * v);
export const statefulCummax = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, -Infinity, Math.max);
export const statefulCummin = (ctx: FormulaContext, id: number, val: number) =>
	cumReduce(ctx, id, val, Infinity, Math.min);

export function statefulFilter(
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
