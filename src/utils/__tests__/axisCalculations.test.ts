// src/utils/__tests__/axisCalculations.test.ts
import { describe, expect, it } from "vitest";
import {
	AXIS_EPSILON,
	calcCategoricalTicks,
	calcNumericPrecision,
	calcNumericStep,
	calcNumericTicks,
	calcYAxisTicks,
	formatAxisLabel,
	getAxisById,
	syncAxesWithTargets,
	DEFAULT_X_AXIS_ID,
} from "../axisCalculations";

describe("Constants", () => {
	it("exports AXIS_EPSILON correctly", () => {
		expect(AXIS_EPSILON).toBe(1e-10);
	});
});

describe("DEFAULT_X_AXIS_ID", () => {
	it("should have value 'axis-1'", () => {
		expect(DEFAULT_X_AXIS_ID).toBe("axis-1");
	});
});

describe("calcNumericStep", () => {
	it("rounds to nice steps", () => {
		expect(calcNumericStep(10, 5)).toBe(2);
		expect(calcNumericStep(100, 5)).toBe(20);
		expect(calcNumericStep(0.3, 3)).toBe(0.1);
	});

	it("returns 1 for zero or negative range", () => {
		expect(calcNumericStep(0, 5)).toBe(1);
		expect(calcNumericStep(-10, 5)).toBe(1);
	});

	it("handles maxTicks less than 1 by clamping to 1", () => {
		// raw = 10 / Math.max(1, 0) = 10. mag = 10, norm = 1. Output: 1 * 10 = 10
		expect(calcNumericStep(10, 0)).toBe(10);
		// raw = 10 / Math.max(1, -5) = 10. mag = 10, norm = 1. Output: 1 * 10 = 10
		expect(calcNumericStep(10, -5)).toBe(10);
		expect(calcNumericStep(10, 0.5)).toBe(10);
	});

	it("calculates norm < 1.5 -> step 1", () => {
		// raw = 1.2, mag = 1, norm = 1.2
		expect(calcNumericStep(1.2 * 10, 10)).toBe(1);
		// raw = 14, mag = 10, norm = 1.4 -> 1 * 10
		expect(calcNumericStep(14, 1)).toBe(10);
	});

	it("calculates norm < 3 -> step 2", () => {
		// raw = 2, mag = 1, norm = 2 -> 2 * 1
		expect(calcNumericStep(2 * 10, 10)).toBe(2);
		// raw = 28, mag = 10, norm = 2.8 -> 2 * 10
		expect(calcNumericStep(28, 1)).toBe(20);
	});

	it("calculates norm < 7 -> step 5", () => {
		// raw = 5, mag = 1, norm = 5 -> 5 * 1
		expect(calcNumericStep(5 * 10, 10)).toBe(5);
		// raw = 68, mag = 10, norm = 6.8 -> 5 * 10
		expect(calcNumericStep(68, 1)).toBe(50);
	});

	it("calculates norm >= 7 -> step 10", () => {
		// raw = 8, mag = 1, norm = 8 -> 10 * 1
		expect(calcNumericStep(8 * 10, 10)).toBe(10);
		// raw = 95, mag = 10, norm = 9.5 -> 10 * 10
		expect(calcNumericStep(95, 1)).toBe(100);
	});

	it("handles very small positive raw values", () => {
		// range = 1e-10, maxTicks = 2 -> raw = 5e-11
		// mag = 1e-11, norm = 5 -> 5 * 1e-11 = 5e-11
		expect(calcNumericStep(1e-10, 2)).toBeCloseTo(5e-11);
	});
});

describe("calcNumericPrecision", () => {
	it("returns 0 for integer steps", () => {
		expect(calcNumericPrecision(1)).toBe(0);
		expect(calcNumericPrecision(2)).toBe(0);
		expect(calcNumericPrecision(10)).toBe(0);
		expect(calcNumericPrecision(100)).toBe(0);
	});

	it("returns correct precision for fractional steps", () => {
		expect(calcNumericPrecision(0.5)).toBe(1);
		expect(calcNumericPrecision(0.1)).toBe(1);
		expect(calcNumericPrecision(0.05)).toBe(2);
		expect(calcNumericPrecision(0.01)).toBe(2);
		expect(calcNumericPrecision(0.001)).toBe(3);
	});

	it("caps precision at 20 for very small steps", () => {
		expect(calcNumericPrecision(1e-25)).toBe(20);
		expect(calcNumericPrecision(1e-30)).toBe(20);
	});

	it("handles 0 by returning 0 (defaults to 1)", () => {
		expect(calcNumericPrecision(0)).toBe(0);
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

describe("calcCategoricalTicks", () => {
	it("handles cases where min and max are negative", () => {
		expect(calcCategoricalTicks(-10, -5, 10)).toEqual([]);
	});

	it("handles cases where min is large and max is even larger", () => {
		expect(calcCategoricalTicks(20, 30, 5)).toEqual([]);
	});

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
	it("uses calcCategoricalTicks if categoryCount is provided", () => {
		const result = calcYAxisTicks(0, 5, 400, undefined, 10);
		expect(result.ticks).toEqual([0, 1, 2, 3, 4, 5]);
		expect(result.precision).toBe(0);
		expect(result.actualStep).toBe(1);
	});
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
	it("uses scratch if provided", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		};
		const targetXAxes = { x1: { min: -10, max: 110 } };
		const targetYs = { y1: { min: 10, max: 90 } };
		const scratch = {
			xUpdates: { dummy: { min: 0, max: 0 } },
			yUpdates: { dummy: { min: 0, max: 0 } },
		};

		const updates = syncAxesWithTargets(state, targetXAxes, targetYs, scratch);
		expect(updates.xUpdates).toBe(scratch.xUpdates);
		expect(updates.yUpdates).toBe(scratch.yUpdates);
		expect(scratch.xUpdates).toEqual({ x1: { min: -10, max: 110 } });
		expect(scratch.yUpdates).toEqual({ y1: { min: 10, max: 90 } });
	});
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

describe("getAxisById", () => {
	it("returns axis via direct lookup for canonical IDs", () => {
		const axes = [{ id: "axis-1" }, { id: "axis-2" }, { id: "axis-3" }];
		expect(getAxisById(axes, "axis-2")).toBe(axes[1]);
	});

	it("falls back to .find() for out-of-order arrays", () => {
		const axes = [{ id: "axis-3" }, { id: "axis-1" }, { id: "axis-2" }];
		expect(getAxisById(axes, "axis-1")).toBe(axes[1]);
	});

	it("falls back to .find() for non-canonical IDs", () => {
		const axes = [{ id: "custom-id-1" }, { id: "custom-id-2" }];
		expect(getAxisById(axes, "custom-id-2")).toBe(axes[1]);
	});

	it("returns undefined when the ID does not exist in the array", () => {
		const axes = [{ id: "axis-1" }, { id: "axis-2" }];
		expect(getAxisById(axes, "axis-3")).toBeUndefined();
		expect(getAxisById(axes, "custom-id")).toBeUndefined();
	});

	it("returns undefined when the array is empty", () => {
		expect(getAxisById([], "axis-1")).toBeUndefined();
	});

	it("handles malformed canonical IDs by falling back to find", () => {
		const axes = [{ id: "axis-abc" }];
		expect(getAxisById(axes, "axis-abc")).toBe(axes[0]);
	});
});
