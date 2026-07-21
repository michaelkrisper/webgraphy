// Self-hosted webfonts — replaces the runtime Google Fonts CDN <link> loads
// that used to live in useTheme.ts / index.html. Keeping the fonts in-bundle
// means: no user IP leaked to Google (GDPR), fonts work fully offline (the
// PWA precaches the woff2), and no external round-trip on first paint or theme
// switch.
//
// Each loader dynamic-imports the @fontsource *latin-subset* CSS for one
// theme's fonts, so a theme's woff2 is only fetched the first time that theme
// is applied. The latin subset covers all German/English glyphs (incl. äöüß).
export type FontSet = "plex" | "jetbrains" | "serif" | "comic";

const loaders: Record<FontSet, () => Promise<unknown>> = {
	// light + dark: IBM Plex Sans (UI) + IBM Plex Mono (code/values)
	plex: () =>
		Promise.all([
			import("@fontsource/ibm-plex-sans/latin-400.css"),
			import("@fontsource/ibm-plex-sans/latin-500.css"),
			import("@fontsource/ibm-plex-sans/latin-600.css"),
			import("@fontsource/ibm-plex-sans/latin-700.css"),
			import("@fontsource/ibm-plex-mono/latin-400.css"),
			import("@fontsource/ibm-plex-mono/latin-500.css"),
			import("@fontsource/ibm-plex-mono/latin-600.css"),
		]),
	// matrix: JetBrains Mono for both UI and values
	jetbrains: () =>
		Promise.all([
			import("@fontsource/jetbrains-mono/latin-400.css"),
			import("@fontsource/jetbrains-mono/latin-500.css"),
			import("@fontsource/jetbrains-mono/latin-600.css"),
		]),
	// winnie: Source Serif 4 (UI, incl. italic) + JetBrains Mono (values)
	serif: () =>
		Promise.all([
			import("@fontsource/source-serif-4/latin-400.css"),
			import("@fontsource/source-serif-4/latin-600.css"),
			import("@fontsource/source-serif-4/latin-400-italic.css"),
			import("@fontsource/jetbrains-mono/latin-400.css"),
			import("@fontsource/jetbrains-mono/latin-500.css"),
		]),
	// unicorn: Comic Neue
	comic: () =>
		Promise.all([
			import("@fontsource/comic-neue/latin-400.css"),
			import("@fontsource/comic-neue/latin-700.css"),
		]),
};

const loaded = new Set<FontSet>();

export function loadFontSet(set: FontSet): void {
	if (loaded.has(set)) return;
	loaded.add(set);
	// Fire-and-forget; a failed font fetch must never break theming.
	void loaders[set]().catch(() => {});
}
