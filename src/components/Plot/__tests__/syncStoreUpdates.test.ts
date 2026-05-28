import { describe, expect, it, vi } from "vitest";
import { AXIS_EPSILON } from "../../../utils/axisCalculations";
import { syncStoreUpdates } from "../syncStoreUpdates";

function makeState(xAxes: Array<{ id: string; min: number; max: number }>, yAxes: Array<{ id: string; min: number; max: number }>) {
	return {
		xAxes,
		yAxes,
		batchUpdateAxes: vi.fn(),
	};
}

describe("syncStoreUpdates", () => {
	it("does nothing when no axes moved beyond epsilon", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[{ id: "Y", min: 0, max: 100 }],
		);
		syncStoreUpdates(
			state,
			{ X: { min: 0, max: 10 } },
			{ Y: { min: 0, max: 100 } },
		);
		expect(state.batchUpdateAxes).not.toHaveBeenCalled();
	});

	it("ignores changes within epsilon", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[{ id: "Y", min: 0, max: 100 }],
		);
		const tinyDelta = AXIS_EPSILON / 2;
		syncStoreUpdates(
			state,
			{ X: { min: tinyDelta, max: 10 - tinyDelta } },
			{ Y: { min: tinyDelta, max: 100 - tinyDelta } },
		);
		expect(state.batchUpdateAxes).not.toHaveBeenCalled();
	});

	it("commits updates that exceed epsilon on min or max", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[{ id: "Y", min: 0, max: 100 }],
		);
		syncStoreUpdates(
			state,
			{ X: { min: 1, max: 10 } },
			{ Y: { min: 0, max: 100 } },
		);
		expect(state.batchUpdateAxes).toHaveBeenCalledExactlyOnceWith(
			{ X: { min: 1, max: 10 } },
			{},
		);
	});

	it("commits updates for axes missing from the store", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[],
		);
		syncStoreUpdates(
			state,
			{ ghost: { min: 5, max: 6 } },
			{},
		);
		expect(state.batchUpdateAxes).toHaveBeenCalledExactlyOnceWith(
			{ ghost: { min: 5, max: 6 } },
			{},
		);
	});

	it("filters per-axis: only changed axes are forwarded", () => {
		const state = makeState(
			[
				{ id: "X1", min: 0, max: 10 },
				{ id: "X2", min: 0, max: 20 },
			],
			[
				{ id: "Y1", min: 0, max: 100 },
				{ id: "Y2", min: 0, max: 200 },
			],
		);
		syncStoreUpdates(
			state,
			{
				X1: { min: 0, max: 10 }, // unchanged
				X2: { min: 1, max: 20 }, // moved
			},
			{
				Y1: { min: 0, max: 110 }, // moved
				Y2: { min: 0, max: 200 }, // unchanged
			},
		);
		expect(state.batchUpdateAxes).toHaveBeenCalledExactlyOnceWith(
			{ X2: { min: 1, max: 20 } },
			{ Y1: { min: 0, max: 110 } },
		);
	});

	it("commits when only Y changed (X stays {})", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[{ id: "Y", min: 0, max: 100 }],
		);
		syncStoreUpdates(
			state,
			{ X: { min: 0, max: 10 } },
			{ Y: { min: 5, max: 100 } },
		);
		expect(state.batchUpdateAxes).toHaveBeenCalledExactlyOnceWith(
			{},
			{ Y: { min: 5, max: 100 } },
		);
	});

	it("handles empty update objects", () => {
		const state = makeState(
			[{ id: "X", min: 0, max: 10 }],
			[{ id: "Y", min: 0, max: 100 }],
		);
		syncStoreUpdates(state, {}, {});
		expect(state.batchUpdateAxes).not.toHaveBeenCalled();
	});
});
