import { describe, expect, it } from "vitest";
import { hexToRgba, rgbToHex } from "../colors";

describe("colors", () => {
	describe("rgbToHex", () => {
		it("should correctly convert standard rgb colors", () => {
			expect(rgbToHex(0, 0, 0)).toBe("#000000");
			expect(rgbToHex(255, 255, 255)).toBe("#ffffff");
			expect(rgbToHex(255, 0, 0)).toBe("#ff0000");
			expect(rgbToHex(0, 255, 0)).toBe("#00ff00");
			expect(rgbToHex(0, 0, 255)).toBe("#0000ff");
		});

		it("should pad single-character hex values with a leading zero", () => {
			expect(rgbToHex(15, 10, 5)).toBe("#0f0a05");
			expect(rgbToHex(0, 1, 2)).toBe("#000102");
		});

		it("should round floating-point numbers", () => {
			expect(rgbToHex(254.5, 128.2, 63.8)).toBe("#ff8040");
		});

		it("should clamp out-of-bounds numbers to 0-255", () => {
			expect(rgbToHex(-10, -100, -1)).toBe("#000000");
			expect(rgbToHex(256, 1000, 300)).toBe("#ffffff");
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
