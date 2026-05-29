import { describe, expect, it } from "vitest";
import {
	MAX_PIXEL_BUDGET_MULT,
	MIN_PIXEL_BUDGET_MULT,
	updatePixelBudget,
} from "../pixelBudget";

const ref = (current: number) => ({ current });

describe("updatePixelBudget", () => {
	it("waits at least 33ms between updates", () => {
		const lastUpdate = ref(0);
		const budget = ref(48);
		// frame time is well above target but only 10ms since last update
		updatePixelBudget(100, 10, lastUpdate, budget);
		expect(budget.current).toBe(48);
		expect(lastUpdate.current).toBe(0);
	});

	it("scales the budget down by 20% when the frame time exceeds the target", () => {
		const lastUpdate = ref(0);
		const budget = ref(50);
		updatePixelBudget(25, 33, lastUpdate, budget); // > 20ms target
		expect(budget.current).toBeCloseTo(40, 10);
		expect(lastUpdate.current).toBe(33);
	});

	it("clamps the down-scale at MIN_PIXEL_BUDGET_MULT", () => {
		const lastUpdate = ref(0);
		const budget = ref(MIN_PIXEL_BUDGET_MULT);
		updatePixelBudget(100, 33, lastUpdate, budget);
		expect(budget.current).toBe(MIN_PIXEL_BUDGET_MULT);
	});

	it("scales the budget up by 20% when the frame time is well under half the target", () => {
		const lastUpdate = ref(0);
		const budget = ref(40);
		updatePixelBudget(5, 33, lastUpdate, budget); // < 10ms (half target)
		expect(budget.current).toBeCloseTo(48, 10);
	});

	it("clamps the up-scale at MAX_PIXEL_BUDGET_MULT", () => {
		const lastUpdate = ref(0);
		const budget = ref(MAX_PIXEL_BUDGET_MULT);
		updatePixelBudget(1, 33, lastUpdate, budget);
		expect(budget.current).toBe(MAX_PIXEL_BUDGET_MULT);
	});

	it("leaves the budget unchanged in the comfortable middle band", () => {
		const lastUpdate = ref(0);
		const budget = ref(50);
		updatePixelBudget(15, 33, lastUpdate, budget); // between half-target and target
		expect(budget.current).toBe(50);
		// lastUpdate is still advanced
		expect(lastUpdate.current).toBe(33);
	});
});
