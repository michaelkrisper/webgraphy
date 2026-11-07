import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
	THEME_COLOR_SCHEME,
	THEMES,
	type ThemeName,
	themeChromeColor,
} from "../themes";
import { hexToRgb } from "../utils/colors";

/**
 * The first paint happens before any script runs, so index.html and the PWA
 * manifest hard-code the chrome colours useTheme.ts sets later. These tests
 * keep the copies in step with src/themes.ts.
 */

const read = (path: string) =>
	readFileSync(new URL(path, import.meta.url), "utf8");

const metaContent = (html: string, attrs: string) =>
	new RegExp(`<meta name="theme-color" ${attrs} content="([^"]+)"`).exec(
		html,
	)?.[1];

describe("theme chrome colours", () => {
	const html = read("../../index.html");
	const viteConfig = read("../../vite.config.ts");

	it("index.html carries the light and dark chrome colours", () => {
		expect(metaContent(html, 'media="\\(prefers-color-scheme: light\\)"')).toBe(
			themeChromeColor("light"),
		);
		expect(metaContent(html, 'media="\\(prefers-color-scheme: dark\\)"')).toBe(
			themeChromeColor("dark"),
		);
		expect(html).toContain('<meta name="color-scheme" content="light dark">');
	});

	it("the manifest matches the light theme", () => {
		expect(/theme_color: "([^"]+)"/.exec(viteConfig)?.[1]).toBe(
			themeChromeColor("light"),
		);
		expect(/background_color: "([^"]+)"/.exec(viteConfig)?.[1]).toBe(
			THEMES.light.plotBg,
		);
	});

	it.each(Object.keys(THEMES) as ThemeName[])(
		"%s: the native colour scheme matches the theme's surfaces",
		(name) => {
			// Native controls drawn in the wrong scheme (a white select on Matrix)
			// are what color-scheme is there to prevent.
			const { r, g, b } = hexToRgb(THEMES[name].bg);
			const light = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.5;
			expect(THEME_COLOR_SCHEME[name]).toBe(light ? "light" : "dark");
		},
	);
});
