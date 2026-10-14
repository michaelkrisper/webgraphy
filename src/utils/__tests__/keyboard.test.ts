import { describe, expect, it } from "vitest";
import type { useGraphStore } from "../../store/useGraphStore";
import {
	applyKeyboardPan,
	applyKeyboardZoom,
	axisStepForKey,
	releaseNavigationKeys,
	stepAxisTarget,
} from "../keyboard";

describe("applyKeyboardPan", () => {
	it("should return false when no matching keys are pressed", () => {
		const state = { xAxes: [], yAxes: [] } as unknown as ReturnType<
			typeof useGraphStore.getState
		>;
		const keys = new Set(["a", "b"]);
		const targetXAxes = {};
		const targetYs = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(false);
	});

	it("should pan xAxes left and return true", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const keys = new Set(["ArrowLeft"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(-5);
		expect(targetXAxes.x1.max).toBeCloseTo(95);
	});

	it("should pan xAxes right and return true", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const keys = new Set(["ArrowRight"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(5);
		expect(targetXAxes.x1.max).toBeCloseTo(105);
	});

	it("should pan yAxes up and return true", () => {
		const state = {
			xAxes: [],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const keys = new Set(["ArrowUp"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetYs.y1.min).toBeCloseTo(5);
		expect(targetYs.y1.max).toBeCloseTo(105);
	});

	it("should pan yAxes down and return true", () => {
		const state = {
			xAxes: [],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const keys = new Set(["ArrowLeft", "ArrowRight"]);
		const targetXAxes: Record<string, { min: number; max: number }> = {};
		const targetYs: Record<string, { min: number; max: number }> = {};

		const result = applyKeyboardPan(state, keys, targetXAxes, targetYs);

		expect(result).toBe(true);
		expect(targetXAxes.x1.min).toBeCloseTo(5);
		expect(targetXAxes.x1.max).toBeCloseTo(105);
	});

	it("should handle conflicting y-axis keys (ArrowUp + ArrowDown) by prioritizing up (1)", () => {
		const state = {
			xAxes: [],
			yAxes: [{ id: "y1", min: 0, max: 100 }],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		const state = { xAxes: [], yAxes: [] } as unknown as ReturnType<
			typeof useGraphStore.getState
		>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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
		} as unknown as ReturnType<typeof useGraphStore.getState>;
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

	it("zooms on = and _ as well as + and -", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const zoomIn: Record<string, { min: number; max: number }> = {};
		applyKeyboardZoom(state, new Set(["="]), zoomIn, {});
		expect(zoomIn.x1).toEqual({ min: 7.5, max: 92.5 });
		const zoomOut: Record<string, { min: number; max: number }> = {};
		applyKeyboardZoom(state, new Set(["_"]), zoomOut, {});
		expect(zoomOut.x1.min).toBeCloseTo(-7.5);
	});
});

describe("stepAxisTarget", () => {
	const axis = { id: "a", min: 0, max: 100 };

	it("pans one axis by 5% of its range in either direction", () => {
		const targets: Record<string, { min: number; max: number }> = {};
		stepAxisTarget(targets, axis, "pan+");
		expect(targets.a).toEqual({ min: 5, max: 105 });
		stepAxisTarget(targets, axis, "pan-");
		stepAxisTarget(targets, axis, "pan-");
		expect(targets.a.min).toBeCloseTo(-5);
		expect(targets.a.max).toBeCloseTo(95);
	});

	it("zooms about the centre of the pending target", () => {
		const targets = { a: { min: 10, max: 110 } };
		stepAxisTarget(targets, axis, "zoom-in");
		expect(targets.a.min).toBeCloseTo(17.5);
		expect(targets.a.max).toBeCloseTo(102.5);
		stepAxisTarget(targets, axis, "zoom-out");
		expect(targets.a.max - targets.a.min).toBeCloseTo(85 * 1.15);
	});

	it("leaves other axes' targets alone", () => {
		const other = { min: 1, max: 2 };
		const targets = { other };
		stepAxisTarget(targets, axis, "pan+");
		expect(targets.other).toBe(other);
	});
});

describe("axisStepForKey", () => {
	it("maps only the axis' own arrow pair to pans", () => {
		expect(axisStepForKey("ArrowRight", "x")).toBe("pan+");
		expect(axisStepForKey("ArrowLeft", "x")).toBe("pan-");
		expect(axisStepForKey("ArrowUp", "x")).toBeNull();
		expect(axisStepForKey("ArrowUp", "y")).toBe("pan+");
		expect(axisStepForKey("ArrowDown", "y")).toBe("pan-");
		expect(axisStepForKey("ArrowLeft", "y")).toBeNull();
	});

	it("maps +/= and -/_ to zoom on either kind", () => {
		for (const kind of ["x", "y"] as const) {
			expect(axisStepForKey("+", kind)).toBe("zoom-in");
			expect(axisStepForKey("=", kind)).toBe("zoom-in");
			expect(axisStepForKey("-", kind)).toBe("zoom-out");
			expect(axisStepForKey("_", kind)).toBe("zoom-out");
		}
		expect(axisStepForKey("a", "x")).toBeNull();
	});
});

describe("releaseNavigationKeys", () => {
	it("drops pan/zoom keys but keeps modifiers and unrelated keys", () => {
		const keys = new Set(["ArrowLeft", "ArrowUp", "+", "_", "Control", "c"]);
		releaseNavigationKeys(keys);
		expect([...keys].sort()).toEqual(["Control", "c"]);
	});

	it("turns a held key into exactly one step per press", () => {
		const state = {
			xAxes: [{ id: "x1", min: 0, max: 100 }],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		const keys = new Set(["ArrowRight"]);
		const targets: Record<string, { min: number; max: number }> = {};
		// Two rAF frames with the key still physically held.
		for (let frame = 0; frame < 2; frame++) {
			if (applyKeyboardPan(state, keys, targets, {})) {
				releaseNavigationKeys(keys);
			}
		}
		expect(targets.x1).toEqual({ min: 5, max: 105 });
	});
});

describe("stepAxisTarget on a log axis", () => {
	it("pans and zooms in log10 space", () => {
		const targets: Record<string, { min: number; max: number }> = {};
		const axis = { id: "a", min: 1, max: 1000, scale: "log" as const };
		stepAxisTarget(targets, axis, "pan+");
		// 5% of 3 decades.
		expect(Math.log10(targets.a.min)).toBeCloseTo(0.15);
		expect(Math.log10(targets.a.max)).toBeCloseTo(3.15);
		stepAxisTarget(targets, axis, "zoom-out");
		expect(targets.a.min).toBeGreaterThan(0);
		// Zoom keeps the geometric centre.
		expect(Math.log10(targets.a.min) + Math.log10(targets.a.max)).toBeCloseTo(
			3.3,
		);
	});
});
