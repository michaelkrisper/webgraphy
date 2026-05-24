import { describe, expect, it } from "vitest";
import { hexToRgb, hexToRgba, lchToRgb, rgbToHex, rgbToLch } from "../colors";

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
			expect(rgbToHex(-Infinity, -Infinity, -Infinity)).toBe("#000000");
			expect(rgbToHex(Infinity, Infinity, Infinity)).toBe("#ffffff");
		});

		it("should handle invalid types and NaN gracefully", () => {
			expect(rgbToHex(NaN, NaN, NaN)).toBe("#000000");
			// @ts-expect-error testing runtime invalid type
			expect(rgbToHex(null, null, null)).toBe("#000000");
			// @ts-expect-error testing runtime invalid type
			expect(rgbToHex(undefined, undefined, undefined)).toBe("#000000");
			// @ts-expect-error testing runtime invalid type
			expect(rgbToHex({}, [], "string")).toBe("#000000");
		});
	});

	describe("hexToRgb", () => {
		it("should handle empty or whitespace-only strings", () => {
			expect(hexToRgb("")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("   ")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("\n\t")).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should handle valid hex strings with surrounding whitespace", () => {
			expect(hexToRgb("  #ff0000  ")).toEqual({ r: 0, g: 0, b: 0 }); // Note: HEX_RE expects exactly the hex string, no spaces allowed around it.
			expect(hexToRgb(" \n#00ff00\t ")).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should correctly convert valid hex strings", () => {
			expect(hexToRgb("#000000")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("#ffffff")).toEqual({ r: 255, g: 255, b: 255 });
			expect(hexToRgb("#ff0000")).toEqual({ r: 255, g: 0, b: 0 });
			expect(hexToRgb("#00ff00")).toEqual({ r: 0, g: 255, b: 0 });
			expect(hexToRgb("#0000ff")).toEqual({ r: 0, g: 0, b: 255 });

			// Test an arbitrary color
			expect(hexToRgb("#804020")).toEqual({ r: 128, g: 64, b: 32 });
		});

		it("should handle invalid hex strings safely", () => {
			// Missing #
			expect(hexToRgb("ffffff")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("invalid")).toEqual({ r: 0, g: 0, b: 0 });

			// Incorrect length
			expect(hexToRgb("#fff")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("#ffffffff")).toEqual({ r: 0, g: 0, b: 0 });
			expect(hexToRgb("#zzz")).toEqual({ r: 0, g: 0, b: 0 });

			// Invalid characters resulting in NaN
			expect(hexToRgb("#zzxxxx")).toEqual({ r: 0, g: 0, b: 0 });
		});

		it("should accept mixed-case hex digits", () => {
			// Mixed case should parse identically to lowercase
			expect(hexToRgb("#AaBbCc")).toEqual(hexToRgb("#aabbcc"));
			expect(hexToRgb("#FF0080")).toEqual({ r: 255, g: 0, b: 128 });
		});

		it("should handle invalid types at runtime", () => {
			// @ts-expect-error testing runtime invalid type
			expect(hexToRgb(null)).toEqual({ r: 0, g: 0, b: 0 });

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgb(undefined)).toEqual({ r: 0, g: 0, b: 0 });

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgb(123)).toEqual({ r: 0, g: 0, b: 0 });

			// @ts-expect-error testing runtime invalid type
			expect(hexToRgb({})).toEqual({ r: 0, g: 0, b: 0 });
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
			expect(hexToRgba("invalid")).toEqual([0, 0, 0]);

			// Incorrect length
			expect(hexToRgba("#fff")).toEqual([0, 0, 0]);
			expect(hexToRgba("#ffffffff")).toEqual([0, 0, 0]);
			expect(hexToRgba("#zzz")).toEqual([0, 0, 0]);

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
			const red = lchToRgb(53.23, 104.58, 40.0);
			expect(red.r).toBeGreaterThanOrEqual(254);
			expect(red.g).toBeLessThanOrEqual(1);
			expect(red.b).toBeLessThanOrEqual(1);

			// Green
			const green = lchToRgb(87.74, 119.78, 136.02);
			expect(green.r).toBeLessThanOrEqual(1);
			expect(green.g).toBeGreaterThanOrEqual(254);
			expect(green.b).toBeLessThanOrEqual(1);

			// Blue
			const blue = lchToRgb(32.3, 133.82, 306.29);
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

		it("should correctly handle linear sRGB conversion for very dark colors", () => {
			const dark = lchToRgb(2.7, 0, 0); // ~ rgb(10, 10, 10)
			expect(dark.r).toBeCloseTo(10, -1);
			expect(dark.g).toBeCloseTo(10, -1);
			expect(dark.b).toBeCloseTo(10, -1);
		});

		it("should wrap hue angles correctly", () => {
			const base = lchToRgb(50, 50, 45);
			const over360 = lchToRgb(50, 50, 405); // 45 + 360
			const negative = lchToRgb(50, 50, -315); // 45 - 360

			expect(over360).toEqual(base);
			expect(negative).toEqual(base);
		});

		it("should produce the same grayscale output regardless of hue when chroma is zero", () => {
			const gray0 = lchToRgb(50, 0, 0);
			const gray180 = lchToRgb(50, 0, 180);
			const gray360 = lchToRgb(50, 0, 360);

			expect(gray180).toEqual(gray0);
			expect(gray360).toEqual(gray0);
		});
	});

	describe("rgbToLch", () => {
		it.each([
			{
				r: 0,
				g: 0,
				b: 0,
				expectedL: 0,
				expectedC: 0,
				expectedH: 0,
				name: "black",
			},
			{
				r: 255,
				g: 255,
				b: 255,
				expectedL: 100,
				expectedC: 0,
				expectedH: 0,
				name: "white",
			},
			{
				r: 255,
				g: 0,
				b: 0,
				expectedL: 53.2,
				expectedC: 104.6,
				expectedH: 40.0,
				name: "red",
			},
			{
				r: 0,
				g: 255,
				b: 0,
				expectedL: 87.7,
				expectedC: 119.8,
				expectedH: 136.0,
				name: "green",
			},
			{
				r: 0,
				g: 0,
				b: 255,
				expectedL: 32.3,
				expectedC: 133.8,
				expectedH: 306.3,
				name: "blue",
			},
			{
				r: 0,
				g: 255,
				b: 255,
				expectedL: 91.1,
				expectedC: 50.1,
				expectedH: 196.4,
				name: "cyan",
			},
			{
				r: 255,
				g: 0,
				b: 255,
				expectedL: 60.3,
				expectedC: 115.6,
				expectedH: 328.2,
				name: "magenta",
			},
			{
				r: 255,
				g: 255,
				b: 0,
				expectedL: 97.1,
				expectedC: 96.9,
				expectedH: 102.9,
				name: "yellow",
			},
			{
				r: 128,
				g: 128,
				b: 128,
				expectedL: 53.6,
				expectedC: 0,
				expectedH: 0,
				name: "gray",
			},
			{
				r: 10,
				g: 10,
				b: 10,
				expectedL: 2.7,
				expectedC: 0,
				expectedH: 0,
				name: "very dark color (linear sRGB)",
			},
		])("should correctly convert $name", ({
			r,
			g,
			b,
			expectedL,
			expectedC,
			expectedH,
		}) => {
			const { L, C, h } = rgbToLch(r, g, b);
			expect(L).toBeCloseTo(expectedL, 1);
			expect(C).toBeCloseTo(expectedC, 1);
			if (expectedC > 0 || (r === 0 && g === 0 && b === 0)) {
				// hue is only relevant if chroma > 0, except for black test case specifically checking it to be 0
				expect(h).toBeCloseTo(expectedH, 1);
			}
		});

		it("should wrap negative hue values", () => {
			const { h } = rgbToLch(0, 0, 255);
			// Blue produces a negative hue internally before wrap
			expect(h).toBeGreaterThanOrEqual(0);
			expect(h).toBeLessThan(360);
		});
	});
});
