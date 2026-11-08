import { readdirSync, readFileSync } from "node:fs";
import { matchesGlob } from "node:path";
import { describe, expect, it } from "vitest";
import { workbox } from "./pwaWorkbox.ts";

// Pins what the service worker precaches against the file names the build
// emits, so a config change cannot silently put every theme's fonts (or the
// .woff copies) back on the cold-start download.

/** The light/dark themes' font set: the only one worth precaching. */
const DEFAULT_SET = "plex";

/** An emitted asset path, with a Vite-style content hash. */
const asset = (name: string) =>
	`assets/${name.replace(/(\.[a-z0-9]+)$/, "-Ab_C-d9Z$1")}`;

/** What generateSW precaches: globbed from dist/ minus the ignores. */
const precached = (file: string) =>
	workbox.globPatterns.some((g) => matchesGlob(file, g)) &&
	!workbox.globIgnores.some((g) => matchesGlob(file, g));

const runtimeRoute = (file: string) =>
	workbox.runtimeCaching.find((r) =>
		r.urlPattern.test(`https://example.test/webgraphy/${file}`),
	);

const fontsTs = readFileSync("src/fonts.ts", "utf8");

/** Every src/fonts-<set>.css with the woff2 files it references. */
const fontSets = readdirSync("src")
	.filter((f) => /^fonts-[a-z]+\.css$/.test(f))
	.map((file) => {
		const css = readFileSync(`src/${file}`, "utf8");
		const woff2 = [...css.matchAll(/url\("[^"]*\/([^/"]+\.woff2)"\)/g)].map(
			(m) => m[1],
		);
		return { set: file.slice("fonts-".length, -".css".length), file, css, woff2 };
	});
const otherSets = fontSets.filter((s) => s.set !== DEFAULT_SET);

describe("service worker precache", () => {
	it("covers exactly the font sets fonts.ts loads", () => {
		const loaded = [...fontsTs.matchAll(/import\("\.\/fonts-([a-z]+)\.css"\)/g)]
			.map((m) => m[1])
			.sort();
		expect([...new Set(loaded)]).toEqual(fontSets.map((s) => s.set).sort());
		expect(loaded).toContain(DEFAULT_SET);
		for (const s of fontSets) expect(s.woff2.length).toBeGreaterThan(0);
	});

	it("precaches the app shell and the default themes' fonts", () => {
		for (const f of ["index.html", asset("index.js"), asset("index.css")])
			expect(precached(f), f).toBe(true);
		const plex = fontSets.find((s) => s.set === DEFAULT_SET);
		for (const f of [plex?.file, ...(plex?.woff2 ?? [])])
			expect(precached(asset(f ?? "")), f).toBe(true);
	});

	it("leaves the other themes' fonts to a CacheFirst runtime cache", () => {
		const files = otherSets.flatMap((s) => [s.file, ...s.woff2]);
		expect(files.length).toBeGreaterThan(0);
		for (const f of files) {
			expect(precached(asset(f)), f).toBe(false);
			const route = runtimeRoute(asset(f));
			expect(route?.handler, f).toBe("CacheFirst");
			expect(route?.options.cacheName, f).toBe("theme-fonts");
		}
		const { expiration } = runtimeRoute(asset(files[0]))?.options ?? {};
		// Room for a deploy's worth of replaced files, which then expire.
		expect(expiration?.maxEntries).toBeGreaterThanOrEqual(2 * files.length);
		expect(expiration?.maxAgeSeconds).toBeGreaterThan(0);
	});

	it("gives every runtime cache its own name", () => {
		const names = workbox.runtimeCaching.map((r) => r.options.cacheName);
		expect(new Set(names).size).toBe(names.length);
	});

	it("ships woff2 only", () => {
		// @fontsource's own CSS lists a .woff fallback, which the build would
		// emit next to every woff2.
		expect(fontsTs).not.toMatch(/@fontsource\//);
		for (const s of fontSets) {
			const faces = s.css.match(/@font-face\s*\{/g)?.length;
			expect(s.css.match(/url\(/g)?.length, s.file).toBe(s.woff2.length);
			expect(s.css.match(/format\("woff2"\)/g)?.length, s.file).toBe(faces);
		}
		expect(precached(asset("ibm-plex-sans-latin-400-normal.woff"))).toBe(false);
	});

	it("embeds in exports only the font files the themes load", () => {
		// exportFontFiles.ts imports these by URL; a file no fonts-*.css uses
		// would be a separate asset that offline export could never fetch.
		const src = readFileSync("src/services/exportFontFiles.ts", "utf8");
		const embedded = [...src.matchAll(/\/files\/([^/"?]+\.woff2)\?url"/g)].map(
			(m) => m[1],
		);
		expect(embedded.length).toBeGreaterThan(0);
		const themed = new Set(fontSets.flatMap((s) => s.woff2));
		for (const f of embedded) expect(themed.has(f), f).toBe(true);
	});

	it("keeps the Excel worker out of the precache", () => {
		const worker = asset("excel.worker.js");
		expect(precached(worker)).toBe(false);
		expect(runtimeRoute(worker)?.options.cacheName).toBe("excel-worker");
	});
});
