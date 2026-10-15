import { expect, type Page } from "@playwright/test";

/** Shared by the workflow specs (import.spec.ts, workspace.spec.ts). */

export const plotCanvas = (page: Page) =>
	page.locator('.plot-area canvas[role="img"]');

/** The plot's accessible name: series names plus the axis ranges. */
export async function chartLabel(page: Page): Promise<string> {
	return (await plotCanvas(page).getAttribute("aria-label")) ?? "";
}

/** Small deterministic CSV with strictly positive values (log-scale safe). */
export function fixtureCsv(rows = 200): string {
	const lines = ["Time,Sine,Growth"];
	for (let i = 0; i < rows; i++) {
		const sine = (Math.sin(i * 0.1) * 100).toFixed(4);
		const growth = Math.exp(i * 0.02).toFixed(4);
		lines.push(`${i},${sine},${growth}`);
	}
	return lines.join("\n");
}

/**
 * Starts from an empty workspace, not the random demo data. The reset runs
 * only on the first navigation of the tab, so a later `page.reload()` sees
 * whatever the app persisted.
 */
export async function emptyApp(page: Page) {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await page.addInitScript(() => {
		if (sessionStorage.getItem("e2e-reset")) return;
		sessionStorage.setItem("e2e-reset", "1");
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
		localStorage.setItem("webgraphy-cleared", "1");
	});
	await page.goto("/");
	await expect(plotCanvas(page)).toHaveAttribute("aria-label", /Empty chart/);
	return { errors };
}

/** Picks a file in the data-source input; the import dialog opens next. */
export async function chooseDataFile(
	page: Page,
	file: { name: string; mimeType: string; buffer: Buffer },
) {
	// The one behind "Import Data Source"; the sidebar also has a session-only
	// input, and the empty state its own.
	await page.locator('.sidebar section input[type="file"]').setInputFiles(file);
}

/** Confirms the import dialog with its default settings. */
export async function confirmImport(page: Page) {
	// Exact name: "Import Data Source" in the header also matches loosely.
	await page.getByRole("button", { name: "Import Data", exact: true }).click();
}

/** Imports a CSV with default settings and waits for `plotted` in the label. */
export async function importCsv(
	page: Page,
	name: string,
	csv: string,
	plotted: RegExp,
) {
	await chooseDataFile(page, {
		name,
		mimeType: "text/csv",
		buffer: Buffer.from(csv, "utf8"),
	});
	await confirmImport(page);
	await expect(plotCanvas(page)).toHaveAttribute("aria-label", plotted);
}

/** Imports `fixtureCsv()` and waits for both of its series to be plotted. */
export function importFixture(page: Page) {
	return importCsv(
		page,
		"fixture.csv",
		fixtureCsv(),
		/2 data series: Sine, Growth\./,
	);
}

/** The sidebar row of the series plotting `column`. */
export function seriesRow(page: Page, column: string) {
	return page.locator(".sc-row").filter({
		has: page.getByRole("combobox", { name: `Y Column for ${column}` }),
	});
}
