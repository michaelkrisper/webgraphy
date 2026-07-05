import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";

/**
 * App version shown in the UI, resolved at build time and injected as the
 * `__APP_VERSION__` define (see vite.config.ts / vitest.config.ts).
 *
 * Git tags (vX.Y.Z) are the source of truth: on a tagged commit this yields
 * "X.Y.Z", between tags "X.Y.Z-N-gHASH" (`git describe`), plus "-dirty" for
 * uncommitted local changes. When no tag is reachable (shallow CI clone) it
 * falls back to the package.json version plus the short commit SHA, and to
 * the bare package.json version when git is unavailable entirely.
 */
export function resolveAppVersion(): string {
	const pkgVersion = (
		JSON.parse(
			readFileSync(new URL("./package.json", import.meta.url), "utf8"),
		) as { version: string }
	).version;
	try {
		const described = execSync("git describe --tags --always --dirty", {
			encoding: "utf8",
			stdio: ["ignore", "pipe", "ignore"],
		}).trim();
		if (described.startsWith("v")) return described.slice(1);
		// No tag reachable — `described` is the bare short SHA.
		return `${pkgVersion}+${described}`;
	} catch {
		return pkgVersion;
	}
}
