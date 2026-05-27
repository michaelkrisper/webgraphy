import { describe, expect, it } from "vitest";
import { applyKeyboardPan, applyKeyboardZoom } from "./keyboard";

describe("applyKeyboardPan", () => {
	it("should return false when no matching keys are pressed", () => {
		const state = { xAxes: [], yAxes: [] } as any;
		const keys = new Set(["a", "b"]);
		const targetXAxes = {};
		const targetYs = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(false);
	});

	it("should pan xAxes left and return true", () => {
		const state = { xAxes: [{ id: "x1", min: 0, max: 100 }], yAxes: [] } as any;
		const keys = new Set(["ArrowLeft"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(-5);
		expect(targetXAxes.x1.max).toBeCloseTo(95);
	});

	it("should pan xAxes right and return true", () => {
		const state = { xAxes: [{ id: "x1", min: 0, max: 100 }], yAxes: [] } as any;
		const keys = new Set(["ArrowRight"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(5);
		expect(targetXAxes.x1.max).toBeCloseTo(105);
	});

	it("should pan yAxes up and return true", () => {
		const state = { xAxes: [], yAxes: [{ id: "y1", min: 0, max: 100 }] } as any;
		const keys = new Set(["ArrowUp"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetYs.y1.min).toBeCloseTo(5);
		expect(targetYs.y1.max).toBeCloseTo(105);
	});

	it("should pan yAxes down and return true", () => {
		const state = { xAxes: [], yAxes: [{ id: "y1", min: 0, max: 100 }] } as any;
		const keys = new Set(["ArrowDown"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetYs.y1.min).toBeCloseTo(-5);
		expect(targetYs.y1.max).toBeCloseTo(95);
	});

	it("should use existing targetXAxes/targetYs if available", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["ArrowRight", "ArrowUp"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {
			x1: { min: 10, max: 110 },
		};
		const targetYs: Record<string, { min: number; max: number }> = {
			y1: { min: 10, max: 110 },
		};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(15);
		expect(targetXAxes.x1.max).toBeCloseTo(115);
		expect(targetYs.y1.min).toBeCloseTo(15);
		expect(targetYs.y1.max).toBeCloseTo(115);
	});

	it("should pan diagonally when two non-conflicting keys are pressed", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }]
		} as any;
		const keys = new Set(["ArrowLeft", "ArrowUp"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(-5);
		expect(targetXAxes.x1.max).toBeCloseTo(95);
		expect(targetYs.y1.min).toBeCloseTo(5);
		expect(targetYs.y1.max).toBeCloseTo(105);
	});

	it("should handle conflicting x-axis keys (ArrowLeft + ArrowRight) by prioritizing right (1)", () => {
		const state = { xAxes: [{ id: "x1", min: 0, max: 100 }], yAxes: [] } as any;
		const keys = new Set(["ArrowLeft", "ArrowRight"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(5);
		expect(targetXAxes.x1.max).toBeCloseTo(105);
	});

	it("should handle conflicting y-axis keys (ArrowUp + ArrowDown) by prioritizing up (1)", () => {
		const state = { xAxes: [], yAxes: [{ id: "y1", min: 0, max: 100 }] } as any;
		const keys = new Set(["ArrowUp", "ArrowDown"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetYs.y1.min).toBeCloseTo(5);
		expect(targetYs.y1.max).toBeCloseTo(105);
	});
});

describe("applyKeyboardZoom", () => {
	it("should return false when no matching keys are pressed", () => {
		const state = { xAxes: [], yAxes: [] } as any;
		const keys = new Set(["a", "b"]);
		const targetXAxes = {};
		const targetYs = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(false);
	});

	it("should zoom in (+/i) for both axes and return true", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["+"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(7.5);
		expect(targetXAxes.x1.max).toBeCloseTo(92.5);
		expect(targetYs.y1.min).toBeCloseTo(7.5);
		expect(targetYs.y1.max).toBeCloseTo(92.5);
	});

	it("should zoom out (-/_) for both axes and return true", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["-"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(-7.5);
		expect(targetXAxes.x1.max).toBeCloseTo(107.5);
		expect(targetYs.y1.min).toBeCloseTo(-7.5);
		expect(targetYs.y1.max).toBeCloseTo(107.5);
	});

	it("should zoom only xAxes when Control is pressed", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["+", "Control"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(7.5);
		expect(targetXAxes.x1.max).toBeCloseTo(92.5);
		expect(targetYs.y1).toBeUndefined();
	});

	it("should zoom in using = for both axes", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["="]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(7.5);
		expect(targetXAxes.x1.max).toBeCloseTo(92.5);
		expect(targetYs.y1.min).toBeCloseTo(7.5);
		expect(targetYs.y1.max).toBeCloseTo(92.5);
	});

	it("should zoom out using _ for both axes", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as any;
		const keys = new Set(["_"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(-7.5);
		expect(targetXAxes.x1.max).toBeCloseTo(107.5);
		expect(targetYs.y1.min).toBeCloseTo(-7.5);
		expect(targetYs.y1.max).toBeCloseTo(107.5);
	});

	it("should use existing targetXAxes/targetYs if available", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		};
		const keys = new Set(["+"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {
			x1: { min: 10, max: 110 },
		};
		const targetYs: Record<string, { min: number; max: number }> = {
			y1: { min: 10, max: 110 },
		};

		const result = applyKeyboardZoom(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(17.5);
		expect(targetXAxes.x1.max).toBeCloseTo(102.5);
		expect(targetYs.y1.min).toBeCloseTo(17.5);
		expect(targetYs.y1.max).toBeCloseTo(102.5);
	});
});
