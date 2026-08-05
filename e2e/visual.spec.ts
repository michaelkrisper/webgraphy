import { expect, test, type Page } from "@playwright/test";

/**
 * Screenshot comparison of the rendered plot.
 *
 * This is the only check in the repo that looks at pixels. Unit tests verify
 * that decimation keeps the right samples and that the layout maths is
 * correct, but nothing else notices if the series are drawn off-screen, at the
 * wrong scale, or in the wrong colour.
 *
 * The demo dataset is generated with `secureRandom()`, so it differs on every
 * page load and cannot be screenshotted — measured at ~6-20 % of pixels
 * differing between two runs of the same build. These tests therefore import a
 * fixed CSV instead, which also exercises the real import path.
 *
 * Baselines are generated in CI, not locally: GPU rasterisation differs
 * between machines even at an identical browser version.
 */

/** A deterministic series: two smooth curves with no noise. */
function fixtureCsv(rows = 500): string {
	const lines = ["Time,Sine,Ramp"];
	for (let i = 0; i < rows; i++) {
		const sine = (Math.sin(i * 0.05) * 100).toFixed(4);
		const ramp = (i * 0.4 - 50).toFixed(4);
		lines.push(`${i},${sine},${ramp}`);
	}
	return lines.join("\n");
}

async function importFixture(page: Page) {
	await page.addInitScript(() => {
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
		// Suppress the demo dataset. Importing on top of it would leave the
		// random demo series in the picture and defeat the whole exercise.
		localStorage.setItem("webgraphy-cleared", "1");
	});
	await page.goto("/");

	const canvas = page.locator('.plot-area canvas[role="img"]');
	await expect(canvas).toHaveAttribute("aria-label", /Empty chart/);

	await page.setInputFiles('input[type="file"]', {
		name: "fixture.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(fixtureCsv(), "utf8"),
	});

	// Exact name: "Import Data Source" in the header also matches loosely.
	await page.getByRole("button", { name: "Import Data", exact: true }).click();

	// Exactly the two fixture series, nothing else.
	await expect(canvas).toHaveAttribute(
		"aria-label",
		/2 data series: Sine, Ramp\./,
	);
	await page.waitForFunction(() => {
		const c = document.querySelector(
			'.plot-area canvas[role="img"]',
		) as HTMLCanvasElement | null;
		return !!c && c.width > 0 && c.height > 0;
	});
	// Let the interpolating viewport loop settle before capturing.
	await page.waitForTimeout(750);

	return page.locator(".plot-area");
}

test("renders an imported dataset", async ({ page }) => {
	const plot = await importFixture(page);
	await expect(plot).toHaveScreenshot("imported-chart.png");
});

test("renders the chart after zooming in", async ({ page }) => {
	const plot = await importFixture(page);
	const box = await plot.boundingBox();

	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.wheel(0, -600);
	await page.waitForTimeout(750);

	// A zoomed view exercises the decimation path at a different bucket width,
	// which is where an off-by-one in the M4 grid would show up visually.
	await expect(plot).toHaveScreenshot("imported-chart-zoomed.png");
});
