/**
 * Fixed reference workload used to normalise every other benchmark.
 *
 * CI runners vary by a factor of two or more between runs, so absolute
 * wall-clock numbers cannot gate a pull request. Every benchmark is therefore
 * reported as a *cost ratio* against this control, which is executed in the
 * same process on the same machine in the same run. A slower runner slows the
 * control by the same factor, so the ratio stays stable and a genuine
 * regression still moves it.
 *
 * The body must stay untouched: changing it invalidates every committed
 * baseline. It is deliberately simple, branch-free and allocation-free so that
 * it measures raw scalar throughput rather than any library behaviour.
 */

export const CONTROL_ITERATIONS = 200_000;

export function controlWorkload(): number {
	let acc = 0;
	for (let i = 1; i <= CONTROL_ITERATIONS; i++) {
		acc += Math.sqrt(i) * 0.5 - acc * 0.000001;
	}
	return acc;
}
