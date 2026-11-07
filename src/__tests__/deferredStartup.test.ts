import { describe, expect, it, vi } from "vitest";

const registerServiceWorker = vi.fn();
const countPageview = vi.fn();
const startWebMcp = vi.fn();
vi.mock("../registerServiceWorker", () => ({ registerServiceWorker }));
vi.mock("../services/analytics", () => ({ countPageview }));
vi.mock("../services/webmcp/detect", () => ({ startWebMcp }));

describe("runDeferredStartup", () => {
	it("starts the service worker, the pageview beacon and the WebMCP check", async () => {
		const { runDeferredStartup } = await import("../deferredStartup");
		runDeferredStartup();
		expect(registerServiceWorker).toHaveBeenCalledOnce();
		expect(countPageview).toHaveBeenCalledOnce();
		expect(startWebMcp).toHaveBeenCalledOnce();
	});
});
