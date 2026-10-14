import { afterEach, describe, expect, it, vi } from "vitest";

function stubMatchMedia(matches: boolean) {
	let listener: ((e: { matches: boolean }) => void) | undefined;
	const matchMedia = vi.fn(() => ({
		matches,
		addEventListener: (_: string, cb: (e: { matches: boolean }) => void) => {
			listener = cb;
		},
	}));
	vi.stubGlobal("matchMedia", matchMedia);
	return {
		matchMedia,
		change: (next: boolean) => listener?.({ matches: next }),
	};
}

async function load() {
	vi.resetModules();
	return import("../reducedMotion");
}

describe("prefersReducedMotion", () => {
	afterEach(() => vi.unstubAllGlobals());

	it("reads the media query once at load", async () => {
		const { matchMedia } = stubMatchMedia(true);
		const { prefersReducedMotion } = await load();
		expect(prefersReducedMotion()).toBe(true);
		prefersReducedMotion();
		prefersReducedMotion();
		expect(matchMedia).toHaveBeenCalledTimes(1);
		expect(matchMedia).toHaveBeenCalledWith("(prefers-reduced-motion: reduce)");
	});

	it("follows later changes through the change listener", async () => {
		const mq = stubMatchMedia(false);
		const { prefersReducedMotion } = await load();
		expect(prefersReducedMotion()).toBe(false);
		mq.change(true);
		expect(prefersReducedMotion()).toBe(true);
		mq.change(false);
		expect(prefersReducedMotion()).toBe(false);
	});

	it("defaults to full motion where matchMedia is unavailable", async () => {
		vi.stubGlobal("matchMedia", undefined);
		const { prefersReducedMotion } = await load();
		expect(prefersReducedMotion()).toBe(false);
	});
});
