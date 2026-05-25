import { describe, expect, it } from "vitest";
import { hexToRgba } from "../../../utils/colors";

describe("hexToRgba", () => {
	it("correctly converts valid full hex strings", () => {
		// white
		expect(hexToRgba("#FFFFFF")).toEqual([1, 1, 1]);
		// black
		expect(hexToRgba("#000000")).toEqual([0, 0, 0]);
		// red
		expect(hexToRgba("#FF0000")).toEqual([1, 0, 0]);
		// green
		expect(hexToRgba("#00FF00")).toEqual([0, 1, 0]);
		// blue
		expect(hexToRgba("#0000FF")).toEqual([0, 0, 1]);
		// arbitrary color #804020
		const [r, g, b] = hexToRgba("#804020");
		expect(r).toBeCloseTo(128 / 255);
		expect(g).toBeCloseTo(64 / 255);
		expect(b).toBeCloseTo(32 / 255);
	});

	it("handles invalid inputs gracefully", () => {
		// missing #
		expect(hexToRgba("FFFFFF")).toEqual([0, 0, 0]);
		expect(hexToRgba("invalid")).toEqual([0, 0, 0]);
		// undefined
		// @ts-expect-error testing invalid input
		expect(hexToRgba(undefined)).toEqual([0, 0, 0]);
		// null
		// @ts-expect-error testing invalid input
		expect(hexToRgba(null)).toEqual([0, 0, 0]);
		// number
		// @ts-expect-error testing invalid input
		expect(hexToRgba(123456)).toEqual([0, 0, 0]);
		// empty string
		expect(hexToRgba("")).toEqual([0, 0, 0]);
	});

	it("handles invalid hex formats gracefully", () => {
		// too short (not 3 or 6 hex digits) is invalid
		expect(hexToRgba("#FF")).toEqual([0, 0, 0]);
		// CSS shorthand expands #rgb -> #rrggbb
		expect(hexToRgba("#00f")).toEqual([0, 0, 1]);
		// nonsense characters still fall back
		expect(hexToRgba("#zzz")).toEqual([0, 0, 0]);
		// too long
		expect(hexToRgba("#FFFFFFFF")).toEqual([0, 0, 0]);
		// nonsense characters
		expect(hexToRgba("#XXYYZZ")).toEqual([0, 0, 0]);
	});
});
