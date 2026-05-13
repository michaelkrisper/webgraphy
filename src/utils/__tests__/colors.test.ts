import { describe, expect, it } from "vitest";
import { hexToRgba, hexToRgb } from "../colors";

describe("colors", () => {
	describe("hexToRgb", () => {
		it("should correctly convert valid hex strings", () => {
			expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
			expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
			expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
			expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 });

			// Test an arbitrary color
			expect(hexToRgb("#804020")).toEqual({ r: 128, g: 64, b: 32 });
		});
	});

	describe("hexToRgba", () => {
		it("should correctly convert valid hex strings", () => {
			expect(hexToRgba("#000000")).toEqual([0, 0, 0]);
			expect(hexToRgba("#ffffff")).toEqual([1, 1, 1]);
			expect(hexToRgba("#ff0000")).toEqual([1, 0, 0]);
			expect(hexToRgba("#00ff00")).toEqual([0, 1, 0]);
			expect(hexToRgba("#0000ff")).toEqual([0, 0, 1]);

			// Test some arbitrary colors
			const [r, g, b] = hexToRgba("#804020");
			expect(r).toBeCloseTo(128 / 255, 3);
			expect(g).toBeCloseTo(64 / 255, 3);
			expect(b).toBeCloseTo(32 / 255, 3);
		});

		it("should handle invalid hex strings safely", () => {
			// Missing #
			expect(hexToRgba("ffffff")).toEqual([0, 0, 0]);

			// Incorrect length
			expect(hexToRgba("#fff")).toEqual([0, 0, 0]);
			expect(hexToRgba("#ffffffff")).toEqual([0, 0, 0]);

			// Invalid characters resulting in NaN
			expect(hexToRgba("#zzxxxx")).toEqual([0, 0, 0]);
		});

		it("should handle invalid types at runtime", () => {
			// @ts-expect-error testing runtime invalid type
			expect(hexToRgba(null)).toEqual([0, 0, 0]);

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgba(undefined)).toEqual([0, 0, 0]);

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgba(123)).toEqual([0, 0, 0]);

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgba({})).toEqual([0, 0, 0]);
		});
	});
});
