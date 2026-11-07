import { describe, expect, it, vi } from "vitest";
import {
	registerViewportCommands,
	runViewportCommand,
} from "../viewportCommands";

const commands = () => ({ applyRange: vi.fn(), fitAll: vi.fn() });

describe("viewportCommands", () => {
	it("runs against the registered chart until it unregisters", () => {
		expect(runViewportCommand((c) => c.fitAll())).toBe(false);
		const chart = commands();
		const unregister = registerViewportCommands(chart);
		expect(
			runViewportCommand((c) => c.applyRange("x", "axis-1", { min: 0, max: 1 })),
		).toBe(true);
		expect(chart.applyRange).toHaveBeenCalledWith("x", "axis-1", {
			min: 0,
			max: 1,
		});
		unregister();
		expect(runViewportCommand((c) => c.fitAll())).toBe(false);
		expect(chart.fitAll).not.toHaveBeenCalled();
	});

	it("ignores a stale unregister after a newer chart registered", () => {
		const unregisterOld = registerViewportCommands(commands());
		const current = commands();
		const unregister = registerViewportCommands(current);
		unregisterOld();
		expect(runViewportCommand((c) => c.fitAll())).toBe(true);
		expect(current.fitAll).toHaveBeenCalledOnce();
		unregister();
	});
});
