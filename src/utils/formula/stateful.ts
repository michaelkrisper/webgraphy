import { median } from "./math";
import { toMillis } from "./date";
import type { FormulaContext } from "./types";

// ── Stateful primitives (one slot per FUNC id) ─────────────────────────────
//
// Non-finite inputs (NaN gaps, ±Infinity) never enter running state: a single
// one would otherwise poison every running sum for the rest of the column.
// Aggregates (rolling*, cum*, group buckets, filter) are computed over the
// finite values in their window and return NaN only when that window holds
// none. Point-wise diff returns NaN for a non-finite row and diffs the next
// row against the last finite value. lag is a pure shift and passes NaN on.

export function statefulAvgN(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	if (!ctx.queues[id]) {
		ctx.queues[id] = [];
		ctx.sums[id] = 0;
		ctx.counts[id] = 0;
	}
	const q = ctx.queues[id];
	q.push(val);
	if (Number.isFinite(val)) {
		ctx.sums[id] += val;
		ctx.counts[id]++;
	}
	while (q.length > n) {
		const old = q.shift()!;
		if (Number.isFinite(old)) {
			ctx.sums[id] -= old;
			ctx.counts[id]--;
		}
	}
	return ctx.counts[id] > 0 ? ctx.sums[id] / ctx.counts[id] : NaN;
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
	// A NaN timestamp at the queue head would never satisfy `<= cutoff` and
	// block eviction for good, so rows without a usable time stay out.
	if (!Number.isFinite(tMs)) return NaN;
	if (Number.isFinite(val)) {
		q.push({ t: tMs, v: val });
		ctx.timeSums[id] += val;
	}
	const cutoff = tMs - windowSec * 1000;
	while (q.length > 0 && q[0].t <= cutoff) {
		ctx.timeSums[id] -= q.shift()?.v ?? 0;
	}
	return q.length > 0 ? ctx.timeSums[id] / q.length : NaN;
}

export function statefulAvgGroup(
	ctx: FormulaContext,
	id: number,
	val: number,
	key: string | number,
): number {
	if (ctx.groupLastKey[id] !== key) {
		ctx.groupSums[id] = 0;
		ctx.groupCounts[id] = 0;
		ctx.groupLastKey[id] = key;
	}
	if (Number.isFinite(val)) {
		ctx.groupSums[id] += val;
		ctx.groupCounts[id] += 1;
	}
	return ctx.groupCounts[id] > 0 ? ctx.groupSums[id] / ctx.groupCounts[id] : NaN;
}

export function statefulSumGroup(
	ctx: FormulaContext,
	id: number,
	val: number,
	key: string | number,
): number {
	if (ctx.groupLastKey[id] !== key) {
		ctx.groupSums[id] = 0;
		ctx.groupCounts[id] = 0;
		ctx.groupLastKey[id] = key;
	}
	if (Number.isFinite(val)) {
		ctx.groupSums[id] += val;
		ctx.groupCounts[id] += 1;
	}
	return ctx.groupCounts[id] > 0 ? ctx.groupSums[id] : NaN;
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
	const finite = pushBoundedQueue(ctx, id, val, n).filter(Number.isFinite);
	return finite.length > 0 ? median(finite) : NaN;
}

export function statefulRollingStd(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	// Welford with removal: sums holds the window mean and sumsSq the sum of
	// squared deviations from it. Raw Σx/Σx² cancel catastrophically for large
	// offsets with a small spread (epoch timestamps, values ~1e6). Removal
	// still accumulates rounding error over a long column, so the state is
	// recomputed exactly once per window turnover (amortised O(1) per row).
	if (!ctx.queues[id]) {
		ctx.queues[id] = [];
		ctx.sums[id] = 0;
		ctx.sumsSq[id] = 0;
		ctx.counts[id] = 0;
		ctx.stdEvictions[id] = 0;
	}
	const q = ctx.queues[id];
	q.push(val);
	if (Number.isFinite(val)) {
		const k = ++ctx.counts[id];
		const delta = val - ctx.sums[id];
		ctx.sums[id] += delta / k;
		ctx.sumsSq[id] += delta * (val - ctx.sums[id]);
	}
	while (q.length > n) {
		const old = q.shift()!;
		if (!Number.isFinite(old)) continue;
		const k = --ctx.counts[id];
		if (k === 0) {
			ctx.sums[id] = 0;
			ctx.sumsSq[id] = 0;
			continue;
		}
		const delta = old - ctx.sums[id];
		ctx.sums[id] -= delta / k;
		ctx.sumsSq[id] -= delta * (old - ctx.sums[id]);
		if (++ctx.stdEvictions[id] >= n) {
			ctx.stdEvictions[id] = 0;
			resyncWindowMoments(ctx, id, q);
		}
	}
	const k = ctx.counts[id];
	if (k === 0) return NaN;
	if (k < 2) return 0;
	return Math.sqrt(Math.max(0, ctx.sumsSq[id] / (k - 1)));
}

function resyncWindowMoments(ctx: FormulaContext, id: number, q: number[]) {
	let sum = 0;
	let k = 0;
	for (const v of q) {
		if (Number.isFinite(v)) {
			sum += v;
			k++;
		}
	}
	const mean = k > 0 ? sum / k : 0;
	let ss = 0;
	for (const v of q) if (Number.isFinite(v)) ss += (v - mean) * (v - mean);
	ctx.sums[id] = mean;
	ctx.sumsSq[id] = ss;
}

export function statefulRollingMin(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	const q = pushBoundedQueue(ctx, id, val, n);
	let m = Infinity;
	for (let i = 0; i < q.length; i++)
		if (Number.isFinite(q[i]) && q[i] < m) m = q[i];
	return m === Infinity ? NaN : m;
}

export function statefulRollingMax(
	ctx: FormulaContext,
	id: number,
	val: number,
	n: number,
): number {
	const q = pushBoundedQueue(ctx, id, val, n);
	let m = -Infinity;
	for (let i = 0; i < q.length; i++)
		if (Number.isFinite(q[i]) && q[i] > m) m = q[i];
	return m === -Infinity ? NaN : m;
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

export function statefulDiff(
	ctx: FormulaContext,
	id: number,
	val: number,
): number {
	if (!Number.isFinite(val)) return NaN;
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
	if (!Number.isFinite(val)) return ctx.cumHas[id] ? ctx.cumState[id] : NaN;
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
	if (!Number.isFinite(val)) return ctx.filterState[id]?.estimate ?? NaN;
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
