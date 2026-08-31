#!/usr/bin/env node
/**
 * Production build: type-check and bundle at the same time.
 *
 * The two steps are independent — both tsconfigs are `noEmit`, so nothing
 * Vite reads is produced by `tsc`. Running them in sequence simply added the
 * type-check's wall time to every build.
 *
 * Vite keeps the terminal, since its asset table is the output worth
 * watching; tsc is silent unless it fails, and its diagnostics are buffered
 * and printed at the end so they never land inside the bundle report.
 *
 * One consequence of running them together: a type error no longer stops the
 * bundle, so `dist/` is written even on a failed build. The exit code is what
 * gates CI, and it is still non-zero if either step fails.
 *
 *   node scripts/build.mjs
 */

import { spawn } from "node:child_process";
import path from "node:path";

// So the local binaries resolve even when this runs outside `npm run`.
const env = {
	...process.env,
	PATH: [
		path.join(import.meta.dirname, "..", "node_modules", ".bin"),
		process.env.PATH,
	].join(path.delimiter),
};

function run(cmd, args, { buffer }) {
	return new Promise((resolve) => {
		const child = spawn(cmd, args, {
			env,
			stdio: buffer ? ["ignore", "pipe", "pipe"] : "inherit",
		});
		let output = "";
		child.stdout?.on("data", (chunk) => {
			output += chunk;
		});
		child.stderr?.on("data", (chunk) => {
			output += chunk;
		});
		child.on("close", (code) => resolve({ cmd, code: code ?? 1, output }));
	});
}

const results = await Promise.all([
	run("tsc", ["-b"], { buffer: true }),
	run("vite", ["build"], { buffer: false }),
]);

let failed = false;
for (const { cmd, code, output } of results) {
	if (output.trim()) process.stdout.write(`\n${output.trim()}\n`);
	if (code !== 0) {
		failed = true;
		console.error(`\n${cmd} failed with exit code ${code}`);
	}
}
process.exit(failed ? 1 : 0);
