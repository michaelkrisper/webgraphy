// src/utils/colors.ts

const HEX_RE = /^#([0-9a-f]{6})$/i;

function parseHexChannels(
	hex: string,
): { r: number; g: number; b: number } | null {
	if (typeof hex !== "string") return null;

	let normalizedHex = hex;
	// Expand CSS shorthand #rgb -> #rrggbb
	if (/^#[0-9a-f]{3}$/i.test(normalizedHex)) {
		const [, r, g, b] = normalizedHex;
		normalizedHex = `#${r}${r}${g}${g}${b}${b}`;
	}

	const m = HEX_RE.exec(normalizedHex);
	if (!m) return null;
	const n = parseInt(m[1], 16);
	return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

export const hexToRgba = (hex: string): number[] => {
	const c = parseHexChannels(hex);
	return c ? [c.r / 255, c.g / 255, c.b / 255] : [0, 0, 0];
};

/** Normalised RGB channels for a hex string with an explicit alpha. */
export const hexToRgbaWithAlpha = (
	hex: string,
	alpha = 1,
): [number, number, number, number] => {
	const c = parseHexChannels(hex);
	return c
		? [c.r / 255, c.g / 255, c.b / 255, alpha]
		: [0, 0, 0, alpha];
};

const RGB_FN_RE = /^rgba?\(([^)]+)\)$/;

/**
 * Normalised [r,g,b,a] for a hex or rgb()/rgba() CSS color (theme colors like
 * `secLabelBg` carry their own alpha). Falls back to opaque black.
 */
export const cssToRgbaWithAlpha = (
	css: string,
	alpha = 1,
): [number, number, number, number] => {
	const c = parseHexChannels(css);
	if (c) return [c.r / 255, c.g / 255, c.b / 255, alpha];
	const m = RGB_FN_RE.exec(css.trim());
	if (m) {
		const parts = m[1].split(",").map((s) => Number.parseFloat(s));
		if (parts.length >= 3 && parts.slice(0, 3).every((n) => !Number.isNaN(n))) {
			const a = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : alpha;
			return [parts[0] / 255, parts[1] / 255, parts[2] / 255, a];
		}
	}
	return [0, 0, 0, alpha];
};

export const rgbToHex = (r: number, g: number, b: number): string => {
	const toHex = (n: number) => {
		const num = typeof n === "number" && !Number.isNaN(n) ? n : 0;
		const h = Math.max(0, Math.min(255, Math.round(num))).toString(16);
		return h.length === 1 ? `0${h}` : h;
	};
	return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
};

export function hexToRgb(hex: string) {
	return parseHexChannels(hex) ?? { r: 0, g: 0, b: 0 };
}

/**
 * CIELCH color conversion
 * L: Lightness (0-100)
 * C: Chroma (0-132)
 * H: Hue (0-360)
 */

export function rgbToLch(r: number, g: number, b: number) {
	// 1. RGB to XYZ
	let r_ = r / 255;
	let g_ = g / 255;
	let b_ = b / 255;

	r_ = r_ > 0.04045 ? ((r_ + 0.055) / 1.055) ** 2.4 : r_ / 12.92;
	g_ = g_ > 0.04045 ? ((g_ + 0.055) / 1.055) ** 2.4 : g_ / 12.92;
	b_ = b_ > 0.04045 ? ((b_ + 0.055) / 1.055) ** 2.4 : b_ / 12.92;

	r_ *= 100;
	g_ *= 100;
	b_ *= 100;

	const x = r_ * 0.4124 + g_ * 0.3576 + b_ * 0.1805;
	const y = r_ * 0.2126 + g_ * 0.7152 + b_ * 0.0722;
	const z = r_ * 0.0193 + g_ * 0.1192 + b_ * 0.9505;

	// 2. XYZ to Lab
	const x_ = x / 95.047;
	const y_ = y / 100.0;
	const z_ = z / 108.883;

	const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);

	const L = 116 * f(y_) - 16;
	const a = 500 * (f(x_) - f(y_));
	const b__ = 200 * (f(y_) - f(z_));

	// 3. Lab to LCH
	const C = Math.sqrt(a * a + b__ * b__);
	let h = Math.atan2(b__, a) * (180 / Math.PI);
	if (h < 0) h += 360;

	return { L, C, h };
}

export function lchToRgb(L: number, C: number, h: number) {
	// 1. LCH to Lab
	const a = Math.cos(h * (Math.PI / 180)) * C;
	const b_ = Math.sin(h * (Math.PI / 180)) * C;

	// 2. Lab to XYZ
	let y = (L + 16) / 116;
	let x = a / 500 + y;
	let z = y - b_ / 200;

	const fInv = (t: number) =>
		t ** 3 > 0.008856 ? t ** 3 : (t - 16 / 116) / 7.787;

	x = 95.047 * fInv(x);
	y = 100.0 * fInv(y);
	z = 108.883 * fInv(z);

	// 3. XYZ to RGB
	x /= 100;
	y /= 100;
	z /= 100;

	let r = x * 3.2406 + y * -1.5372 + z * -0.4986;
	let g = x * -0.9689 + y * 1.8758 + z * 0.0415;
	let b = x * 0.0557 + y * -0.204 + z * 1.057;

	const gamma = (t: number) =>
		t > 0.0031308 ? 1.055 * t ** (1 / 2.4) - 0.055 : 12.92 * t;

	r = Math.max(0, Math.min(255, Math.round(gamma(r) * 255)));
	g = Math.max(0, Math.min(255, Math.round(gamma(g) * 255)));
	b = Math.max(0, Math.min(255, Math.round(gamma(b) * 255)));

	return { r, g, b };
}
