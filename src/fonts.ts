// Self-hosted webfonts — replaces the runtime Google Fonts CDN <link> loads
// that used to live in useTheme.ts / index.html. Keeping the fonts in-bundle
// means: no user IP leaked to Google (GDPR), fonts work offline, and no
// external round-trip on first paint or theme switch.
//
// Each loader dynamic-imports one woff2-only fonts-<set>.css (the @fontsource
// *latin-subset* faces, which cover all German/English glyphs incl. äöüß), so
// a theme's fonts are only fetched the first time that theme is applied. The
// PWA precaches the default themes' set (plex); the others are cached on first
// use and fall back through the theme's font stack while offline before that
// (see pwaWorkbox.ts).
export type FontSet = "plex" | "jetbrains" | "serif" | "comic";

const loaders: Record<FontSet, () => Promise<unknown>> = {
	// light + dark: IBM Plex Sans (UI) + IBM Plex Mono (code/values)
	plex: () => import("./fonts-plex.css"),
	// matrix: JetBrains Mono for both UI and values
	jetbrains: () => import("./fonts-jetbrains.css"),
	// winnie: Source Serif 4 (UI, incl. italic) + JetBrains Mono (values)
	serif: () =>
		Promise.all([import("./fonts-serif.css"), import("./fonts-jetbrains.css")]),
	// unicorn: Comic Neue
	comic: () => import("./fonts-comic.css"),
};

const loaded = new Map<FontSet, Promise<void>>();

/** Resolves once the set's @font-face rules are in; never rejects. */
export function loadFontSet(set: FontSet): Promise<void> {
	let pending = loaded.get(set);
	if (!pending) {
		// A failed font fetch must never break theming.
		pending = loaders[set]().then(
			() => {},
			() => {},
		);
		loaded.set(set, pending);
	}
	return pending;
}
