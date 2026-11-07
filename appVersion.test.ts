import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { resolveAppVersion } from "./appVersion.ts";

const pkgVersion = (
	JSON.parse(readFileSync("package.json", "utf8")) as { version: string }
).version;

const fail = () => {
	throw new Error("git unavailable");
};

describe("resolveAppVersion", () => {
	it("prefers APP_VERSION over git, without the v prefix", () => {
		const describe = () => "v0.0.1-3-gabc1234";
		expect(resolveAppVersion({ env: { APP_VERSION: "1.3.7" }, describe })).toBe(
			"1.3.7",
		);
		expect(
			resolveAppVersion({ env: { APP_VERSION: " v2.0.0\n" }, describe }),
		).toBe("2.0.0");
	});

	it("treats an empty APP_VERSION as unset", () => {
		expect(
			resolveAppVersion({
				env: { APP_VERSION: "" },
				pkgVersion: "1.2.0",
				describe: () => "v1.2.0-4-gabc1234",
			}),
		).toBe("1.2.0-4-gabc1234");
	});

	it("shows package.json when it is ahead of the newest tag", () => {
		expect(
			resolveAppVersion({
				env: {},
				pkgVersion: "1.3.0",
				describe: () => "v1.2.0-263-g0182d90-dirty",
			}),
		).toBe("1.3.0+v1.2.0-263-g0182d90-dirty");
		// Tags past package.json (CI patch releases) keep the tag.
		expect(
			resolveAppVersion({
				env: {},
				pkgVersion: "1.3.0",
				describe: () => "v1.3.2-3-gabc1234",
			}),
		).toBe("1.3.2-3-gabc1234");
		expect(
			resolveAppVersion({
				env: {},
				pkgVersion: "1.3.0",
				describe: () => "v1.3.0",
			}),
		).toBe("1.3.0");
	});

	it("uses the version tag from git describe", () => {
		expect(
			resolveAppVersion({
				env: {},
				pkgVersion: "1.3.0",
				describe: () => "v1.3.0",
			}),
		).toBe("1.3.0");
	});

	it("falls back to package.json plus the SHA when no tag is reachable", () => {
		expect(resolveAppVersion({ env: {}, describe: () => "abc1234" })).toBe(
			`${pkgVersion}+abc1234`,
		);
	});

	it("falls back to package.json when git is unavailable", () => {
		expect(resolveAppVersion({ env: {}, describe: fail })).toBe(pkgVersion);
	});

	it("runs git describe by default", () => {
		expect(resolveAppVersion({ env: {} })).toMatch(/^\d+\.\d+\.\d+/);
	});
});
