import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	compareVersions,
	main,
	nextVersion,
	parseVersion,
	readRepoState,
} from "../next-version.mjs";

describe("parseVersion", () => {
	it("parses vX.Y.Z tags and plain X.Y.Z versions", () => {
		expect(parseVersion("v1.12.3")).toEqual([1, 12, 3]);
		expect(parseVersion("1.12.3", false)).toEqual([1, 12, 3]);
	});

	it("rejects pre-releases, partial versions and the wrong prefix", () => {
		for (const tag of ["v1.2.3-rc.1", "v1.2", "1.2.3", "release-1", "vx.y.z"]) {
			expect(parseVersion(tag)).toBeUndefined();
		}
		expect(parseVersion("v1.2.3", false)).toBeUndefined();
	});
});

describe("compareVersions", () => {
	it("orders numerically, not lexically", () => {
		expect(compareVersions([1, 10, 0], [1, 9, 9])).toBeGreaterThan(0);
		expect(compareVersions([2, 0, 0], [10, 0, 0])).toBeLessThan(0);
		expect(compareVersions([1, 2, 3], [1, 2, 3])).toBe(0);
	});
});

describe("nextVersion", () => {
	it("increments the patch of the highest tag", () => {
		expect(
			nextVersion({
				pkgVersion: "1.2.0",
				tags: ["v1.2.0", "v1.10.0", "v1.9.4", "v0.3.6"],
			}),
		).toBe("1.10.1");
	});

	it("uses package.json when it is ahead of every tag", () => {
		expect(nextVersion({ pkgVersion: "1.3.0", tags: ["v1.2.0"] })).toBe("1.3.0");
		expect(nextVersion({ pkgVersion: "2.0.0", tags: ["v1.9.9"] })).toBe("2.0.0");
	});

	it("keeps counting patches once package.json has been released", () => {
		expect(nextVersion({ pkgVersion: "1.3.0", tags: ["v1.2.0", "v1.3.0"] })).toBe(
			"1.3.1",
		);
		expect(nextVersion({ pkgVersion: "1.3.0", tags: ["v1.3.0", "v1.3.4"] })).toBe(
			"1.3.5",
		);
	});

	it("reuses the tag already on the released commit", () => {
		expect(
			nextVersion({
				pkgVersion: "1.3.0",
				tags: ["v1.3.0", "v1.3.1"],
				headTags: ["v1.3.1"],
			}),
		).toBe("1.3.1");
	});

	it("ignores tags that are not plain vX.Y.Z", () => {
		expect(
			nextVersion({
				pkgVersion: "1.2.0",
				tags: ["v1.2.0", "v9.0.0-beta", "latest"],
				headTags: ["v9.0.0-beta"],
			}),
		).toBe("1.2.1");
	});

	it("falls back to package.json without any version tag", () => {
		expect(nextVersion({ pkgVersion: "0.1.0", tags: [] })).toBe("0.1.0");
	});

	it("rejects a package.json version that is not X.Y.Z", () => {
		expect(() => nextVersion({ pkgVersion: "1.3.0-rc.1", tags: [] })).toThrow(
			/not X\.Y\.Z/,
		);
	});
});

describe("readRepoState and the CLI", () => {
	let dir: string | undefined;

	afterEach(() => {
		if (dir) rmSync(dir, { recursive: true, force: true });
		dir = undefined;
		vi.restoreAllMocks();
	});

	/** A throwaway repository; ignores the developer's git config. */
	function repo(pkgVersion: string) {
		dir = mkdtempSync(join(tmpdir(), "next-version-"));
		const cwd = dir;
		const git = (...args: string[]) =>
			execFileSync("git", args, {
				cwd,
				env: {
					...process.env,
					GIT_CONFIG_GLOBAL: "/dev/null",
					GIT_CONFIG_NOSYSTEM: "1",
					GIT_AUTHOR_NAME: "test",
					GIT_AUTHOR_EMAIL: "test@example.com",
					GIT_COMMITTER_NAME: "test",
					GIT_COMMITTER_EMAIL: "test@example.com",
				},
				stdio: "ignore",
			});
		writeFileSync(
			join(cwd, "package.json"),
			JSON.stringify({ version: pkgVersion }),
		);
		git("init", "-q");
		git("add", ".");
		git("commit", "-q", "-m", "one");
		return { cwd, git };
	}

	it("lists version tags and the ones on HEAD", () => {
		const { cwd, git } = repo("1.3.0");
		git("tag", "v1.2.0");
		git("tag", "-a", "v1.3.0", "-m", "v1.3.0");
		git("commit", "-q", "--allow-empty", "-m", "two");
		git("tag", "other");

		const state = readRepoState(cwd);
		expect(state.pkgVersion).toBe("1.3.0");
		expect(state.tags.sort()).toEqual(["v1.2.0", "v1.3.0"]);
		expect(state.headTags).toEqual([]);
		expect(nextVersion(state)).toBe("1.3.1");

		git("tag", "-a", "v1.3.1", "-m", "v1.3.1");
		expect(readRepoState(cwd).headTags).toEqual(["v1.3.1"]);
		expect(nextVersion(readRepoState(cwd))).toBe("1.3.1");
	});

	it("works in a repository without tags", () => {
		const { cwd } = repo("0.1.0");
		expect(readRepoState(cwd)).toEqual({
			pkgVersion: "0.1.0",
			tags: [],
			headTags: [],
		});
	});

	it("prints the version and exits 0", () => {
		const { cwd, git } = repo("1.3.0");
		git("tag", "v1.3.0");
		git("commit", "-q", "--allow-empty", "-m", "two");
		const log = vi.spyOn(console, "log").mockImplementation(() => {});
		expect(main(cwd)).toBe(0);
		expect(log).toHaveBeenCalledWith("1.3.1");
	});

	it("reports an invalid package.json version and exits 1", () => {
		const { cwd } = repo("next");
		const error = vi.spyOn(console, "error").mockImplementation(() => {});
		expect(main(cwd)).toBe(1);
		expect(error).toHaveBeenCalledWith(expect.stringMatching(/not X\.Y\.Z/));
	});

	it("runs as a script from any working directory", () => {
		const script = join(
			dirname(fileURLToPath(import.meta.url)),
			"../next-version.mjs",
		);
		const out = execFileSync(process.execPath, [script], {
			cwd: tmpdir(),
			encoding: "utf8",
		});
		expect(out).toMatch(/^\d+\.\d+\.\d+\n$/);
	});
});
