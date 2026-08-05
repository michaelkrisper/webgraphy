#!/usr/bin/env node
/**
 * Enforces the bundle size budget against a production build.
 *
 * Measures gzipped bytes, because that is what users actually download, and
 * groups files by their stable entry name (the content hash changes on every
 * build). The precache total is budgeted separately: it is the real
 * cold-start cost of the PWA, and it is what silently grows when an asset is
 * added without anyone noticing.
 *
 *   node scripts/size-check.mjs            compare against size-budget.json
 *   node scripts/size-check.mjs --update   rewrite the budget from this build
 */

import {
	existsSync,
	readFileSync,
	readdirSync,
	statSync,
	writeFileSync,
} from "node:fs";
import { gzipSync } from "node:zlib";
import { join } from "node:path";

const DIST = "dist";
const BUDGET_FILE = "size-budget.json";

/** Headroom over the measured size when writing a new budget. */
const HEADROOM = 0.05;

const update = process.argv.includes("--update");

if (!existsSync(join(DIST, "index.html"))) {
	console.error(`No build found in ${DIST}/ — run \`npm run build\` first.`);
	process.exit(1);
}

const gzipOf = (path) => gzipSync(readFileSync(path), { level: 9 }).length;

/** Strips Vite's content hash so the name is stable across builds. */
const entryName = (file) =>
	file.replace(/-[A-Za-z0-9_-]{8,}(\.[a-z0-9]+)$/, "$1");

function measure() {
	const assets = {};
	const dir = join(DIST, "assets");
	for (const file of readdirSync(dir)) {
		if (!/\.(js|css)$/.test(file)) continue;
		assets[entryName(file)] = gzipOf(join(dir, file));
	}

	// Everything the service worker pulls down before the app is usable.
	const sw = readFileSync(join(DIST, "sw.js"), "utf8");
	const manifest = sw.match(/\[\{[^\]]*\}\]/);
	let precacheGzip = 0;
	let precacheCount = 0;
	if (manifest) {
		const entries = JSON.parse(
			manifest[0].replace(/url:/g, '"url":').replace(/revision:/g, '"revision":'),
		);
		precacheCount = entries.length;
		for (const e of entries) {
			const p = join(DIST, e.url);
			if (existsSync(p) && statSync(p).isFile()) precacheGzip += gzipOf(p);
		}
	}

	return { assets, precacheGzip, precacheCount };
}

const { assets, precacheGzip, precacheCount } = measure();
const kb = (b) => `${(b / 1024).toFixed(1)} KB`;

if (update) {
	const withHeadroom = (b) => Math.ceil((b * (1 + HEADROOM)) / 1024) * 1024;
	const budget = {
		note:
			"Gzipped byte budgets, roughly 5% above the measured build." +
			" Regenerate with `npm run size:update` and justify any increase" +
			" in the pull request.",
		precacheGzip: withHeadroom(precacheGzip),
		assets: Object.fromEntries(
			Object.entries(assets)
				.sort((a, b) => b[1] - a[1])
				.map(([name, bytes]) => [name, withHeadroom(bytes)]),
		),
	};
	writeFileSync(BUDGET_FILE, `${JSON.stringify(budget, null, "\t")}\n`);
	console.log(
		`Budget written: ${Object.keys(budget.assets).length} assets,` +
			` precache ${kb(budget.precacheGzip)}.`,
	);
	process.exit(0);
}

if (!existsSync(BUDGET_FILE)) {
	console.error(
		`Missing ${BUDGET_FILE} — create it with \`npm run size:update\`.`,
	);
	process.exit(1);
}

const budget = JSON.parse(readFileSync(BUDGET_FILE, "utf8"));
const failures = [];
const unbudgeted = [];

const rows = [["asset", "size", "budget", ""]];
for (const [name, bytes] of Object.entries(assets).sort(
	(a, b) => b[1] - a[1],
)) {
	const limit = budget.assets[name];
	if (limit === undefined) {
		unbudgeted.push(name);
		rows.push([name, kb(bytes), "—", "unbudgeted"]);
		continue;
	}
	const over = bytes > limit;
	if (over) failures.push({ name, bytes, limit });
	rows.push([
		name,
		kb(bytes),
		kb(limit),
		over
			? `OVER by ${kb(bytes - limit)}`
			: `${((bytes / limit) * 100).toFixed(0)}%`,
	]);
}

const precacheOver = precacheGzip > budget.precacheGzip;
if (precacheOver) {
	failures.push({
		name: `precache total (${precacheCount} entries)`,
		bytes: precacheGzip,
		limit: budget.precacheGzip,
	});
}
rows.push([
	`precache total (${precacheCount} entries)`,
	kb(precacheGzip),
	kb(budget.precacheGzip),
	precacheOver
		? `OVER by ${kb(precacheGzip - budget.precacheGzip)}`
		: `${((precacheGzip / budget.precacheGzip) * 100).toFixed(0)}%`,
]);

const w0 = Math.max(...rows.map((r) => r[0].length));
for (const [a, b, c, d] of rows) {
	console.log(`${a.padEnd(w0)}  ${b.padStart(9)}  ${c.padStart(9)}  ${d}`);
}

if (unbudgeted.length) {
	console.log(
		`\n${unbudgeted.length} asset(s) with no budget entry.` +
			" Run `npm run size:update` to record them.",
	);
}

if (failures.length) {
	console.error(`\n${failures.length} size budget violation(s):`);
	for (const f of failures) {
		console.error(`  ${f.name}: ${kb(f.bytes)} exceeds ${kb(f.limit)}`);
	}
	console.error(
		"\nIf the growth is intended, run `npm run size:update` and say why in" +
			" the pull request.",
	);
	process.exit(1);
}

console.log("\nAll assets within budget.");
