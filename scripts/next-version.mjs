#!/usr/bin/env node
/**
 * Computes the version CI releases for the current commit of main.
 *
 * Git tags (vX.Y.Z) are the source of truth. Every merge to main gets the
 * next patch version; a minor or major release is cut by raising the
 * package.json version in the pull request, which then wins because it is
 * ahead of every tag. A commit that already carries a version tag keeps it,
 * so re-running CI on the same commit never mints a second version.
 *
 *   node scripts/next-version.mjs   print the version (X.Y.Z, no "v")
 */

import { execFileSync } from "node:child_process";
import { readFileSync, realpathSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const TAG = /^v(\d+)\.(\d+)\.(\d+)$/;
const PLAIN = /^(\d+)\.(\d+)\.(\d+)$/;

/** @typedef {[number, number, number]} Version */

/**
 * Parses "vX.Y.Z" (or "X.Y.Z" when `prefixed` is false). Anything else,
 * pre-releases included, yields undefined.
 * @returns {Version | undefined}
 */
export function parseVersion(text, prefixed = true) {
	const m = (prefixed ? TAG : PLAIN).exec(text.trim());
	return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined;
}

/** @param {Version} a @param {Version} b */
export function compareVersions(a, b) {
	return a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
}

/** @param {string[]} tags @returns {Version | undefined} */
function highest(tags) {
	return tags
		.map((t) => parseVersion(t))
		.filter((v) => v !== undefined)
		.sort(compareVersions)
		.at(-1);
}

/**
 * The version to release, as "X.Y.Z".
 * @param {{ pkgVersion: string, tags: string[], headTags?: string[] }} state
 *   `tags`: every tag in the repository; `headTags`: those on the commit
 *   being released. Tags that are not vX.Y.Z are ignored.
 */
export function nextVersion({ pkgVersion, tags, headTags = [] }) {
	const pkg = parseVersion(pkgVersion, false);
	if (!pkg) {
		throw new Error(`package.json version "${pkgVersion}" is not X.Y.Z`);
	}
	const current = highest(headTags);
	if (current) return current.join(".");
	const latest = highest(tags);
	if (!latest || compareVersions(pkg, latest) > 0) return pkg.join(".");
	return [latest[0], latest[1], latest[2] + 1].join(".");
}

/** Reads the inputs of {@link nextVersion} from the git checkout at `cwd`. */
export function readRepoState(cwd = process.cwd()) {
	const git = (...args) =>
		execFileSync("git", args, { cwd, encoding: "utf8" })
			.split("\n")
			.filter((line) => line.trim() !== "");
	return {
		pkgVersion: JSON.parse(readFileSync(join(cwd, "package.json"), "utf8"))
			.version,
		tags: git("tag", "--list", "v*"),
		headTags: git("tag", "--points-at", "HEAD", "--list", "v*"),
	};
}

/**
 * CLI entry: prints the version for the checkout at `root` (the repository
 * this script lives in by default) and returns the exit code.
 */
export function main(root = fileURLToPath(new URL("..", import.meta.url))) {
	try {
		console.log(nextVersion(readRepoState(root)));
		return 0;
	} catch (err) {
		console.error(err.message);
		return 1;
	}
}

if (
	process.argv[1] !== undefined &&
	realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)
) {
	process.exitCode = main();
}
