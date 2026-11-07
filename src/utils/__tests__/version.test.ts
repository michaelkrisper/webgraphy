import { describe, expect, it } from "vitest";
import { releaseVersion } from "../version";

describe("releaseVersion", () => {
	it.each([
		["1.2.0", "v1.2.0"],
		["1.2.0-219-gabc1234-dirty", "v1.2.0"],
		["1.2.0-dirty", "v1.2.0"],
		["1.2.0+abc1234", "v1.2.0"],
		["v10.20.30-1-gdeadbee", "v10.20.30"],
	])("reads %s as %s", (raw, shown) => {
		expect(releaseVersion(raw)).toBe(shown);
	});

	it("shows anything else unchanged", () => {
		expect(releaseVersion("abc1234")).toBe("abc1234");
	});
});
