import { expect, test, type Page } from "@playwright/test";

/**
 * WebGL context loss and restore, on both render backends.
 *
 * A GPU process crash or driver reset loses the context; the plot has to come
 * back on its own once the browser restores it. WEBGL_lose_context simulates
 * exactly that. Non-visual: pixels are only compared within the same run,
 * never against a stored baseline.
 */

// Several settled screenshots, software-rasterised in CI.
test.describe.configure({ timeout: 120_000 });
const POLL = { timeout: 30_000 };

declare global {
	interface Window {
		__renderWorkers?: Worker[];
		__loseExt?: WEBGL_lose_context | null;
	}
}

/** Small deterministic dataset: cheap to rasterise, unlike the demo data. */
function fixtureCsv(rows = 200): string {
	const lines = ["Time,Sine"];
	for (let i = 0; i < rows; i++) {
		lines.push(`${i},${(Math.sin(i * 0.1) * 100).toFixed(4)}`);
	}
	return lines.join("\n");
}

async function bootApp(page: Page) {
	const errors: string[] = [];
	page.on("pageerror", (err) => errors.push(String(err)));
	await page.addInitScript(() => {
		indexedDB.deleteDatabase("webgraphy-db");
		localStorage.clear();
		localStorage.setItem("webgraphy-cleared", "1");
	});
	await page.goto("/");
	await expect(plotCanvas(page)).toHaveAttribute("aria-label", /Empty chart/);
	await page.setInputFiles('input[type="file"]', {
		name: "fixture.csv",
		mimeType: "text/csv",
		buffer: Buffer.from(fixtureCsv(), "utf8"),
	});
	await page.getByRole("button", { name: "Import Data", exact: true }).click();
	await expect(plotCanvas(page)).toHaveAttribute(
		"aria-label",
		/1 data series: Sine\./,
	);
	return { errors };
}

const plotCanvas = (page: Page) =>
	page.locator('.plot-area canvas[role="img"]');

/** Base64 PNG of the plot canvas as composited on screen. */
async function shot(page: Page): Promise<string> {
	return (await plotCanvas(page).screenshot()).toString("base64");
}

/**
 * Fraction of pixels differing between two PNGs, decoded in the page so the
 * test needs no image library. With only `a`, the fraction of pixels that
 * differ from its top-left (background) pixel — i.e. how much is drawn.
 */
async function pixelDiff(page: Page, a: string, b?: string): Promise<number> {
	return page.evaluate(
		async ([a, b]) => {
			const decode = async (png: string) => {
				// No fetch(data:): the app's CSP would block it.
				const bytes = Uint8Array.from(atob(png), (ch) => ch.charCodeAt(0));
				const bmp = await createImageBitmap(
					new Blob([bytes], { type: "image/png" }),
				);
				const c = new OffscreenCanvas(bmp.width, bmp.height);
				const ctx = c.getContext("2d")!;
				ctx.drawImage(bmp, 0, 0);
				return ctx.getImageData(0, 0, bmp.width, bmp.height).data;
			};
			const pa = await decode(a);
			const pb = b ? await decode(b) : null;
			if (pb && pb.length !== pa.length) return 1;
			let diff = 0;
			for (let i = 0; i < pa.length; i += 4) {
				const r = pb ? pb[i] : pa[0];
				const g = pb ? pb[i + 1] : pa[1];
				const bl = pb ? pb[i + 2] : pa[2];
				if (
					Math.abs(pa[i] - r) > 24 ||
					Math.abs(pa[i + 1] - g) > 24 ||
					Math.abs(pa[i + 2] - bl) > 24
				) {
					diff++;
				}
			}
			return diff / (pa.length / 4);
		},
		[a, b] as const,
	);
}

/** Wait until two consecutive screenshots agree, i.e. the chart settled. */
async function settledShot(page: Page): Promise<string> {
	let prev = await shot(page);
	await expect
		.poll(async () => {
			const next = await shot(page);
			const d = await pixelDiff(page, prev, next);
			prev = next;
			return d;
		}, POLL)
		.toBe(0);
	return prev;
}

async function expectRestored(
	page: Page,
	loseContext: () => Promise<void>,
	restoreContext: () => Promise<void>,
) {
	// Keep the crosshair out of every screenshot.
	await page.mouse.move(1200, 600);
	const before = await settledShot(page);
	// Series, grid, and labels drawn over the background.
	expect(await pixelDiff(page, before)).toBeGreaterThan(0.01);

	await loseContext();
	// Pan while lost: the store moves on, but nothing can be drawn. What the
	// canvas shows meanwhile differs per backend (a DOM canvas goes blank, a
	// worker's placeholder keeps its last frame) — neither is the panned view.
	const label = () => plotCanvas(page).getAttribute("aria-label");
	const labelBefore = await label();
	const box = (await page.locator(".plot-area").boundingBox())!;
	const cx = box.x + box.width / 2;
	const cy = box.y + box.height / 2;
	await page.mouse.move(cx, cy);
	await page.mouse.down();
	await page.mouse.move(cx - 200, cy, { steps: 10 });
	await page.mouse.up();
	await page.mouse.move(1200, 600);
	await expect.poll(label, POLL).not.toBe(labelBefore);
	const whileLost = await settledShot(page);

	await restoreContext();
	// Restored: the panned view is drawn without any further interaction.
	await expect
		.poll(async () => pixelDiff(page, whileLost, await shot(page)), POLL)
		.toBeGreaterThan(0.005);
	const after = await settledShot(page);
	expect(await pixelDiff(page, after)).toBeGreaterThan(0.01);
	expect(await pixelDiff(page, before, after)).toBeGreaterThan(0.005);
}

test("the worker-rendered plot comes back after a WebGL context loss", async ({
	page,
}) => {
	// The worker owns the context, so capture it to send the (test-only)
	// simulateContextLoss message.
	await page.addInitScript(() => {
		const Native = window.Worker;
		window.__renderWorkers = [];
		window.Worker = class extends Native {
			constructor(url: string | URL, opts?: WorkerOptions) {
				super(url, opts);
				if (String(url).includes("render")) window.__renderWorkers!.push(this);
			}
		};
	});
	const { errors } = await bootApp(page);
	expect(
		await page.evaluate(() => window.__renderWorkers?.length ?? 0),
	).toBeGreaterThan(0);

	const send = (restore: boolean) =>
		page.evaluate((restore) => {
			window.__renderWorkers!.at(-1)!.postMessage({
				t: "simulateContextLoss",
				restore,
			});
		}, restore);
	await expectRestored(
		page,
		() => send(false),
		() => send(true),
	);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});

test("the main-thread plot comes back after a WebGL context loss", async ({
	page,
}) => {
	// Without OffscreenCanvas the renderer falls back to the main thread,
	// where the page can reach the context directly.
	await page.addInitScript(() => {
		delete (HTMLCanvasElement.prototype as Partial<HTMLCanvasElement>)
			.transferControlToOffscreen;
	});
	const { errors } = await bootApp(page);

	await expectRestored(
		page,
		() =>
			page.evaluate(() => {
				const canvas = document.querySelector(
					'.plot-area canvas[role="img"]',
				) as HTMLCanvasElement;
				// Same type as the renderer's: returns its existing context.
				const gl = canvas.getContext("webgl2");
				window.__loseExt = gl?.getExtension("WEBGL_lose_context") ?? null;
				window.__loseExt?.loseContext();
			}),
		() =>
			page.evaluate(() => {
				window.__loseExt?.restoreContext();
			}),
	);
	expect(errors, `page errors: ${errors.join(" | ")}`).toEqual([]);
});
