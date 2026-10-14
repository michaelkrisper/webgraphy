import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistence } from "../../services/persistence";
import { flushPendingSaves, useGraphStore } from "../useGraphStore";

vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		saveAppState: vi.fn().mockResolvedValue(undefined),
		saveViewport: vi.fn().mockResolvedValue(undefined),
		saveConfig: vi.fn().mockResolvedValue(undefined),
		flushAll: vi.fn().mockResolvedValue(undefined),
	},
}));

describe("flushPendingSaves", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
		useGraphStore.setState({ isLoaded: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("writes the pending viewport/config now and cancels the debounced write", async () => {
		useGraphStore.getState().updateXAxis("axis-1", { min: 5, max: 7 });
		await flushPendingSaves();

		expect(persistence.saveAppState).toHaveBeenCalledWith(
			expect.objectContaining({
				xAxes: expect.arrayContaining([
					expect.objectContaining({ id: "axis-1", min: 5, max: 7 }),
				]),
				series: useGraphStore.getState().series,
			}),
		);
		expect(persistence.flushAll).toHaveBeenCalled();

		await vi.runAllTimersAsync();
		expect(persistence.saveViewport).not.toHaveBeenCalled();
		expect(persistence.saveConfig).not.toHaveBeenCalled();
	});

	it("does not write app state before persisted state has loaded", async () => {
		useGraphStore.setState({ isLoaded: false });
		await flushPendingSaves();
		expect(persistence.saveAppState).not.toHaveBeenCalled();
		expect(persistence.flushAll).toHaveBeenCalled();
	});
});
