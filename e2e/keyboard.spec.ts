import { expect, test, type Page } from "@playwright/test";

/**
 * The keyboard path through the whole application, in a real browser.
 *
 * Unit tests prove individual controls are focusable and that the modal layer
 * traps focus. Neither says anything about the *sequence*: jsdom performs no
 * layout, so it cannot tell whether a stop is visible, where it sits on
 * screen, or whether the order between components makes sense. This walks the
 * document from the top the way a keyboard-only user does and asserts the run
 * reaches every surface needed to load data, configure a series and read the
 * chart.
 */

interface Stop {
	tag: string;
	name: string;
	testid: string;
	width: number;
	height: number;
}

async function freshApp(page: Page) {
	await page.addInitScript(() => {
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
	});
	await page.goto("/");
	await expect(page.getByRole("img", { name: /Line chart/ })).toBeVisible();
}

/** The focused element, described the way assistive technology would name it. */
function focused(page: Page): Promise<Stop | null> {
	return page.evaluate(() => {
		const el = document.activeElement as HTMLElement | null;
		if (!el || el === document.body) return null;
		const rect = el.getBoundingClientRect();
		return {
			tag: el.tagName,
			name: (
				el.getAttribute("aria-label") ??
				el.getAttribute("title") ??
				el.textContent ??
				""
			)
				.trim()
				.replace(/\s+/g, " "),
			testid: el.className?.toString() ?? "",
			width: rect.width,
			height: rect.height,
		};
	});
}

/** Tab from the top of the document until focus leaves the page again. */
async function tabThrough(page: Page, limit = 120): Promise<Stop[]> {
	await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
	const stops: Stop[] = [];
	for (let i = 0; i < limit; i++) {
		await page.keyboard.press("Tab");
		const stop = await focused(page);
		if (!stop) break;
		stops.push(stop);
	}
	return stops;
}

/** Index of the first stop whose accessible name matches. */
function indexOf(stops: Stop[], name: RegExp): number {
	return stops.findIndex((s) => name.test(s.name));
}

/** Reads the axis ranges out of the plot's accessible description. */
function axisLabel(page: Page): Promise<string> {
	return page
		.getByRole("img", { name: /Line chart|Empty chart/ })
		.getAttribute("aria-label")
		.then((v) => v ?? "");
}

test("tabs through the whole interface in a usable order", async ({ page }) => {
	await freshApp(page);
	const stops = await tabThrough(page);

	// A run that never leaves the page means the walk hit the limit rather
	// than the end of the document.
	expect(stops.length).toBeGreaterThan(10);
	expect(stops.length).toBeLessThan(120);

	// Every stop must be announceable and actually on screen: a focusable
	// element with no name is a dead stop for a screen reader, and a
	// zero-sized one is a dead stop for everyone.
	for (const s of stops) {
		expect(s.name, `unnamed tab stop: ${JSON.stringify(s)}`).not.toBe("");
		expect(s.width * s.height, `zero-sized stop: ${s.name}`).toBeGreaterThan(0);
	}

	// The order that matters: read the chart, then its legend, then the
	// sidebar, and inside the sidebar sources before the series built on them.
	const plot = indexOf(stops, /^Line chart/);
	const fitAll = indexOf(stops, /^Fit All$/);
	const legend = indexOf(stops, /^Toggle visibility for /);
	const importData = indexOf(stops, /^Import Data Source$/);
	const sources = indexOf(stops, /^Data Sources$/);
	const series = indexOf(stops, /^Data Series$/);

	expect(plot, "the plot itself is not a tab stop").toBeGreaterThanOrEqual(0);
	expect(fitAll).toBeGreaterThan(plot);
	expect(legend).toBeGreaterThan(fitAll);
	expect(importData).toBeGreaterThan(legend);
	expect(sources).toBeGreaterThan(importData);
	expect(series).toBeGreaterThan(sources);

	// Every configured series must be reachable, not just the first row.
	const seriesStops = stops.filter((s) => /^Y Column for /.test(s.name));
	expect(seriesStops.length).toBe(4);
});

test("keyboard pan and zoom move the announced viewport", async ({ page }) => {
	await freshApp(page);

	// Reached the way a keyboard user reaches it, not by locator.
	await page.keyboard.press("Tab");
	expect((await focused(page))?.tag).toBe("CANVAS");

	const start = await axisLabel(page);

	await page.keyboard.down("ArrowRight");
	await page.waitForTimeout(400);
	await page.keyboard.up("ArrowRight");
	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(start);
	const panned = await axisLabel(page);

	await page.keyboard.down("+");
	await page.waitForTimeout(400);
	await page.keyboard.up("+");
	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(panned);
});

test("a dialog opened mid-path returns focus to its opener", async ({
	page,
}) => {
	await freshApp(page);

	const opener = page.getByRole("button", { name: "Help" });
	await opener.focus();
	await page.keyboard.press("Enter");

	// Focus must land inside the dialog, not stay behind it.
	await expect
		.poll(() => focused(page).then((s) => s?.name ?? ""))
		.toMatch(/Close Help/);

	await page.keyboard.press("Escape");
	await expect.poll(() => focused(page).then((s) => s?.name ?? "")).toBe("Help");
});

test("a popover opened mid-path is operable and hands focus back", async ({
	page,
}) => {
	await freshApp(page);

	// The pickers render through a portal at the end of the body, so without
	// focus management the next Tab walks past them into the rest of the page.
	const opener = page.getByRole("button", { name: "Select Line Style" }).first();
	const popover = page.locator('[id^="line-style-popover-"]');
	await opener.focus();
	await page.keyboard.press("Enter");

	await expect(popover).toBeVisible();
	const inside = await page.evaluate(
		() =>
			!!document
				.querySelector('[id^="line-style-popover-"]')
				?.contains(document.activeElement),
	);
	expect(inside, "focus did not move into the popover").toBe(true);

	await page.keyboard.press("Escape");
	await expect(popover).toHaveCount(0);
	await expect
		.poll(() => focused(page).then((s) => s?.name ?? ""))
		.toBe("Select Line Style");
});

test("the plotted data is reachable as a table without a mouse", async ({
	page,
}) => {
	await freshApp(page);

	await page.getByRole("button", { name: "View Data" }).focus();
	await page.keyboard.press("Enter");

	const tables = page.getByRole("table");
	await expect(tables.first()).toBeVisible();
	// One table per visible demo series, each bounded by MAX_TABLE_ROWS.
	await expect(tables).toHaveCount(4);
	expect(await page.getByRole("row").count()).toBeLessThanOrEqual(4 * 201);

	// The x column of the first row, which must follow the viewport.
	const firstCell = () => tables.first().getByRole("cell").first().innerText();
	const before = await firstCell();

	await page.keyboard.press("Escape");
	await expect(tables.first()).toBeHidden();

	// Zoom in from the plot, then reopen: the rows must describe the new
	// window, not the one the table was first built for.
	await page.keyboard.press("Tab");
	await page.keyboard.down("+");
	await page.waitForTimeout(500);
	await page.keyboard.up("+");
	await page.waitForTimeout(500);

	await page.getByRole("button", { name: "View Data" }).focus();
	await page.keyboard.press("Enter");
	await expect(tables.first()).toBeVisible();
	expect(await firstCell()).not.toBe(before);
});
