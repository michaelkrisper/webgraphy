import { test } from "vitest";

/**
 * Sampling as under Vitest 4 (tinybench 2 defaults), which the committed
 * baseline was recorded with. Tinybench 6 defaults to at least 64 samples,
 * which pushes the slowest benchmark past the test timeout on a busy machine.
 */
const RUN_OPTIONS = {
	time: 500,
	iterations: 10,
	warmupTime: 100,
	warmupIterations: 5,
};

/** Generous: a contended machine is reported by bench-check, not a timeout. */
const TIMEOUT_MS = 300_000;

/**
 * One benchmark per test, named identically. Vitest 5 only exposes `bench` as
 * a test-context fixture; keeping one registration per test means every
 * benchmark still lands in the JSON report as its own entry under a stable
 * name, which is what scripts/bench-check.mjs keys the baseline on.
 */
export function benchCase(name: string, fn: () => void): void {
	test(
		name,
		async ({ bench }) => {
			await bench(name, fn).run(RUN_OPTIONS);
		},
		TIMEOUT_MS,
	);
}
