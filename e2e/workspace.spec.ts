import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import {
	chartLabel,
	emptyApp,
	importCsv,
	importFixture,
	plotCanvas,
	seriesRow,
} from "./helpers";

/**
 * Editing, history and persistence of a workspace, in a real browser.
 *
 * Non-visual: assertions read the DOM and IndexedDB, never pixels. The unit
 * suite covers each store action against fake-indexeddb; these prove the
 * pieces are wired together — real IndexedDB across a reload, the formula
 * worker, the global keyboard shortcuts, and a session file that leaves and
 * re-enters the browser.
 */

/**
 * The persisted config record plus the dataset count, read straight from
 * IndexedDB. Saves are debounced and run on idle, so a reload is only
 * meaningful once this shows the change.
 */
function persisted(page: Page): Promise<string> {
	return page.evaluate(
		() =>
			new Promise<string>((resolve, reject) => {
				const req = indexedDB.open("webgraphy-db");
				req.onerror = () => reject(req.error);
				req.onsuccess = () => {
					const db = req.result;
					const tx = db.transaction(["app_state", "datasets"], "readonly");
					const config = tx.objectStore("app_state").get("webgraphy-config");
					const count = tx.objectStore("datasets").count();
					tx.oncomplete = () => {
						db.close();
						resolve(
							JSON.stringify({ datasets: count.result, config: config.result }),
						);
					};
					tx.onerror = () => reject(tx.error);
				};
			}),
	);
}

test("data and a series colour survive a reload", async ({ page }) => {
	const { errors } = await emptyApp(page);
	await importFixture(page);

	const swatch = page.getByRole("button", { name: "Color for Sine" });
	await swatch.click();
	await page.getByRole("button", { name: "Color #000000" }).first().click();
	await expect(swatch).toHaveCSS("background-color", "rgb(0, 0, 0)");

	await expect
		.poll(() => persisted(page), { timeout: 10_000 })
		.toMatch(/"datasets":1,.*"lineColor":"#000000"/);
	await page.reload();

	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/2 data series: Sine, Growth\./,
	);
	await expect(page.getByText("200 lines")).toBeVisible();
	await expect(page.getByRole("button", { name: "Color for Sine" })).toHaveCSS(
		"background-color",
		"rgb(0, 0, 0)",
	);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("creates a calculated column through the formula worker", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);
	await importFixture(page);

	await page.getByRole("button", { name: "Add Calculated Column" }).click();
	const dialog = page.getByRole("dialog", { name: "Add Calculated Column" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Column name").fill("Double");
	await dialog.getByLabel("Formula").fill("[Sine] * 2");
	await expect(dialog.getByText("Valid formula")).toBeVisible();
	await dialog.getByRole("button", { name: "Create Column" }).click();
	await expect(dialog).toHaveCount(0);

	// The new column is listed as calculated (it has a formula to edit) and
	// can be picked as a series' Y column.
	await expect(page.getByRole("button", { name: "Edit formula" })).toHaveCount(
		1,
	);
	const yColumn = page.getByRole("combobox", { name: "Y Column for Sine" });
	await expect(yColumn.locator("option", { hasText: "Double" })).toHaveCount(1);
	await yColumn.selectOption({ label: "Double" });
	await expect(yColumn.locator("option:checked")).toHaveText("Double");
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("Ctrl+Z restores a deleted series and Ctrl+Shift+Z removes it again", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);
	await importFixture(page);

	await seriesRow(page, "Sine")
		.getByRole("button", { name: "Delete Series" })
		.click();
	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Growth\./,
	);
	await expect(
		page.getByRole("status").filter({ hasText: "Deleted 'Sine'" }),
	).toBeVisible();

	// The shortcuts are global but skip form fields; make sure focus is not
	// left in one.
	await page.evaluate(() => (document.activeElement as HTMLElement)?.blur());
	await page.keyboard.press("Control+z");
	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/2 data series: Sine, Growth\./,
	);

	await page.keyboard.press("Control+Shift+z");
	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Growth\./,
	);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the log toggle switches a Y axis to a positive log range", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);
	const csv = ["Time,Growth"];
	for (let i = 0; i < 100; i++) csv.push(`${i},${Math.exp(i * 0.05)}`);
	await importCsv(page, "growth.csv", csv.join("\n"), /1 data series: Growth/);

	const toggle = seriesRow(page, "Growth").getByRole("button", {
		name: "Logarithmic Y Scale",
	});
	await expect(toggle).toHaveAttribute("aria-pressed", "false");

	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "true");
	// A log axis cannot reach zero: its announced lower bound is positive.
	await expect
		.poll(async () => {
			const m = /from (-?[\d,.]+) to [\d,.]+\.$/.exec(await chartLabel(page));
			return m ? Number(m[1].replaceAll(",", "")) : Number.NaN;
		})
		.toBeGreaterThan(0);

	await toggle.click();
	await expect(toggle).toHaveAttribute("aria-pressed", "false");
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("a saved session file opens back into the workspace", async ({ page }) => {
	const { errors } = await emptyApp(page);
	await importFixture(page);

	const sessionMenu = page.getByRole("button", { name: "Session & Export" });
	await sessionMenu.click();
	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: /Save session/ }).click();
	const download = await downloadPromise;
	expect(download.suggestedFilename()).toMatch(/^webgraphy-.*\.webgraphy$/);
	const sessionPath = await download.path();

	// Change the workspace so the round trip has something to restore.
	await seriesRow(page, "Sine")
		.getByRole("button", { name: "Delete Series" })
		.click();
	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Growth\./,
	);

	await page.getByLabel("Open session file").setInputFiles({
		name: download.suggestedFilename(),
		mimeType: "application/octet-stream",
		buffer: await readFile(sessionPath),
	});
	const confirm = page.getByRole("alertdialog", { name: "Open session?" });
	await expect(confirm).toBeVisible();
	await confirm.getByRole("button", { name: "Replace workspace" }).click();

	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/2 data series: Sine, Growth\./,
	);
	await expect(page.getByText("200 lines")).toHaveCount(1);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});
