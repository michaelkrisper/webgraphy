import { describe, expect, it } from "vitest";
import { THEMES, type ThemeName } from "../themes";
import { hexToRgb } from "../utils/colors";

/**
 * WCAG contrast is arithmetic, so it can simply be checked rather than
 * eyeballed. This pins the pairings a user reads constantly — body text and
 * axis labels against their background — so a palette tweak cannot quietly
 * push them below the threshold in one theme while looking fine in another.
 */

/** WCAG 2.1 relative luminance. */
function luminance(hex: string): number {
	const { r, g, b } = hexToRgb(hex);
	const channel = (v: number) => {
		const s = v / 255;
		return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
	};
	return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrastRatio(a: string, b: string): number {
	const la = luminance(a);
	const lb = luminance(b);
	const [hi, lo] = la > lb ? [la, lb] : [lb, la];
	return (hi + 0.05) / (lo + 0.05);
}

const themeNames = Object.keys(THEMES) as ThemeName[];

/** WCAG AA for normal-size body text. */
const AA_NORMAL = 4.5;
/** WCAG AA for large text and for incidental UI such as axis tick labels. */
const AA_LARGE = 3;

describe("theme contrast", () => {
	it.each(themeNames)("%s: body text meets WCAG AA", (name) => {
		const t = THEMES[name];
		expect(contrastRatio(t.text, t.bg)).toBeGreaterThanOrEqual(AA_NORMAL);
	});

	it.each(themeNames)("%s: axis labels are legible", (name) => {
		const t = THEMES[name];
		// Tick labels are small but not body copy; AA large is the pragmatic
		// floor for them, and they sit on the plot background.
		expect(contrastRatio(t.labelColor, t.plotBg ?? t.bg)).toBeGreaterThanOrEqual(
			AA_LARGE,
		);
	});

	it.each(themeNames)(
		"%s: the accent colour is visible on the background",
		(name) => {
			const t = THEMES[name];
			expect(contrastRatio(t.accent, t.bg)).toBeGreaterThanOrEqual(AA_LARGE);
		},
	);

	it("computes known contrast ratios correctly", () => {
		// Sanity check on the maths itself, against the two textbook extremes.
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
		expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
	});
});
