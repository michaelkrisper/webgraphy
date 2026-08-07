/**
 * Fixed reference workload used to normalise every other benchmark.
 *
 * CI runners vary by a factor of two or more between machine classes, so
 * absolute wall-clock numbers cannot gate a pull request. Every benchmark is
 * reported as a *cost ratio* against this control, executed in the same
 * process on the same machine in the same run.
 *
 * It is deliberately compute-bound: scalar arithmetic in registers, no working
 * set. A memory-bound control was tried and removed — it tracked the runner's
 * memory subsystem far more strongly than the benchmarks themselves did
 * (+61% between two CI runners where the benchmarks moved ~5%), so
 * normalising by it introduced cross-runner variance rather than removing it.
 *
 * Contention on a busy developer machine is not handled here at all, because
 * it cannot be: benchmarks run at different moments, so nothing sampled at a
 * single moment can cancel a throughput that moves mid-run. That is what the
 * start/end drift check and the CI-only gate in scripts/bench-check.mjs are
 * for.
 *
 * The body must stay untouched: changing it invalidates every committed
 * baseline.
 */

export const CONTROL_ITERATIONS = 200_000;

export function controlWorkload(): number {
	let acc = 0;
	for (let i = 1; i <= CONTROL_ITERATIONS; i++) {
		acc += Math.sqrt(i) * 0.5 - acc * 0.000001;
	}
	return acc;
}
