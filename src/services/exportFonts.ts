import { FONT_FILES } from "./exportFontFiles";

/*
 * Font decision for exported images: the theme's UI font is *embedded* in the
 * SVG as base64 `@font-face` rules (files in exportFontFiles.ts, served from
 * the PWA precache offline). That costs ~60 KB per SVG but makes it render
 * identically in Inkscape, Illustrator or another browser — and it is what
 * makes the PNG match at all: an SVG drawn through <img> is sandboxed and
 * cannot see the page's fonts. Only the latin subset is embedded; other
 * scripts, and any failure to load the files, fall back through the theme's
 * font stack to a generic family (sans-serif, serif, monospace, cursive),
 * which every viewer resolves.
 */

/** First family of a CSS font stack, unquoted. */
export const primaryFamily = (fontFamily: string) =>
	fontFamily
		.split(",")[0]
		.trim()
		.replace(/^["']|["']$/g, "");

const toBase64 = (buf: ArrayBuffer) => {
	const bytes = new Uint8Array(buf);
	let binary = "";
	// Chunked: spreading a whole font into fromCharCode overflows the stack.
	for (let i = 0; i < bytes.length; i += 0x8000)
		binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
	return btoa(binary);
};

/**
 * `@font-face` rules embedding the theme font, or "" when the font is unknown
 * or cannot be fetched (the SVG then relies on the font stack's fallbacks).
 */
export async function embeddedFontCss(
	fontFamily: string,
	fetchImpl: typeof fetch = fetch,
): Promise<string> {
	const family = primaryFamily(fontFamily);
	const files = FONT_FILES[family];
	if (!files) return "";
	try {
		const rules = await Promise.all(
			files.map(async (f) => {
				const res = await fetchImpl(f.url);
				if (!res.ok) throw new Error(`HTTP ${res.status}`);
				const data = toBase64(await res.arrayBuffer());
				return `@font-face{font-family:"${family}";font-style:normal;font-weight:${f.weight};src:url(data:font/woff2;base64,${data}) format("woff2");}`;
			}),
		);
		return rules.join("");
	} catch {
		return "";
	}
}

/** Resolves once the theme font's regular and bold faces are usable. */
export async function waitForFonts(fontFamily: string): Promise<void> {
	const fonts = typeof document !== "undefined" ? document.fonts : undefined;
	if (!fonts) return;
	try {
		await Promise.all([
			fonts.load(`12px ${fontFamily}`),
			fonts.load(`bold 16px ${fontFamily}`),
		]);
		await fonts.ready;
	} catch {
		// A font that fails to load leaves the fallback in place; export anyway.
	}
}
