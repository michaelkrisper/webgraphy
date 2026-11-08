import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end smoke tests against a real browser.
 *
 * These exist because the unit suite runs in jsdom, which has no WebGL2: the
 * renderer, both GLSL programs and the OffscreenCanvas worker backend are
 * never executed there. Headless Chromium does run them, so this is the only
 * place a shader that fails to compile, or a chart drawn at the wrong scale,
 * can be caught.
 *
 * Deliberately small. The goal is a tripwire on what unit tests structurally
 * cannot reach, not a second test pyramid.
 */
export default defineConfig({
	testDir: "./e2e",
	// The whole suite is a smoke test; a slow one signals a real problem.
	timeout: 30_000,
	expect: {
		timeout: 10_000,
		toHaveScreenshot: {
			// A chart is mostly empty background, so the pixel ratio has to be
			// small to mean anything: a series line displaced right across the
			// plot still only touches ~1.4 % of the image. An earlier 2 % budget
			// silently passed a deliberately broken vertex shader.
			//
			// Antialiasing noise between machines is absorbed by `threshold`
			// (per-pixel colour distance) instead, which is the right knob for
			// it — the ratio then only has to cover genuinely changed pixels.
			maxDiffPixelRatio: 0.002,
			threshold: 0.25,
		},
	},
	// A screenshot that only passes on a retry is not a passing screenshot.
	retries: process.env.CI ? 1 : 0,
	workers: 1,
	reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
	use: {
		baseURL: "http://localhost:4173",
		trace: "retain-on-failure",
		screenshot: "only-on-failure",
		// Fixed viewport: screenshot baselines are meaningless otherwise.
		viewport: { width: 1280, height: 800 },
	},
	projects: [
		{
			name: "chromium",
			use: { ...devices["Desktop Chrome"] },
		},
	],
	webServer: {
		// Tests the production bundle, not the dev server — that is what
		// actually ships, service worker and all.
		command: "npm run preview -- --port 4173 --strictPort",
		url: "http://localhost:4173",
		reuseExistingServer: !process.env.CI,
		timeout: 60_000,
	},
});
