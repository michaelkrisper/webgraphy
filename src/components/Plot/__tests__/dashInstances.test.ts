import { describe, expect, it } from "vitest";
import {
	buildDashInstances,
	computeDashSteps,
	dashCacheParams,
	dashParamsEqual,
	type SegParams,
	type SeriesDrawBundle,
} from "../drawSeries";

/**
 * The dashed-line instance buffer used to be built inline inside a GL call, so
 * the only way to reach it was through a mocked WebGL context. These are the
 * pure pieces of that path, checked directly: the striding, the cache key, and
 * the packed geometry.
 */

const FLOATS_PER_INSTANCE = 5;

function bundleWith(
	overrides: Partial<SeriesDrawBundle> = {},
): SeriesDrawBundle {
	const n = 8;
	return {
		xData: Float32Array.from({ length: n }, (_, i) => i),
		yData: Float32Array.from({ length: n }, (_, i) => i * 2),
		xRef: 0,
		yRef: 0,
		xAxisMin: 0,
		xAxisMax: 7,
		xRange: 7,
		yRange: 14,
		chartWidth: 700,
		chartHeight: 140,
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		height: 140,
		dpr: 1,
		xScale: 1,
		xOff: 0,
		drawRanges: [{ start: 0, count: n }],
		...overrides,
	} as SeriesDrawBundle;
}

describe("computeDashSteps", () => {
	it("emits one instance per segment for a short range", () => {
		// 8 points -> 7 segments, no striding needed.
		expect(computeDashSteps([{ start: 0, count: 8 }])).toBe(7);
	});

	it("sums across ranges", () => {
		expect(
			computeDashSteps([
				{ start: 0, count: 5 },
				{ start: 10, count: 3 },
			]),
		).toBe(4 + 2);
	});

	it("ignores ranges that cannot form a segment", () => {
		expect(computeDashSteps([{ start: 0, count: 1 }])).toBe(0);
		expect(computeDashSteps([{ start: 0, count: 0 }])).toBe(0);
	});

	it("strides long ranges down to the per-range cap", () => {
		// A dash shorter than a pixel is invisible, so long ranges are strided
		// instead of emitting an instance per sample.
		const total = computeDashSteps([{ start: 0, count: 1_000_001 }]);
		expect(total).toBeLessThanOrEqual(4000);
		expect(total).toBeGreaterThan(3000);
	});
});

describe("dashCacheParams / dashParamsEqual", () => {
	const bundle = bundleWith();

	it("treats a missing previous entry as a miss", () => {
		expect(dashParamsEqual(undefined, dashCacheParams(bundle, 7))).toBe(false);
	});

	it("hits when nothing relevant changed", () => {
		const a = dashCacheParams(bundle, 7);
		const b = dashCacheParams(bundleWith(), 7);
		expect(dashParamsEqual(a, b)).toBe(true);
	});

	it("hits across a pan, which is the case that matters", () => {
		// Panning shifts the axis window but leaves the span untouched, so the
		// packed geometry is still valid and must not be rebuilt every frame.
		const before = dashCacheParams(bundle, 7);
		const panned = dashCacheParams(
			bundleWith({ xAxisMin: 100, xAxisMax: 107, xOff: -100 }),
			7,
		);
		expect(dashParamsEqual(before, panned)).toBe(true);
	});

	it.each([
		["xRange", { xRange: 14 }],
		["yRange", { yRange: 28 }],
		["chartWidth", { chartWidth: 800 }],
		["chartHeight", { chartHeight: 200 }],
		["dpr", { dpr: 2 }],
	])("misses when %s changes", (_name, override) => {
		const before = dashCacheParams(bundle, 7);
		const after = dashCacheParams(bundleWith(override), 7);
		expect(dashParamsEqual(before, after)).toBe(false);
	});

	it("misses when the instance count or range layout changes", () => {
		const before = dashCacheParams(bundle, 7);
		expect(dashParamsEqual(before, dashCacheParams(bundle, 8))).toBe(false);
		expect(
			dashParamsEqual(
				before,
				dashCacheParams(
					bundleWith({
						drawRanges: [
							{ start: 0, count: 4 },
							{ start: 5, count: 3 },
						],
					}),
					7,
				),
			),
		).toBe(false);
	});

	it("misses when the range starts somewhere else", () => {
		const before = dashCacheParams(bundle, 7);
		const after = dashCacheParams(
			bundleWith({ drawRanges: [{ start: 3, count: 8 }] }),
			7,
		);
		expect(dashParamsEqual(before, after)).toBe(false);
	});

	it("records every field it compares", () => {
		// Guards against a field being added to SegParams but not to the
		// comparison, which would silently serve stale geometry.
		const params = dashCacheParams(bundle, 7);
		for (const key of Object.keys(params) as (keyof SegParams)[]) {
			const mutated = { ...params, [key]: params[key] + 1 };
			expect(dashParamsEqual(params, mutated), key).toBe(false);
		}
	});
});

describe("buildDashInstances", () => {
	it("packs endpoints and a running distance per segment", () => {
		const bundle = bundleWith();
		const total = computeDashSteps(bundle.drawRanges);
		const out = buildDashInstances(bundle, total);

		expect(out.length).toBe(total * FLOATS_PER_INSTANCE);

		// First instance spans points 0 and 1, starting at distance zero.
		expect(Array.from(out.slice(0, 5))).toEqual([0, 0, 1, 2, 0]);

		// scaleX = 700/7 = 100, scaleY = 140/14 = 10, so each segment is
		// hypot(1*100, 2*10) = hypot(100, 20) device px long.
		const segLen = Math.hypot(100, 20);
		expect(out[9]).toBeCloseTo(segLen, 3);
		expect(out[14]).toBeCloseTo(segLen * 2, 3);
	});

	it("restarts the distance at each range", () => {
		// A gap breaks the line, so continuing the phase across it would make
		// the dash pattern jump.
		const bundle = bundleWith({
			drawRanges: [
				{ start: 0, count: 3 },
				{ start: 4, count: 3 },
			],
		});
		const total = computeDashSteps(bundle.drawRanges);
		const out = buildDashInstances(bundle, total);

		expect(total).toBe(4);
		expect(out[4]).toBe(0);
		// Third instance is the first of the second range.
		expect(out[2 * FLOATS_PER_INSTANCE + 4]).toBe(0);
	});

	it("clamps the final segment of a strided range to the last sample", () => {
		// With a stride the last step can overshoot; it must land exactly on
		// the range's final point rather than reading past it.
		const n = 10_000;
		const bundle = bundleWith({
			xData: Float32Array.from({ length: n }, (_, i) => i),
			yData: Float32Array.from({ length: n }, (_, i) => i),
			drawRanges: [{ start: 0, count: n }],
		});
		const total = computeDashSteps(bundle.drawRanges);
		const out = buildDashInstances(bundle, total);

		const lastX1 = out[(total - 1) * FLOATS_PER_INSTANCE + 2];
		expect(lastX1).toBe(n - 1);
		for (let i = 0; i < out.length; i++) {
			expect(Number.isFinite(out[i])).toBe(true);
		}
	});

	it("respects the reference frame of an offset range", () => {
		const bundle = bundleWith({ drawRanges: [{ start: 3, count: 3 }] });
		const total = computeDashSteps(bundle.drawRanges);
		const out = buildDashInstances(bundle, total);

		expect(total).toBe(2);
		// Starts at index 3, not 0.
		expect(out[0]).toBe(3);
		expect(out[1]).toBe(6);
	});
});
