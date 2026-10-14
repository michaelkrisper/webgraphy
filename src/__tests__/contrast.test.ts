import { describe, expect, it } from "vitest";
import { COLOR_PALETTE, THEMES, type ThemeName } from "../themes";
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

	it.each(themeNames)(
		"%s: the focus ring is visible on every surface it lands on",
		(name) => {
			const t = THEMES[name];
			// The ring is drawn in `accent` with an offset, so it reads against
			// the surface behind the control rather than the control's own fill.
			// WCAG 1.4.11 asks 3:1 for a non-text indicator. Guards the CSS rule
			// in index.css: recolouring a theme must not blind the keyboard user.
			for (const surface of [t.bg, t.bg2, t.bg3, t.plotBg]) {
				expect(contrastRatio(t.accent, surface)).toBeGreaterThanOrEqual(AA_LARGE);
			}
		},
	);

	it("computes known contrast ratios correctly", () => {
		// Sanity check on the maths itself, against the two textbook extremes.
		expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
		expect(contrastRatio("#ffffff", "#ffffff")).toBeCloseTo(1, 5);
	});

	it.each(themeNames)(
		"%s: every series palette colour is visible on the plot",
		(name) => {
			// A series line is a non-text graphic: WCAG 1.4.11 asks 3:1.
			const plotBg = THEMES[name].plotBg;
			for (const color of COLOR_PALETTE) {
				expect(
					contrastRatio(color, plotBg),
					`${color} on ${plotBg}`,
				).toBeGreaterThanOrEqual(AA_LARGE);
			}
		},
	);
});

/**
 * Colour-vision deficiency simulation (Machado, Oliveira & Fernandes 2009,
 * severity 1.0), applied in linear sRGB, then compared in CIELAB.
 */
const CVD_MATRICES = {
	normal: [
		[1, 0, 0],
		[0, 1, 0],
		[0, 0, 1],
	],
	protanopia: [
		[0.152286, 1.052583, -0.204868],
		[0.114503, 0.786281, 0.099216],
		[-0.003882, -0.048116, 1.051998],
	],
	deuteranopia: [
		[0.367322, 0.860646, -0.227968],
		[0.280085, 0.672501, 0.047413],
		[-0.01182, 0.04294, 0.968881],
	],
	tritanopia: [
		[1.255528, -0.076749, -0.178779],
		[-0.078411, 0.930809, 0.147602],
		[0.004733, 0.691367, 0.3039],
	],
} as const;

function toLinear(v: number): number {
	const s = v / 255;
	return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function simulatedLab(
	hex: string,
	m: readonly (readonly number[])[],
): [number, number, number] {
	const { r, g, b } = hexToRgb(hex);
	const lin = [toLinear(r), toLinear(g), toLinear(b)];
	const [R, G, B] = m.map((row) =>
		Math.min(1, Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2])),
	);
	const X = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
	const Y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
	const Z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
	const f = (t: number) =>
		t > 216 / 24389 ? Math.cbrt(t) : ((24389 / 27) * t + 16) / 116;
	return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}

/** Smallest CIE76 ΔE between any two palette colours. */
function minPairwiseDeltaE(
	palette: readonly string[],
	m: readonly (readonly number[])[],
): number {
	const labs = palette.map((c) => simulatedLab(c, m));
	let min = Infinity;
	for (let i = 0; i < labs.length; i++) {
		for (let j = i + 1; j < labs.length; j++) {
			const [a, b] = [labs[i], labs[j]];
			min = Math.min(min, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
		}
	}
	return min;
}

describe("series palette distinguishability", () => {
	// ~10 is where two thin plot lines stop reading as the same colour; the
	// previous palette had cobalt/violet at 6.5 under deuteranopia.
	const MIN_DELTA_E = 15;

	it.each(Object.keys(CVD_MATRICES) as (keyof typeof CVD_MATRICES)[])(
		"no two colours collapse under %s",
		(vision) => {
			expect(
				minPairwiseDeltaE(COLOR_PALETTE, CVD_MATRICES[vision]),
			).toBeGreaterThanOrEqual(MIN_DELTA_E);
		},
	);

	it("simulation sanity: red and green merge under deuteranopia", () => {
		const m = CVD_MATRICES.deuteranopia;
		expect(minPairwiseDeltaE(["#cc3333", "#669900"], m)).toBeLessThan(
			minPairwiseDeltaE(["#cc3333", "#669900"], CVD_MATRICES.normal) / 3,
		);
	});
});
