import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "../../../store/useGraphStore";
import { logger } from "../../../utils/logger";
import type { ModelContext, ModelContextTool } from "../detect";
import { registerWebMcpTools } from "../register";

vi.mock("../../persistence", () => ({ persistence: {} }));

function fakeModelContext(impl: ModelContext["registerTool"] = async () => {}) {
	const calls: { tool: ModelContextTool; signal?: AbortSignal }[] = [];
	const mc: ModelContext = {
		registerTool: vi.fn((tool, options) => {
			calls.push({ tool, signal: options?.signal });
			return impl(tool, options);
		}),
	};
	return { mc, calls };
}

const pageshow = (persisted: boolean) => {
	const e = new Event("pageshow") as PageTransitionEvent;
	Object.defineProperty(e, "persisted", { value: persisted });
	window.dispatchEvent(e);
};

let dispose: () => void = () => {};

beforeEach(() => {
	useGraphStore.setState({ isLoaded: true });
});

afterEach(() => {
	dispose();
	vi.restoreAllMocks();
});

describe("registerWebMcpTools", () => {
	it("registers every tool with one shared signal", () => {
		const { mc, calls } = fakeModelContext();
		dispose = registerWebMcpTools(mc);
		expect(calls.map((c) => c.tool.name)).toContain("get_workspace");
		expect(calls).toHaveLength(11);
		const [first] = calls;
		expect(first.signal).toBeInstanceOf(AbortSignal);
		expect(calls.every((c) => c.signal === first.signal)).toBe(true);
	});

	it("is idempotent until disposed", () => {
		const { mc } = fakeModelContext();
		dispose = registerWebMcpTools(mc);
		const second = registerWebMcpTools(mc);
		second();
		expect(mc.registerTool).toHaveBeenCalledTimes(11);
		dispose();
		dispose = registerWebMcpTools(mc);
		expect(mc.registerTool).toHaveBeenCalledTimes(22);
	});

	it("waits for the store to load", () => {
		useGraphStore.setState({ isLoaded: false });
		const { mc } = fakeModelContext();
		dispose = registerWebMcpTools(mc);
		useGraphStore.setState({ legendVisible: false });
		expect(mc.registerTool).not.toHaveBeenCalled();
		useGraphStore.setState({ isLoaded: true });
		expect(mc.registerTool).toHaveBeenCalledTimes(11);
		useGraphStore.setState({ isLoaded: false });
		useGraphStore.setState({ isLoaded: true });
		expect(mc.registerTool).toHaveBeenCalledTimes(11);
	});

	it("does not register when disposed before the load", () => {
		useGraphStore.setState({ isLoaded: false });
		const { mc } = fakeModelContext();
		registerWebMcpTools(mc)();
		useGraphStore.setState({ isLoaded: true });
		expect(mc.registerTool).not.toHaveBeenCalled();
	});

	it("unregisters on pagehide and re-registers on a bfcache restore", () => {
		const { mc, calls } = fakeModelContext();
		dispose = registerWebMcpTools(mc);
		const first = calls[0].signal;
		window.dispatchEvent(new Event("pagehide"));
		expect(first?.aborted).toBe(true);

		pageshow(false);
		expect(calls).toHaveLength(11);
		pageshow(true);
		expect(calls).toHaveLength(22);
		const second = calls[11].signal;
		expect(second?.aborted).toBe(false);
		pageshow(true);
		expect(calls).toHaveLength(22);

		dispose();
		expect(second?.aborted).toBe(true);
		window.dispatchEvent(new Event("pagehide"));
		pageshow(true);
		expect(calls).toHaveLength(22);
	});

	it("rolls the whole set back when one registration fails", async () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const { mc, calls } = fakeModelContext(async (tool) => {
			if (tool.name === "undo") throw new DOMException("dup", "InvalidStateError");
		});
		dispose = registerWebMcpTools(mc);
		await vi.waitFor(() => expect(warn).toHaveBeenCalled());
		expect(calls[0].signal?.aborted).toBe(true);
	});

	it("survives a registerTool that throws synchronously", async () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		const { mc, calls } = fakeModelContext(() => {
			throw new TypeError("not allowed");
		});
		dispose = registerWebMcpTools(mc);
		await vi.waitFor(() =>
			expect(warn).toHaveBeenCalledWith(
				"WebMCP tool registration failed",
				expect.any(TypeError),
			),
		);
		expect(calls[0].signal?.aborted).toBe(true);
	});

	it("keeps a newer registration when an old one fails late", async () => {
		const warn = vi.spyOn(logger, "warn").mockImplementation(() => {});
		let rejectFirst: (e: Error) => void = () => {};
		let n = 0;
		const { mc, calls } = fakeModelContext(() => {
			n++;
			if (n === 1)
				return new Promise<void>((_, reject) => {
					rejectFirst = reject;
				});
			return Promise.resolve();
		});
		dispose = registerWebMcpTools(mc);
		window.dispatchEvent(new Event("pagehide"));
		pageshow(true);
		rejectFirst(new Error("late"));
		await vi.waitFor(() => expect(warn).toHaveBeenCalled());
		expect(calls[11].signal?.aborted).toBe(false);
	});
});
