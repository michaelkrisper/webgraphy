import { afterEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "../../themes";
import { embeddedFontCss, primaryFamily, waitForFonts } from "../exportFonts";

vi.mock("../exportFontFiles", () => ({
	FONT_FILES: {
		"IBM Plex Sans": [
			{ weight: 400, url: "/assets/plex-400.woff2" },
			{ weight: 700, url: "/assets/plex-700.woff2" },
		],
	},
}));

const okFetch = vi.fn(async (url: string) => ({
	ok: true,
	status: 200,
	arrayBuffer: async () =>
		new TextEncoder().encode(url.includes("400") ? "regular" : "bold").buffer,
}));

afterEach(() => {
	vi.clearAllMocks();
	vi.unstubAllGlobals();
});

describe("primaryFamily", () => {
	it("returns the first family of a stack, unquoted", () => {
		expect(primaryFamily(THEMES.light.fontFamily)).toBe("IBM Plex Sans");
		expect(primaryFamily("Georgia, serif")).toBe("Georgia");
	});
});

describe("embeddedFontCss", () => {
	it("embeds each weight of the theme font as base64 woff2", async () => {
		const css = await embeddedFontCss(
			THEMES.light.fontFamily,
			okFetch as unknown as typeof fetch,
		);
		expect(okFetch).toHaveBeenCalledWith("/assets/plex-400.woff2");
		expect(css).toContain(
			`@font-face{font-family:"IBM Plex Sans";font-style:normal;font-weight:400;src:url(data:font/woff2;base64,${btoa("regular")}) format("woff2");}`,
		);
		expect(css).toContain(
			`font-weight:700;src:url(data:font/woff2;base64,${btoa("bold")})`,
		);
	});

	it("returns nothing for a font it does not ship", async () => {
		expect(await embeddedFontCss("Papyrus, fantasy", okFetch as never)).toBe("");
		expect(okFetch).not.toHaveBeenCalled();
	});

	it("falls back to the font stack when a file cannot be fetched", async () => {
		const failing = vi.fn(async () => ({ ok: false, status: 404 }));
		expect(await embeddedFontCss(THEMES.light.fontFamily, failing as never)).toBe(
			"",
		);
		const offline = vi.fn(async () => {
			throw new TypeError("offline");
		});
		expect(await embeddedFontCss(THEMES.light.fontFamily, offline as never)).toBe(
			"",
		);
	});
});

describe("waitForFonts", () => {
	it("loads the regular and bold faces before resolving", async () => {
		const load = vi.fn(async () => []);
		vi.stubGlobal("document", { fonts: { load, ready: Promise.resolve() } });
		await waitForFonts('"IBM Plex Sans", sans-serif');
		expect(load).toHaveBeenCalledWith('12px "IBM Plex Sans", sans-serif');
		expect(load).toHaveBeenCalledWith('bold 16px "IBM Plex Sans", sans-serif');
	});

	it("does not fail the export when a font does not load", async () => {
		vi.stubGlobal("document", {
			fonts: {
				load: vi.fn(async () => Promise.reject(new Error("x"))),
				ready: Promise.resolve(),
			},
		});
		await expect(waitForFonts("X")).resolves.toBeUndefined();
	});
});
