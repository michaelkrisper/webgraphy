import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, THEME_CYCLE, THEMES, type ThemeName } from "./themes";

describe("COLOR_PALETTE configuration", () => {
	it("should have expected length", () => {
		expect(COLOR_PALETTE).toHaveLength(6);
	});

	it("should contain valid hex color strings", () => {
		for (const color of COLOR_PALETTE) {
			expect(typeof color).toBe("string");
			expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
		}
	});

	it("should not contain duplicate colors", () => {
		expect(new Set(COLOR_PALETTE).size).toBe(COLOR_PALETTE.length);
	});
});

describe("THEMES configuration", () => {
	it("should have all themes from THEMES included in THEME_CYCLE", () => {
		const themeKeys = Object.keys(THEMES) as ThemeName[];

		// Ensure THEME_CYCLE contains all keys from THEMES
		expect([...THEME_CYCLE].sort()).toEqual(themeKeys.sort());
	});

	it("should have consistent structure across all themes", () => {
		const referenceTheme = THEMES.light;
		const expectedKeys = Object.keys(referenceTheme).sort();

		for (const themeName of THEME_CYCLE) {
			const theme = THEMES[themeName];
			const actualKeys = Object.keys(theme).sort();

			// Verify exact same properties
			expect(actualKeys).toEqual(expectedKeys);

			// Verify all properties are strings
			for (const key of actualKeys) {
				const propValue = theme[key as keyof typeof theme];
				expect(typeof propValue).toBe("string");
				// Additionally verify it's not empty, as per initial analysis thoughts, though just type is ok.
				expect(propValue).not.toBe("");
			}
		}
	});
});
