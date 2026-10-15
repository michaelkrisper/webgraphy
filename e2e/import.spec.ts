import { expect, test } from "@playwright/test";
import * as XLSX from "xlsx";
import {
	chooseDataFile,
	confirmImport,
	emptyApp,
	importFixture,
	plotCanvas,
} from "./helpers";

/**
 * The import paths end to end: file input, workers, dialog, store, plot.
 *
 * Non-visual: every assertion reads the DOM (the plot's accessible name, the
 * sidebar, toasts), so these run on every browser project and need no
 * screenshot baselines. The unit suite mocks the parser and excel workers;
 * only here do the real worker bundles run.
 */

test("a CSV picked in the file input becomes plotted series", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);
	await importFixture(page);

	// The dataset shows up in the sidebar with its row count, and one series
	// row per plotted column.
	await expect(page.getByText("200 lines")).toBeVisible();
	await expect(
		page.getByRole("combobox", { name: "Y Column for Sine" }),
	).toBeVisible();
	await expect(
		page.getByRole("combobox", { name: "Y Column for Growth" }),
	).toBeVisible();
	await expect(
		page
			.getByRole("status")
			.filter({ hasText: 'Imported "fixture.csv": 200 rows, 3 columns' }),
	).toBeVisible();
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("a malformed file raises an error toast and imports nothing", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);
	await chooseDataFile(page, {
		name: "broken.json",
		mimeType: "application/json",
		buffer: Buffer.from('{"rows": [1, 2,', "utf8"),
	});

	await expect(page.getByRole("alert")).toContainText(
		'Could not open "broken.json"',
	);
	// No import dialog, and the chart stays empty.
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await expect(plotCanvas(page)).toHaveAttribute("aria-label", /Empty chart/);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("imports the chosen sheet of an XLSX workbook", async ({ page }) => {
	const { errors } = await emptyApp(page);

	const book = XLSX.utils.book_new();
	const rows = (name: string, f: (i: number) => number) => [
		["Time", name],
		...Array.from({ length: 20 }, (_, i) => [i, f(i)]),
	];
	XLSX.utils.book_append_sheet(
		book,
		XLSX.utils.aoa_to_sheet(rows("Alpha", (i) => i * 2)),
		"First",
	);
	XLSX.utils.book_append_sheet(
		book,
		XLSX.utils.aoa_to_sheet(rows("Beta", (i) => 100 - i)),
		"Second",
	);
	const buffer = XLSX.write(book, { type: "buffer", bookType: "xlsx" });

	await chooseDataFile(page, {
		name: "book.xlsx",
		mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		buffer,
	});

	const dialog = page.getByRole("dialog", { name: "book.xlsx" });
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Sheet:").selectOption("Second");
	// The preview follows the sheet before the import uses it.
	await expect(dialog.getByText("Beta").first()).toBeVisible();
	await confirmImport(page);

	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Beta\./,
	);
	await expect(page.getByText("20 lines")).toBeVisible();
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("pasting spreadsheet cells opens the import dialog for them", async ({
	page,
}) => {
	const { errors } = await emptyApp(page);

	// What a spreadsheet puts on the clipboard. A synthetic paste event avoids
	// the clipboard permission prompt, exactly like the app's own listener.
	const tsv = ["Time\tPasted", ...[0, 1, 2, 3, 4].map((i) => `${i}\t${i * i}`)]
		.join("\n")
		.concat("\n");
	await page.evaluate((text) => {
		const data = new DataTransfer();
		data.setData("text/plain", text);
		const event = new ClipboardEvent("paste", {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		});
		// Firefox replaces the init dict's `clipboardData` with an empty one on
		// a synthetic event.
		Object.defineProperty(event, "clipboardData", { value: data });
		document.body.dispatchEvent(event);
	}, tsv);

	await expect(
		page.getByRole("dialog", { name: /^Pasted data \(\d\d:\d\d\)\.tsv$/ }),
	).toBeVisible();
	await confirmImport(page);

	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Pasted\./,
	);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});
