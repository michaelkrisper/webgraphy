import { expect, test, type Page } from "@playwright/test";
import { THEMES, type ThemeName } from "../src/themes";

/**
 * Focus visibility, in a real browser.
 *
 * jsdom cannot judge this: it has no layout and no `:focus-visible`
 * heuristic, so the only place the app's focus ring can be observed is here.
 * The app previously defined no `:focus` rule at all and inherited whatever
 * ring the UA chose — a colour with no relationship to the five themes.
 * These tests pin that the ring is the app's own and that it stays off for
 * pointer users.
 */

const themeNames = Object.keys(THEMES) as ThemeName[];

/** `rgb(r, g, b)` as getComputedStyle reports it, from a theme hex. */
function toRgb(hex: string): string {
	const h = hex.replace("#", "");
	const n = Number.parseInt(
		h.length === 3
			? h
					.split("")
					.map((c) => c + c)
					.join("")
			: h,
		16,
	);
	return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

async function openWithTheme(page: Page, theme: ThemeName) {
	await page.addInitScript((t) => {
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
		localStorage.setItem("theme", t);
	}, theme);
	await page.goto("/");
	await expect(page.getByRole("img", { name: /Line chart/ })).toBeVisible();
}

/** Tabs until a real button holds focus, so the ring is read off a control. */
async function tabToButton(page: Page) {
	for (let i = 0; i < 30; i++) {
		await page.keyboard.press("Tab");
		const tag = await page.evaluate(() => document.activeElement?.tagName);
		if (tag === "BUTTON") return;
	}
	throw new Error("no button reachable by Tab within 30 stops");
}

function outlineOf(page: Page) {
	return page.evaluate(() => {
		const el = document.activeElement;
		if (!el) return null;
		const s = getComputedStyle(el);
		return {
			name: el.getAttribute("aria-label") ?? el.textContent?.trim() ?? "",
			color: s.outlineColor,
			width: s.outlineWidth,
			style: s.outlineStyle,
		};
	});
}

for (const theme of themeNames) {
	test(`${theme}: a keyboard-focused control shows the theme's focus ring`, async ({
		page,
	}) => {
		await openWithTheme(page, theme);
		await tabToButton(page);

		const o = await outlineOf(page);
		expect(o, "no element focused").not.toBeNull();
		// The ring must be the app's accent, not the UA default: that is what
		// ties it to the theme and gives it a measured contrast ratio (the
		// 3:1 floor is asserted in the theme contrast unit tests).
		expect(o!.color).toBe(toRgb(THEMES[theme].accent));
		expect(Number.parseFloat(o!.width)).toBeGreaterThanOrEqual(2);
		expect(o!.style).not.toBe("none");
	});
}

test("a mouse-clicked control shows no focus ring", async ({ page }) => {
	await openWithTheme(page, "light");

	// Find a button, then reach it with the pointer rather than the keyboard.
	await tabToButton(page);
	const focused = await page.evaluate(() => {
		const el = document.activeElement as HTMLElement;
		el.dataset.focusProbe = "1";
		el.blur();
		return true;
	});
	expect(focused).toBe(true);

	await page.locator("[data-focus-probe]").click();
	const o = await outlineOf(page);
	// :focus-visible, not :focus — pointer users should not get rings.
	expect(
		o!.style === "none" || Number.parseFloat(o!.width) === 0,
		`pointer focus drew a ring: ${JSON.stringify(o)}`,
	).toBe(true);
});
