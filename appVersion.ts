import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const gitDescribe = () =>
	execSync("git describe --tags --always --dirty", {
		encoding: "utf8",
		stdio: ["ignore", "pipe", "ignore"],
	}).trim();

const semver = (v: string) =>
	/^(\d+)\.(\d+)\.(\d+)/.exec(v)?.slice(1).map(Number);

/** True when version `a` is ahead of `b`, comparing only their X.Y.Z. */
const isAhead = (a: string, b: string) => {
	const x = semver(a);
	const y = semver(b);
	if (!x || !y) return false;
	const d = x.findIndex((n, i) => n !== y[i]);
	return d >= 0 && x[d] > y[d];
};

const readPkgVersion = () =>
	(
		JSON.parse(
			readFileSync(join(import.meta.dirname, "package.json"), "utf8"),
		) as { version: string }
	).version;

/**
 * App version shown in the UI, resolved at build time and injected as the
 * `__APP_VERSION__` define (see vite.config.ts / vitest.config.ts).
 *
 * `APP_VERSION` in the environment wins when set (a leading "v" is dropped):
 * CI builds main with the version it tags after the deploy
 * (scripts/next-version.mjs), because that tag does not exist yet at build
 * time. Otherwise git tags (vX.Y.Z) are the source of truth: on a tagged
 * commit this yields "X.Y.Z", between tags "X.Y.Z-N-gHASH" (`git describe`),
 * plus "-dirty" for uncommitted local changes. When package.json is ahead of
 * the newest tag (a minor or major release not merged yet), the build shows
 * that version, with what git describes after a "+". When no tag is reachable
 * (shallow CI clone) it falls back to the package.json version plus the short
 * commit SHA, and to the bare package.json version when git is unavailable
 * entirely.
 */
export function resolveAppVersion({
	env = process.env,
	describe = gitDescribe,
	pkgVersion = readPkgVersion(),
}: {
	env?: Record<string, string | undefined>;
	describe?: () => string;
	pkgVersion?: string;
} = {}): string {
	const override = env.APP_VERSION?.trim();
	if (override) return override.replace(/^v/, "");
	try {
		const described = describe();
		if (described.startsWith("v")) {
			const tagged = described.slice(1);
			return isAhead(pkgVersion, tagged) ? `${pkgVersion}+${described}` : tagged;
		}
		// No tag reachable — `described` is the bare short SHA.
		return `${pkgVersion}+${described}`;
	} catch {
		return pkgVersion;
	}
}
