// src/utils/__tests__/axisCalculations.test.ts
import { describe, expect, it } from "vitest";
import {
	calcCategoricalTicks,
	calcNumericPrecision,
	calcNumericStep,
	calcNumericTicks,
	calcYAxisTicks,
	formatAxisLabel,
	syncAxesWithTargets,
} from "../axisCalculations";

describe("calcNumericStep", () => {
	it("rounds to nice steps", () => {
		expect(calcNumericStep(10, 5)).toBe(2);
		expect(calcNumericStep(100, 5)).toBe(20);
		expect(calcNumericStep(0.3, 3)).toBe(0.1);
	});
	it("returns 1 for zero range", () => {
		expect(calcNumericStep(0, 5)).toBe(1);
	});
});

describe("formatAxisLabel", () => {
	it("returns '0' for values close to zero", () => {
		expect(formatAxisLabel(0, 2)).toBe("0");
		expect(formatAxisLabel(1e-13, 2)).toBe("0");
		expect(formatAxisLabel(-1e-13, 2)).toBe("0");
	});

	it("formats normal numbers according to precision", () => {
		expect(formatAxisLabel(1.2345, 2)).toBe("1.23");
		expect(formatAxisLabel(100, 0)).toBe("100");
		expect(formatAxisLabel(100.5, 1)).toBe("100.5");
	});

	it("uses exponential notation for strings longer than 12 characters", () => {
		expect(formatAxisLabel(1234567890123, 0)).toBe("1e+12");
		expect(formatAxisLabel(0.000000000001, 12)).toBe("1.0000e-12");
	});

	it("caps exponential precision at 4 decimal places or given precision", () => {
		expect(formatAxisLabel(1234567890123, 2)).toBe("1.23e+12");
		expect(formatAxisLabel(1234567890123, 5)).toBe("1.2346e+12");
	});
});

describe("calcNumericPrecision", () => {
	it("returns 0 for steps >= 1", () => {
		expect(calcNumericPrecision(2)).toBe(0);
		expect(calcNumericPrecision(10)).toBe(0);
	});
	it("returns positive precision for fractional steps", () => {
		expect(calcNumericPrecision(0.1)).toBe(1);
		expect(calcNumericPrecision(0.01)).toBe(2);
	});
});

describe("calcCategoricalTicks", () => {
	it("generates integer ticks within bounds", () => {
		expect(calcCategoricalTicks(0, 5, 10)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it("bounds minimum at 0", () => {
		expect(calcCategoricalTicks(-5, 5, 10)).toEqual([0, 1, 2, 3, 4, 5]);
	});

	it("bounds maximum at categoryCount - 1", () => {
		expect(calcCategoricalTicks(0, 10, 5)).toEqual([0, 1, 2, 3, 4]);
	});

	it("handles decimal bounds by clamping inward", () => {
		expect(calcCategoricalTicks(1.5, 4.5, 10)).toEqual([2, 3, 4]);
	});

	it("returns empty array if min > max after rounding/bounding", () => {
		expect(calcCategoricalTicks(5, 0, 10)).toEqual([]);
		expect(calcCategoricalTicks(4.5, 4.2, 10)).toEqual([]);
		expect(calcCategoricalTicks(10, 15, 5)).toEqual([]); // max bounded to 4, min is 10, min > max
	});
});

describe("calcNumericTicks", () => {
	it("generates ticks covering the range", () => {
		const ticks = calcNumericTicks(0, 10, 2);
		expect(ticks[0]).toBeLessThanOrEqual(0);
		expect(ticks[ticks.length - 1]).toBeGreaterThanOrEqual(10);
	});
	it("caps at 200 ticks", () => {
		expect(calcNumericTicks(0, 1e6, 1).length).toBeLessThanOrEqual(201);
	});
});

describe("calcYAxisTicks", () => {
	it("returns ticks, precision, and actualStep", () => {
		const result = calcYAxisTicks(0, 100, 400);
		expect(result.ticks.length).toBeGreaterThan(0);
		expect(result.precision).toBeGreaterThanOrEqual(0);
		expect(result.actualStep).toBeGreaterThan(0);
	});
	it("handles zero range", () => {
		const result = calcYAxisTicks(5, 5, 400);
		expect(result.ticks).toEqual([]);
		expect(result.actualStep).toBe(1);
	});
	it("handles negative or zero step gracefully", () => {
		const result = calcYAxisTicks(0, 100, 400, -5);
		expect(result.ticks).toEqual([]);
		expect(result.actualStep).toBe(1);
	});
});

describe("syncAxesWithTargets", () => {
	it("returns empty updates if targets match state within EPSILON", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		};
		const targetXAxes = { x1: { min: 0 + 1e-11, max: 100 - 1e-11 } };
		const targetYs = { y1: { min: 0, max: 100 } };

		const updates = syncAxesWithTargets(state, targetXAxes, targetYs);
		expect(updates.xUpdates).toEqual({});
		expect(updates.yUpdates).toEqual({});
	});

	it("returns updates if targets differ from state by more than EPSILON", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		};
		const targetXAxes = { x1: { min: -10, max: 110 } };
		const targetYs = { y1: { min: 10, max: 90 } };

		const updates = syncAxesWithTargets(state, targetXAxes, targetYs);
		expect(updates.xUpdates).toEqual({ x1: { min: -10, max: 110 } });
		expect(updates.yUpdates).toEqual({ y1: { min: 10, max: 90 } });
	});

	it("ignores axes without targets", () => {
		const state = {
			xAxes: [
				{ id: "x1", min: 0, max: 100 },
				{ id: "x2", min: 0, max: 50 },
			],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		};
		const targetXAxes = { x1: { min: -10, max: 110 } };
		const targetYs: Record<string, { min: number; max: number }> = {};

		const updates = syncAxesWithTargets(state, targetXAxes, targetYs);
		expect(updates.xUpdates).toEqual({ x1: { min: -10, max: 110 } });
		expect(updates.yUpdates).toEqual({});
	});
});
