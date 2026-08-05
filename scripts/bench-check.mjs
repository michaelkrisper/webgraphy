#!/usr/bin/env node
/**
 * Compares a benchmark run against the committed baseline.
 *
 * CI runners are noisy enough that absolute wall-clock numbers cannot gate a
 * pull request — the same code can differ by 2x between two runs on the same
 * runner class. Every benchmark is therefore normalised against the control
 * workload from the *same run*: we compare `control_hz / bench_hz`, a unitless
 * cost, rather than the raw hz. A slow runner slows the control by the same
 * factor and the ratio is unchanged; a genuine regression still moves it.
 *
 *   node scripts/bench-check.mjs --update   rewrite the baseline
 *   node scripts/bench-check.mjs            compare, exit 1 on a regression
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";

const RESULT_FILE = "bench-result.json";
const BASELINE_FILE = "bench-baseline.json";
const CONTROL_NAME = "reference workload";

/**
 * Tolerance for a single benchmark before it counts as a regression.
 * Deliberately loose to start with: a gate that cries wolf gets disabled.
 * Tighten it once a few weeks of CI runs show the real spread.
 */
const TOLERANCE = 0.25;

/** Benchmarks noisier than this are reported but never fail the build. */
const MAX_TRUSTED_RME = 8;

const update = process.argv.includes("--update");

function loadRun(path) {
	if (!existsSync(path)) {
		console.error(`Missing ${path} — run \`npm run bench\` first.`);
		process.exit(1);
	}
	const raw = JSON.parse(readFileSync(path, "utf8"));
	const out = {};
	let control = null;
	for (const file of raw.files ?? []) {
		for (const group of file.groups ?? []) {
			for (const b of group.benchmarks ?? []) {
				if (b.name === CONTROL_NAME) {
					control = b.hz;
					continue;
				}
				// Group names carry the file path; the bench name alone is the
				// stable identity across runs.
				out[b.name] = { hz: b.hz, rme: b.rme };
			}
		}
	}
	if (control === null) {
		console.error(
			`No control benchmark named "${CONTROL_NAME}" in the run. It must be` +
				" present so results can be normalised.",
		);
		process.exit(1);
	}
	const costs = {};
	for (const [name, { hz, rme }] of Object.entries(out)) {
		// Cost relative to the control: higher means slower.
		costs[name] = { cost: control / hz, rme };
	}
	return { costs, controlHz: control };
}

const run = loadRun(RESULT_FILE);

if (update) {
	const baseline = {
		note:
			"Costs are normalised against the control workload in the same run," +
			" so they are comparable across machines. Regenerate with" +
			" `npm run bench:update`.",
		costs: Object.fromEntries(
			Object.entries(run.costs).map(([k, v]) => [
				k,
				Number(v.cost.toPrecision(6)),
			]),
		),
	};
	writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, "\t")}\n`);
	console.log(
		`Baseline written with ${Object.keys(baseline.costs).length} benchmarks.`,
	);
	process.exit(0);
}

if (!existsSync(BASELINE_FILE)) {
	console.error(
		`Missing ${BASELINE_FILE} — create it with \`npm run bench:update\`.`,
	);
	process.exit(1);
}

const baseline = JSON.parse(readFileSync(BASELINE_FILE, "utf8")).costs;

const regressions = [];
const improvements = [];
const missing = [];
const added = [];

for (const name of Object.keys(baseline)) {
	if (!(name in run.costs)) missing.push(name);
}

const rows = [];
for (const [name, { cost, rme }] of Object.entries(run.costs)) {
	const base = baseline[name];
	if (base === undefined) {
		added.push(name);
		rows.push([name, "—", cost.toPrecision(4), "new"]);
		continue;
	}
	const delta = (cost - base) / base;
	const noisy = rme > MAX_TRUSTED_RME;
	let verdict = "ok";
	if (delta > TOLERANCE) {
		if (noisy) {
			verdict = `slower but noisy (rme ${rme.toFixed(1)}%)`;
		} else {
			verdict = "REGRESSION";
			regressions.push({ name, base, cost, delta });
		}
	} else if (delta < -TOLERANCE) {
		verdict = "faster";
		improvements.push({ name, delta });
	}
	rows.push([
		name,
		base.toPrecision(4),
		cost.toPrecision(4),
		`${delta >= 0 ? "+" : ""}${(delta * 100).toFixed(1)}%  ${verdict}`,
	]);
}

const width = Math.max(...rows.map((r) => r[0].length), 4);
console.log(
	`${"name".padEnd(width)}  ${"base".padStart(9)}  ${"now".padStart(9)}  delta`,
);
for (const [name, base, now, verdict] of rows) {
	console.log(
		`${name.padEnd(width)}  ${base.padStart(9)}  ${now.padStart(9)}  ${verdict}`,
	);
}

if (added.length) {
	console.log(
		`\n${added.length} new benchmark(s) with no baseline — run \`npm run bench:update\`.`,
	);
}
if (missing.length) {
	console.log(`\nMissing from this run: ${missing.join(", ")}`);
}
if (improvements.length) {
	console.log(
		`\n${improvements.length} benchmark(s) got faster by more than ${TOLERANCE * 100}%.` +
			" Refresh the baseline so the gain is locked in.",
	);
}

if (regressions.length) {
	console.error(`\n${regressions.length} performance regression(s):`);
	for (const r of regressions) {
		console.error(
			`  ${r.name}: ${(r.delta * 100).toFixed(1)}% slower ` +
				`(${r.base.toPrecision(4)} -> ${r.cost.toPrecision(4)})`,
		);
	}
	process.exit(1);
}

console.log("\nNo regressions beyond the tolerance.");
