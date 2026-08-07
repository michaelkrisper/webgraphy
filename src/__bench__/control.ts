/**
 * Fixed reference workloads used to normalise every other benchmark.
 *
 * CI runners and developer machines vary by a factor of two or more between
 * runs, so absolute wall-clock numbers cannot gate a pull request. Every
 * benchmark is instead reported as a *cost ratio* against these controls,
 * executed in the same process on the same machine in the same run.
 *
 * There are two of them, and that matters. A single compute-bound control does
 * not cancel machine load, because the benchmarks do not all share its
 * bottleneck: a tight scalar loop lives in L1 and degrades far less under
 * contention than a pass over a megabyte-scale typed array. Normalising
 * memory-bound work against a compute-bound control therefore reports a
 * regression whenever something else on the machine competes for bandwidth —
 * measured at ~28 % for `m4MergeOctave` with an unrelated build running.
 *
 * The checker uses the geometric mean of the two, which tracks whichever
 * resource is actually contended instead of assuming it is the CPU.
 *
 * Both bodies must stay untouched: changing either invalidates every committed
 * baseline.
 */

export const CONTROL_ITERATIONS = 200_000;

/** Compute-bound: scalar arithmetic in registers, working set of nothing. */
export function controlWorkload(): number {
	let acc = 0;
	for (let i = 1; i <= CONTROL_ITERATIONS; i++) {
		acc += Math.sqrt(i) * 0.5 - acc * 0.000001;
	}
	return acc;
}

const MEMORY_CONTROL_LENGTH = 1 << 21; // 2M floats = 8 MB, past any L2
const memoryControlData = (() => {
	const a = new Float32Array(MEMORY_CONTROL_LENGTH);
	for (let i = 0; i < MEMORY_CONTROL_LENGTH; i++) a[i] = i * 0.5;
	return a;
})();

/**
 * Memory-bound: one streaming pass plus a strided gather whose stride is
 * larger than a cache line, so it misses on most accesses. This is the
 * bottleneck the decimation and binary-search benchmarks actually hit.
 */
export function controlMemoryWorkload(): number {
	const a = memoryControlData;
	let acc = 0;
	for (let i = 0; i < a.length; i++) acc += a[i];
	// 64 floats = 256 bytes, comfortably past a 64-byte line.
	for (let i = 0; i < a.length; i += 64) acc -= a[i];
	return acc;
}
