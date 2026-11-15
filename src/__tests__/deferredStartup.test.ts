import { describe, expect, it, vi } from "vitest";

const registerServiceWorker = vi.fn();
const startWebMcp = vi.fn();
vi.mock("../registerServiceWorker", () => ({ registerServiceWorker }));
vi.mock("../services/webmcp/detect", () => ({ startWebMcp }));

describe("runDeferredStartup", () => {
	it("starts the service worker and the WebMCP check", async () => {
		const { runDeferredStartup } = await import("../deferredStartup");
		runDeferredStartup();
		expect(registerServiceWorker).toHaveBeenCalledOnce();
		expect(startWebMcp).toHaveBeenCalledOnce();
	});
});
