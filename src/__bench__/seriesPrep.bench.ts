import { bench, describe } from "vitest";
import {
	computeDataSlice,
	computeDrawRanges,
	getOrComputeMonotonicity,
	getOrComputeSegments,
} from "../components/Plot/seriesPrep";
import { controlWorkload } from "./control";
import { LARGE, makeGappySeries, makeSeries } from "./fixtures";

/**
 * Per-frame series preparation: which slice of the column is on screen, and
 * which NaN-free runs inside it become draw ranges. Runs once per visible
 * series per frame.
 */

const clean = makeSeries(LARGE);
const gappy = makeGappySeries(LARGE);

describe("seriesPrep", () => {
	// Cache-hit path: what actually happens on every frame after the first.
	const warmMono = new WeakMap<Float32Array, boolean>();
	const warmSeg = new WeakMap<Float32Array, { start: number; end: number }[]>();
	getOrComputeMonotonicity(clean.x, warmMono);
	getOrComputeSegments(gappy.x, gappy.y, warmSeg);

	bench("monotonicity scan 1M (cold)", () => {
		getOrComputeMonotonicity(clean.x, new WeakMap());
	});

	bench("monotonicity lookup (warm)", () => {
		getOrComputeMonotonicity(clean.x, warmMono);
	});

	bench("segment split 1M with NaN runs (cold)", () => {
		getOrComputeSegments(gappy.x, gappy.y, new WeakMap());
	});

	bench("computeDataSlice 1M monotonic", () => {
		computeDataSlice(clean.x, 400_000, 410_000, 0, true);
	});

	bench("computeDataSlice 1M non-monotonic", () => {
		// Falls back to a linear scan, so it is the pessimistic case.
		computeDataSlice(clean.x, 400_000, 410_000, 0, false);
	});

	const segments = getOrComputeSegments(gappy.x, gappy.y, warmSeg);
	const scratch: { start: number; count: number }[] = [];

	bench("computeDrawRanges over gappy slice", () => {
		computeDrawRanges(segments, true, 400_000, 410_000, scratch);
	});
});

// Repeat of the compute control, run last. Comparing it with the same workload
// measured at the start of the suite tells the checker whether the machine's
// throughput held steady for the duration — if it did not, nothing measured in
// between can be compared to a baseline.
describe("control tail", () => {
	bench("reference workload end", () => {
		controlWorkload();
	});
});
