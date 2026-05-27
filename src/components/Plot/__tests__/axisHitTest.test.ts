import { describe, expect, it } from "vitest";
import { hitTestXAxis, hitTestYAxis } from "../axisHitTest";

const padding = { top: 20, right: 50, bottom: 60, left: 80 };
const width = 1000;
const height = 500;

describe("hitTestYAxis", () => {
	const base = {
		width,
		height,
		padding,
		leftAxes: [{ id: "L0" }, { id: "L1" }],
		rightAxes: [{ id: "R0" }],
		axisLayout: {
			L0: { total: 40 },
			L1: { total: 30 },
			R0: { total: 50 },
		},
	};

	it("returns null outside the plot's vertical band", () => {
		expect(hitTestYAxis(60, padding.top - 1, base)).toBeNull();
		expect(hitTestYAxis(60, height - padding.bottom + 1, base)).toBeNull();
	});

	it("hits the first left axis gutter adjacent to the plot", () => {
		// L0 occupies [left-40, left] = [40, 80]
		expect(hitTestYAxis(60, 200, base)).toBe("L0");
		expect(hitTestYAxis(80, 200, base)).toBe("L0");
	});

	it("hits the second (outer) left axis gutter", () => {
		// L1 occupies [left-40-30, left-40] = [10, 40]
		expect(hitTestYAxis(20, 200, base)).toBe("L1");
	});

	it("hits the right axis gutter", () => {
		// R0 occupies [width-right, width-right+50] = [950, 1000]
		expect(hitTestYAxis(970, 200, base)).toBe("R0");
	});

	it("returns null in the plot interior between the gutters", () => {
		expect(hitTestYAxis(500, 200, base)).toBeNull();
	});

	it("falls back to a default gutter width when layout is missing", () => {
		const params = { ...base, axisLayout: {} };
		// default total 40 -> L0 occupies [40, 80]
		expect(hitTestYAxis(50, 200, params)).toBe("L0");
	});
});

describe("hitTestXAxis", () => {
	const base = {
		width,
		height,
		padding,
		xAxesMetrics: [
			{ id: "X0", height: 30, cumulativeOffset: 0 },
			{ id: "X1", height: 25, cumulativeOffset: 30 },
		],
	};

	it("returns null outside the plot's horizontal band", () => {
		expect(hitTestXAxis(padding.left - 1, 460, base)).toBeNull();
		expect(hitTestXAxis(width - padding.right + 1, 460, base)).toBeNull();
	});

	it("hits the first x-axis row directly below the plot", () => {
		// baseY = height - bottom = 440, row [440, 470]
		expect(hitTestXAxis(500, 440, base)).toBe("X0");
		expect(hitTestXAxis(500, 469, base)).toBe("X0");
	});

	it("hits the stacked second x-axis row", () => {
		// baseY = 440 + 30 = 470, row [470, 495]
		expect(hitTestXAxis(500, 480, base)).toBe("X1");
	});

	it("returns null above the first row (inside the plot)", () => {
		expect(hitTestXAxis(500, 400, base)).toBeNull();
	});
});
