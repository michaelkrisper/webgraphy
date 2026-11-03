import { describe, expect, it, vi } from "vitest";
import { watchContextLoss } from "../contextLoss";

describe("watchContextLoss", () => {
	it("cancels context loss so the browser will restore it", () => {
		const canvas = document.createElement("canvas");
		const lost = vi.fn();
		watchContextLoss(canvas, { lost, restored: vi.fn() });
		const ev = new Event("webglcontextlost", { cancelable: true });
		canvas.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(lost).toHaveBeenCalledTimes(1);
	});

	it("forwards restore and stops listening after unsubscribe", () => {
		const canvas = document.createElement("canvas");
		const handlers = { lost: vi.fn(), restored: vi.fn() };
		const stop = watchContextLoss(canvas, handlers);
		canvas.dispatchEvent(new Event("webglcontextrestored"));
		expect(handlers.restored).toHaveBeenCalledTimes(1);
		stop();
		canvas.dispatchEvent(new Event("webglcontextrestored"));
		const ev = new Event("webglcontextlost", { cancelable: true });
		canvas.dispatchEvent(ev);
		expect(handlers.restored).toHaveBeenCalledTimes(1);
		expect(handlers.lost).not.toHaveBeenCalled();
		expect(ev.defaultPrevented).toBe(false);
	});
});
