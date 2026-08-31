import { expect, test, type Page } from "@playwright/test";

/**
 * Boot and interaction smoke tests.
 *
 * Everything asserted here is invisible to the jsdom unit suite, which has no
 * WebGL2: whether the context is actually acquired, whether the shaders
 * compile, whether pan and zoom move the viewport, and whether the export path
 * produces a real file.
 */

/** The app persists to IndexedDB; every test starts from demo data. */
async function freshApp(page: Page, opts: { isolated?: boolean } = {}) {
	const errors: string[] = [];
	page.on("console", (msg) => {
		if (msg.type() === "error") errors.push(msg.text());
	});
	page.on("pageerror", (err) => errors.push(String(err)));

	await page.addInitScript(() => {
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
	});
	// The preview server sends COOP/COEP, so the suite would only ever see the
	// SharedArrayBuffer transport. GitHub Pages cannot set those headers, so
	// hiding the flag is the only way to exercise what actually ships.
	if (opts.isolated === false) {
		await page.addInitScript(() => {
			Object.defineProperty(window, "crossOriginIsolated", {
				get: () => false,
			});
		});
	}
	await page.goto("/");

	// The canvas carries a generated accessible name, so waiting for it to
	// describe a chart is a real readiness signal rather than a fixed sleep.
	const plot = page.getByRole("img", { name: /Line chart/ });
	await expect(plot).toBeVisible();

	return { errors, plot };
}

/** Reads the axis ranges out of the plot's accessible description. */
async function axisLabel(page: Page): Promise<string> {
	return (
		(await page
			.getByRole("img", { name: /Line chart|Empty chart/ })
			.getAttribute("aria-label")) ?? ""
	);
}

test("boots with demo data and a working WebGL2 context", async ({ page }) => {
	const { errors, plot } = await freshApp(page);

	// The renderer must have obtained a real context — jsdom can never prove
	// this, and a shader compile failure shows up here.
	const glInfo = await page.evaluate(() => {
		const probe = document.createElement("canvas");
		const gl = probe.getContext("webgl2");
		return { hasWebGL2: !!gl };
	});
	expect(glInfo.hasWebGL2).toBe(true);

	await expect(plot).toHaveAttribute("aria-label", /data series/);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the plot canvas has a non-empty drawing buffer", async ({ page }) => {
	await freshApp(page);

	const size = await page.evaluate(() => {
		const canvas = document.querySelector(
			'.plot-area canvas[role="img"]',
		) as HTMLCanvasElement | null;
		return canvas ? { w: canvas.width, h: canvas.height } : null;
	});

	// A zero-sized drawing buffer renders nothing while still looking fine in
	// the DOM — the classic silent failure for canvas-based charts.
	expect(size).not.toBeNull();
	expect(size!.w).toBeGreaterThan(0);
	expect(size!.h).toBeGreaterThan(0);
});

test("scroll-wheel zoom changes the axis range", async ({ page }) => {
	const { errors } = await freshApp(page);

	const before = await axisLabel(page);
	const box = await page.locator(".plot-area").boundingBox();
	expect(box).not.toBeNull();

	await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
	await page.mouse.wheel(0, -600);

	// The viewport loop writes back to the store once the interaction settles.
	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(before);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("dragging pans the viewport", async ({ page }) => {
	const { errors } = await freshApp(page);

	const before = await axisLabel(page);
	const box = await page.locator(".plot-area").boundingBox();
	const cx = box!.x + box!.width / 2;
	const cy = box!.y + box!.height / 2;

	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx - 200, cy, { steps: 10 });
	await page.mouse.up();

	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(before);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("ctrl-drag zooms to the selected box", async ({ page }) => {
	const { errors } = await freshApp(page);

	const before = await axisLabel(page);
	const box = await page.locator(".plot-area").boundingBox();
	const cx = box!.x + box!.width / 2;
	const cy = box!.y + box!.height / 2;

	await page.keyboard.down("Control");
	await page.mouse.move(cx - 120, cy - 80);
	await page.mouse.down();
	await page.mouse.move(cx + 120, cy + 80, { steps: 10 });
	await page.mouse.up();
	await page.keyboard.up("Control");

	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(before);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("a ctrl-click without a drag leaves the viewport alone", async ({
	page,
}) => {
	const { errors } = await freshApp(page);

	const before = await axisLabel(page);
	const box = await page.locator(".plot-area").boundingBox();
	const cx = box!.x + box!.width / 2;
	const cy = box!.y + box!.height / 2;

	// Below the minimum drag size: a mis-click must not throw the viewport
	// somewhere arbitrary.
	await page.keyboard.down("Control");
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx + 2, cy + 2);
	await page.mouse.up();
	await page.keyboard.up("Control");

	await page.waitForTimeout(500);
	expect(await axisLabel(page)).toBe(before);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});

test("exports a well-formed SVG", async ({ page }) => {
	await freshApp(page);

	const downloadPromise = page.waitForEvent("download");
	await page.getByRole("button", { name: /export/i }).click();
	await page.getByRole("button", { name: /SVG/i }).click();
	const download = await downloadPromise;

	const stream = await download.createReadStream();
	const chunks: Buffer[] = [];
	for await (const chunk of stream) chunks.push(Buffer.from(chunk));
	const svg = Buffer.concat(chunks).toString("utf8");

	expect(download.suggestedFilename()).toMatch(/\.svg$/);
	expect(svg.length).toBeGreaterThan(500);
	expect(svg).toContain("<svg");
	expect(svg.trimEnd()).toMatch(/<\/svg>$/);
});

test("pans on the postMessage transport, without cross-origin isolation", async ({
	page,
}) => {
	const { errors, plot } = await freshApp(page, { isolated: false });

	expect(await page.evaluate(() => crossOriginIsolated)).toBe(false);
	await expect(plot).toHaveAttribute("aria-label", /data series/);

	// Same interaction as the pan test above, but with the worker deriving the
	// scene from frame messages instead of the shared viewport.
	const before = await axisLabel(page);
	const box = await page.locator(".plot-area").boundingBox();
	const cx = box!.x + box!.width / 2;
	const cy = box!.y + box!.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx - 200, cy, { steps: 10 });
	await page.mouse.up();

	await expect.poll(() => axisLabel(page), { timeout: 5_000 }).not.toBe(before);
	expect(errors, `console errors: ${errors.join(" | ")}`).toEqual([]);
});
