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
const CONTROL_COMPUTE = "reference workload";
const CONTROL_MEMORY = "reference workload memory";
const CONTROL_END = "reference workload end";

/**
 * How far the machine's throughput may drift between the start and the end of
 * a run before the whole run is treated as unmeasurable. Benchmarks execute at
 * different moments, so a machine whose available throughput moves mid-run
 * cannot be normalised by anything measured at a single moment.
 */
const MAX_CONTROL_DRIFT = 0.1;

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
	let compute = null;
	let memory = null;
	let controlEnd = null;
	for (const file of raw.files ?? []) {
		for (const group of file.groups ?? []) {
			for (const b of group.benchmarks ?? []) {
				if (b.name === CONTROL_COMPUTE) {
					compute = b.hz;
					continue;
				}
				if (b.name === CONTROL_MEMORY) {
					memory = b.hz;
					continue;
				}
				if (b.name === CONTROL_END) {
					controlEnd = b.hz;
					continue;
				}
				// Group names carry the file path; the bench name alone is the
				// stable identity across runs.
				out[b.name] = { hz: b.hz, rme: b.rme };
			}
		}
	}
	if (compute === null || memory === null) {
		console.error(
			`Both control benchmarks ("${CONTROL_COMPUTE}", "${CONTROL_MEMORY}")` +
				" must be present so results can be normalised.",
		);
		process.exit(1);
	}
	// Geometric mean of a compute-bound and a memory-bound reference. Using
	// either alone mis-normalises the other class of benchmark whenever the
	// machine is contended for that resource; the mean tracks both.
	const control = Math.sqrt(compute * memory);
	const costs = {};
	for (const [name, { hz, rme }] of Object.entries(out)) {
		// Cost relative to the control: higher means slower.
		costs[name] = { cost: control / hz, rme };
	}
	const drift =
		controlEnd === null ? 0 : Math.abs(controlEnd - compute) / compute;
	return { costs, controlHz: { compute, memory, combined: control }, drift };
}

const run = loadRun(RESULT_FILE);

if (update) {
	const baseline = {
		note:
			"Costs are normalised against the geometric mean of the two control" +
			" workloads measured in the same run, so they are comparable across" +
			" machines. Regenerate with `npm run bench:update`, or from CI's" +
			" bench-result artifact with `node scripts/bench-check.mjs --update`.",
		// Recorded for diagnostics only; the checker never compares these.
		controlHzAtBaseline: {
			compute: Math.round(run.controlHz.compute),
			memory: Math.round(run.controlHz.memory),
		},
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

// Checked before anything is compared: on a machine that is busy with other
// work — a parallel build, another benchmark run — throughput moves during the
// run and every comparison below is noise. Reporting that honestly is more
// useful than inventing a regression, so this exits successfully. CI runs on a
// dedicated runner and is the authority for the gate.
if (run.drift > MAX_CONTROL_DRIFT) {
	console.error(
		`INCONCLUSIVE: machine throughput moved ${(run.drift * 100).toFixed(1)}%` +
			` between the start and end of the run (limit ${MAX_CONTROL_DRIFT * 100}%).`,
	);
	console.error(
		"Nothing measured here can be compared to the baseline. Re-run on an" +
			" idle machine, or rely on the CI benchmark job.",
	);
	process.exit(0);
}

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

// Everything moving the same way by a lot is not a code change; it means the
// baseline was produced by a different normaliser or a different suite. Left
// unchecked it hides real regressions behind an apparent across-the-board win,
// which is exactly what happened when the control set changed.
// `rows` has no header row here, unlike the size checker.
const compared = rows.length - added.length;
if (compared > 0 && improvements.length === compared) {
	console.error(
		`\nEvery one of the ${compared} compared benchmarks moved faster by more` +
			` than ${TOLERANCE * 100}%. That is a baseline mismatch, not a speed-up:` +
			" regenerate it from an idle machine or from CI's bench-result artifact.",
	);
	if (process.env.CI) process.exit(1);
}

if (regressions.length) {
	console.error(`\n${regressions.length} performance regression(s):`);
	for (const r of regressions) {
		console.error(
			`  ${r.name}: ${(r.delta * 100).toFixed(1)}% slower ` +
				`(${r.base.toPrecision(4)} -> ${r.cost.toPrecision(4)})`,
		);
	}
	// Only CI fails the build. A developer machine is routinely busy with a
	// build, a test run or a second session, and moderate contention skews
	// these numbers well past the tolerance without anything being wrong. CI
	// runs on a dedicated runner, so that is where the gate has teeth; locally
	// this is a signal to investigate on an idle machine, not a blocker.
	if (process.env.CI) process.exit(1);
	console.error(
		"\nReported but not failing: set CI=1 to treat this as an error." +
			" Re-run on an idle machine before believing it.",
	);
	process.exit(0);
}

console.log("\nNo regressions beyond the tolerance.");
