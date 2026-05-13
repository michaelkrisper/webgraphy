import { describe, expect, it } from "vitest";
import { hexToRgba, rgbToLch, lchToRgb } from "../colors";

describe("colors", () => {
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

	describe("lchToRgb", () => {
		it("should correctly convert known LCH values to RGB", () => {
			// Black
			expect(lchToRgb(0, 0, 0)).toEqual({ r: 0, g: 0, b: 0 });

			// White
			expect(lchToRgb(100, 0.01, 296.81)).toEqual({ r: 255, g: 255, b: 255 });

			// Red
			const red = lchToRgb(53.23, 104.58, 40.00);
			expect(red.r).toBeGreaterThanOrEqual(254);
			expect(red.g).toBeLessThanOrEqual(1);
			expect(red.b).toBeLessThanOrEqual(1);

			// Green
			const green = lchToRgb(87.74, 119.78, 136.02);
			expect(green.r).toBeLessThanOrEqual(1);
			expect(green.g).toBeGreaterThanOrEqual(254);
			expect(green.b).toBeLessThanOrEqual(1);

			// Blue
			const blue = lchToRgb(32.30, 133.82, 306.29);
			expect(blue.r).toBeLessThanOrEqual(1);
			expect(blue.g).toBeLessThanOrEqual(1);
			expect(blue.b).toBeGreaterThanOrEqual(254);
		});

		it("should be the inverse of rgbToLch for standard colors", () => {
			const colors = [
				{ r: 0, g: 0, b: 0 },
				{ r: 255, g: 255, b: 255 },
				{ r: 255, g: 0, b: 0 },
				{ r: 0, g: 255, b: 0 },
				{ r: 0, g: 0, b: 255 },
				{ r: 128, g: 128, b: 128 },
				{ r: 255, g: 255, b: 0 },
				{ r: 0, g: 255, b: 255 },
				{ r: 255, g: 0, b: 255 },
			];

			for (const c of colors) {
				const lch = rgbToLch(c.r, c.g, c.b);
				const rgb = lchToRgb(lch.L, lch.C, lch.h);

				// Allow small precision differences
				expect(Math.abs(rgb.r - c.r)).toBeLessThanOrEqual(1);
				expect(Math.abs(rgb.g - c.g)).toBeLessThanOrEqual(1);
				expect(Math.abs(rgb.b - c.b)).toBeLessThanOrEqual(1);
			}
		});

		it("should clamp output to valid RGB ranges (0-255)", () => {
			// Super high lightness/chroma
			const overblown = lchToRgb(150, 200, 180);
			expect(overblown.r).toBeLessThanOrEqual(255);
			expect(overblown.g).toBeLessThanOrEqual(255);
			expect(overblown.b).toBeLessThanOrEqual(255);
			expect(overblown.r).toBeGreaterThanOrEqual(0);
			expect(overblown.g).toBeGreaterThanOrEqual(0);
			expect(overblown.b).toBeGreaterThanOrEqual(0);

			// Negative lightness
			const negativeLightness = lchToRgb(-50, 50, 90);
			expect(negativeLightness.r).toBeGreaterThanOrEqual(0);
			expect(negativeLightness.g).toBeGreaterThanOrEqual(0);
			expect(negativeLightness.b).toBeGreaterThanOrEqual(0);
			expect(negativeLightness.r).toBeLessThanOrEqual(255);
			expect(negativeLightness.g).toBeLessThanOrEqual(255);
			expect(negativeLightness.b).toBeLessThanOrEqual(255);
		});
		});
});
