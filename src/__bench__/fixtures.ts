/**
 * Deterministic data for the benchmarks. No Math.random: a benchmark that
 * measures a different dataset on every run cannot be compared to a baseline.
 */

/** Cheap deterministic PRNG (mulberry32), stable across Node versions. */
function prng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = Math.imul(a ^ (a >>> 15), 1 | a);
		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

export interface Series {
	x: Float32Array;
	y: Float32Array;
}

/**
 * A monotonic x column with a noisy sine on y — the shape of a typical
 * imported time series, including the spikes that make M4 decimation matter.
 */
export function makeSeries(n: number, seed = 12345): Series {
	const rand = prng(seed);
	const x = new Float32Array(n);
	const y = new Float32Array(n);
	for (let i = 0; i < n; i++) {
		x[i] = i;
		y[i] = Math.sin(i * 0.01) * 100 + (rand() - 0.5) * 20;
	}
	return { x, y };
}

/** Same shape, but with NaN runs so the segment splitting has work to do. */
export function makeGappySeries(n: number, seed = 999): Series {
	const { x, y } = makeSeries(n, seed);
	for (let i = 0; i < n; i += 1000) {
		for (let j = i; j < Math.min(i + 25, n); j++) y[j] = NaN;
	}
	return { x, y };
}

export const SMALL = 10_000;
export const LARGE = 1_000_000;
