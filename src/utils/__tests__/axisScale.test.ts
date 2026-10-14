import { describe, expect, it } from "vitest";
import {
	calcLogTicks,
	calcYAxisTicks,
	formatAxisLabel,
	formatLogTickLabel,
	LOG_TICK_PRECISION,
} from "../axisCalculations";
import {
	axisFraction,
	axisValueAt,
	fromScale,
	logSafeRange,
	mapRangeInScale,
	padRange,
	positiveBounds,
	toScale,
} from "../axisScale";

describe("axisScale", () => {
	it("maps to and from log10 scale space", () => {
		expect(toScale(1000, true)).toBeCloseTo(3);
		expect(fromScale(-2, true)).toBeCloseTo(0.01);
		expect(toScale(0, true)).toBeNaN();
		expect(toScale(-5, true)).toBeNaN();
		expect(toScale(-5, false)).toBe(-5);
		expect(fromScale(7, false)).toBe(7);
	});

	it("clamps log exponents so ranges stay finite and positive", () => {
		expect(fromScale(1e6, true)).toBe(1e300);
		expect(fromScale(-1e6, true)).toBe(1e-300);
	});

	it("round-trips value -> fraction -> value on a log axis", () => {
		for (const v of [0.003, 1, 42, 999, 1e5]) {
			const f = axisFraction(v, 1e-3, 1e6, true);
			expect(axisValueAt(f, 1e-3, 1e6, true)).toBeCloseTo(v, 9);
		}
		// Decades are evenly spaced.
		expect(axisFraction(10, 1, 1000, true)).toBeCloseTo(1 / 3);
		expect(axisFraction(100, 1, 1000, true)).toBeCloseTo(2 / 3);
		expect(axisFraction(0, 1, 1000, true)).toBeNaN();
	});

	it("keeps the linear fraction exact", () => {
		expect(axisFraction(25, 0, 100, false)).toBe(0.25);
		expect(axisValueAt(0.25, 0, 100, false)).toBe(25);
	});

	it("applies range operations in scale space", () => {
		const r = mapRangeInScale(1, 100, true, (lo, hi) => ({
			min: lo + 1,
			max: hi + 1,
		}));
		expect(r.min).toBeCloseTo(10);
		expect(r.max).toBeCloseTo(1000);
		expect(
			mapRangeInScale(1, 100, false, (lo, hi) => ({ min: lo + 1, max: hi + 1 })),
		).toEqual({ min: 2, max: 101 });
	});

	it("pads log ranges by a constant factor and keeps them positive", () => {
		const r = padRange(1, 1000, 0.05, true);
		expect(r.min).toBeCloseTo(10 ** -0.15);
		expect(r.max).toBeCloseTo(10 ** 3.15);
		expect(padRange(0, 100, 0.05, false)).toEqual({ min: -5, max: 105 });
	});

	it("derives a log-safe range", () => {
		expect(logSafeRange(2, 50, null)).toEqual({ min: 2, max: 50 });
		const fit = logSafeRange(-10, 50, { min: 1, max: 100 });
		expect(fit.min).toBeGreaterThan(0);
		expect(fit.min).toBeLessThan(1);
		expect(fit.max).toBeGreaterThan(100);
		expect(logSafeRange(0, 50, null)).toEqual({ min: 0.05, max: 50 });
		expect(logSafeRange(-5, -1, null)).toEqual({ min: 1, max: 100 });
	});

	it("finds the positive bounds of a refPoint-offset column", () => {
		const data = new Float32Array([-12, -10, -9.5, 0, 40]);
		// Absolute values: -2, 0, 0.5, 10, 50.
		expect(positiveBounds(data, 10)).toEqual({ min: 0.5, max: 50 });
		expect(positiveBounds(new Float32Array([-1, 0]), 0)).toBeNull();
		expect(positiveBounds(new Float32Array([1, Number.NaN, 3]), 0)).toEqual({
			min: 1,
			max: 3,
		});
	});
});

describe("calcLogTicks", () => {
	it("labels every decade with 2..9 minors when there is room", () => {
		const t = calcLogTicks(1, 1000, 200, 30);
		expect(t.precision).toBe(LOG_TICK_PRECISION);
		expect(t.ticks).toEqual([1, 10, 100, 1000]);
		expect(t.minorTicks).toContain(2);
		expect(t.minorTicks).toContain(900);
		expect(t.minorTicks).not.toContain(10);
		expect(t.minorTicks.length).toBe(3 * 8);
	});

	it("adds 2 and 5 labels when decades are wide", () => {
		const t = calcLogTicks(1, 100, 400, 30);
		expect(t.ticks).toEqual([1, 2, 5, 10, 20, 50, 100]);
		expect(t.minorTicks).toContain(3);
		expect(t.minorTicks).not.toContain(5);
	});

	it("produces exact decimal ticks below 1", () => {
		const t = calcLogTicks(0.001, 1, 400, 30);
		expect(t.ticks).toContain(0.001);
		expect(t.ticks).toContain(0.002);
		expect(t.ticks).toContain(0.05);
	});

	it("falls back to sparse decades across many decades", () => {
		const t = calcLogTicks(1e-20, 1e20, 300, 30);
		// 40 decades in 300px: every 5th decade labelled.
		expect(t.actualStep).toBe(5);
		for (const v of t.ticks) {
			expect(Math.abs(Math.round(Math.log10(v)) % 5)).toBe(0);
		}
		expect(t.ticks).toContain(1);
		expect(t.ticks.length).toBeLessThanOrEqual(11);
		// Skipped decades become minor ticks while they are >= 4px apart.
		expect(t.minorTicks).toContain(10);
	});

	it("uses linear nice ticks inside a single decade", () => {
		const t = calcLogTicks(2.1, 4.9, 300, 30);
		expect(t.precision).toBeGreaterThanOrEqual(0);
		expect(t.ticks.length).toBeGreaterThanOrEqual(2);
		expect(t.ticks.every((v) => v > 0)).toBe(true);
		expect(t.minorTicks).toEqual([]);
	});

	it("returns nothing for ranges a log axis cannot show", () => {
		expect(calcLogTicks(0, 10, 300, 30).ticks).toEqual([]);
		expect(calcLogTicks(-1, 10, 300, 30).ticks).toEqual([]);
		expect(calcLogTicks(10, 1, 300, 30).ticks).toEqual([]);
	});

	it("is what calcYAxisTicks returns for a log axis", () => {
		const y = calcYAxisTicks(1, 1000, 200, undefined, undefined, true);
		expect(y.ticks).toEqual([1, 10, 100, 1000]);
		expect(y.minorTicks?.length).toBeGreaterThan(0);
		// Categorical axes ignore the log flag.
		expect(calcYAxisTicks(0, 3, 300, 1, 4, true).ticks).toEqual([0, 1, 2, 3]);
	});
});

describe("formatLogTickLabel", () => {
	it("prints values near 1 as plain decimals", () => {
		expect(formatLogTickLabel(0.001)).toBe("0.001");
		expect(formatLogTickLabel(0.05)).toBe("0.05");
		expect(formatLogTickLabel(1)).toBe("1");
		expect(formatLogTickLabel(200)).toBe("200");
		expect(formatLogTickLabel(1000)).toBe("1000");
	});

	it("prints far decades as superscript powers of ten", () => {
		expect(formatLogTickLabel(1e4)).toBe("10⁴");
		expect(formatLogTickLabel(1e-5)).toBe("10⁻⁵");
		expect(formatLogTickLabel(2e6)).toBe("2×10⁶");
		expect(formatLogTickLabel(1e20)).toBe("10²⁰");
	});

	it("is selected by the LOG_TICK_PRECISION sentinel", () => {
		expect(formatAxisLabel(1e-6, LOG_TICK_PRECISION)).toBe("10⁻⁶");
		expect(formatAxisLabel(0.5, 1)).toBe("0.5");
	});
});
