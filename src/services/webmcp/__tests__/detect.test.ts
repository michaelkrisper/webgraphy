import { afterEach, describe, expect, it, vi } from "vitest";
import {
	getModelContext,
	injectOriginTrialToken,
	type ModelContext,
	startWebMcp,
} from "../detect";

const registerWebMcpTools = vi.fn();
vi.mock("../register", () => ({ registerWebMcpTools }));

const install = (target: object, value: unknown) =>
	Object.defineProperty(target, "modelContext", { value, configurable: true });

const fake = (): ModelContext => ({ registerTool: vi.fn() });

afterEach(() => {
	delete (document as { modelContext?: unknown }).modelContext;
	delete (navigator as { modelContext?: unknown }).modelContext;
	for (const m of document.head.querySelectorAll(
		'meta[http-equiv="origin-trial"]',
	))
		m.remove();
	vi.unstubAllEnvs();
	registerWebMcpTools.mockClear();
});

describe("getModelContext", () => {
	it("is null without the API", () => {
		expect(getModelContext()).toBeNull();
	});

	it("prefers document.modelContext over the deprecated navigator one", () => {
		const doc = fake();
		install(document, doc);
		install(navigator, fake());
		expect(getModelContext()).toBe(doc);
	});

	it("falls back to navigator.modelContext", () => {
		const nav = fake();
		install(navigator, nav);
		expect(getModelContext()).toBe(nav);
	});

	it("ignores an object without registerTool", () => {
		install(document, { provideContext: vi.fn() });
		expect(getModelContext()).toBeNull();
	});
});

describe("startWebMcp", () => {
	const metas = () =>
		document.head.querySelectorAll<HTMLMetaElement>(
			'meta[http-equiv="origin-trial"]',
		);

	it("injects the origin-trial token as a meta tag", () => {
		injectOriginTrialToken("abc");
		expect(metas()).toHaveLength(1);
		expect(metas()[0].content).toBe("abc");
	});

	it("does nothing, and loads nothing, without the API or a token", async () => {
		startWebMcp(undefined);
		await vi.dynamicImportSettled();
		expect(metas()).toHaveLength(0);
		expect(registerWebMcpTools).not.toHaveBeenCalled();
	});

	it("reads the build-time token before probing", async () => {
		vi.stubEnv("VITE_WEBMCP_OT_TOKEN", "from-env");
		startWebMcp();
		expect(metas()[0].content).toBe("from-env");
	});

	it("loads and registers the tools when the API exists", async () => {
		const mc = fake();
		install(document, mc);
		startWebMcp("tok");
		await vi.dynamicImportSettled();
		await vi.waitFor(() => expect(registerWebMcpTools).toHaveBeenCalledWith(mc));
		expect(metas()).toHaveLength(1);
	});
});
