import { useSyncExternalStore } from "react";
import { type FontSet, loadFontSet } from "../fonts";
import {
	THEME_COLOR_SCHEME,
	THEME_CYCLE,
	THEMES,
	type ThemeName,
	themeChromeColor,
} from "../themes";

const STORAGE_KEY = "theme";

const THEME_FONT: Record<ThemeName, FontSet> = {
	light: "plex",
	dark: "plex",
	matrix: "jetbrains",
	winnie: "serif",
	unicorn: "comic",
};

// One list for the module's lifetime: getSnapshot runs on every render, and
// each matchMedia() call allocates a new MediaQueryList.
const darkQuery =
	typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia("(prefers-color-scheme: dark)")
		: null;

function storedTheme(): ThemeName | null {
	if (typeof localStorage === "undefined") return null;
	const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
	return THEME_CYCLE.includes(stored as ThemeName) ? stored : null;
}

/** An explicit choice wins; without one the OS light/dark preference does. */
function getSnapshot(): ThemeName {
	return storedTheme() ?? (darkQuery?.matches ? "dark" : "light");
}

const listeners = new Set<() => void>();

// Apply font/theme on module load so body font is set before first render.
// Not persisted: storing the OS-derived default would freeze it, and a later
// OS switch would no longer reach a user who never picked a theme.
applyTheme(getSnapshot(), false);

darkQuery?.addEventListener?.("change", () => {
	if (!storedTheme()) applyTheme(getSnapshot(), false);
});

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function persistTheme(t: ThemeName) {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(STORAGE_KEY, t);
	}
}

/** Sets every `<meta name>` of that name (creating one if there is none). */
function setMeta(name: string, content: string) {
	const metas = document.head.querySelectorAll<HTMLMetaElement>(
		`meta[name="${name}"]`,
	);
	if (metas.length === 0) {
		const meta = document.createElement("meta");
		meta.name = name;
		meta.content = content;
		document.head.append(meta);
	}
	// index.html carries one theme-color per prefers-color-scheme for the
	// first paint; once a theme is applied it wins whatever the OS says.
	for (const meta of metas) meta.content = content;
}

function updateThemeDOM(t: ThemeName) {
	const root = document.documentElement;
	const scheme = THEME_COLOR_SCHEME[t];
	root.dataset.theme = t;
	root.classList.toggle("dark", scheme === "dark");
	root.style.colorScheme = scheme;
	setMeta("color-scheme", scheme);
	setMeta("theme-color", themeChromeColor(t));
}

function updateThemeVariables(t: ThemeName) {
	const theme = THEMES[t];
	const s = document.documentElement.style;
	s.setProperty("--font-family", theme.fontFamily);
	s.setProperty("--font-family-mono", theme.fontFamilyMono);
	s.setProperty("--text-color", theme.text);
	s.setProperty("--text-muted-color", theme.textMuted);
	s.setProperty("--plot-bg", theme.plotBg);
	s.setProperty("--sidebar-bg", theme.bg2);
	s.setProperty("--border-color", theme.border);
	s.setProperty("--bg", theme.bg);
	s.setProperty("--bg2", theme.bg2);
	s.setProperty("--bg3", theme.bg3);
	s.setProperty("--border2", theme.border2);
	s.setProperty("--accent", theme.accent);
	s.setProperty("--danger", theme.danger);
	s.setProperty("--success", theme.success);
	s.setProperty("--shadow", theme.shadow);
	s.setProperty("--text-mid", theme.textMid);
	s.setProperty("--text-light", theme.textLight);
	s.setProperty("--select-bg", theme.selectBg);
	s.setProperty("--select-color", theme.selectColor);
	s.setProperty("--btn-border", theme.btnBorder);
	s.setProperty("--btn-color", theme.btnColor);
	s.setProperty("--card-border", theme.cardBorder);
	s.setProperty("--section-header-bg", theme.sectionHeaderBg);
	s.setProperty("--axis-color", theme.axisColor);
	s.setProperty("--tooltip-bg", theme.tooltipBg);
	s.setProperty("--tooltip-color", theme.tooltipColor);
	s.setProperty("--tooltip-border", theme.tooltipBorder);
	s.setProperty("--snap-line-color", theme.snapLineColor);
	s.setProperty("--tooltip-divider-color", theme.tooltipDividerColor);
	s.setProperty("--tooltip-sub-color", theme.tooltipSubColor);
	s.setProperty("--no-data-color", theme.noDataColor);
}

function notifyListeners() {
	listeners.forEach((cb) => {
		cb();
	});
}

function applyTheme(t: ThemeName, persist = true) {
	void loadFontSet(THEME_FONT[t]);
	if (persist) persistTheme(t);
	updateThemeDOM(t);
	updateThemeVariables(t);
	notifyListeners();
}

/**
 * Loads a theme's fonts without applying the theme, resolving once their
 * faces are registered — for drawing in a theme other than the shown one.
 */
export const loadThemeFonts = (t: ThemeName): Promise<void> =>
	loadFontSet(THEME_FONT[t]);

export function useTheme(): [ThemeName, () => void, (t: ThemeName) => void] {
	const theme = useSyncExternalStore(subscribe, getSnapshot);
	const cycle = () =>
		applyTheme(
			THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length],
		);
	const set = (t: ThemeName) => applyTheme(t);
	return [theme, cycle, set];
}
