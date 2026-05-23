import { useSyncExternalStore } from "react";
import { THEME_CYCLE, THEMES, type ThemeName } from "../themes";

const STORAGE_KEY = "theme";
const loadedFonts = new Set<string>();

const PLEX_URL =
	"https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&display=swap";
const JETBRAINS_URL =
	"https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;600&display=swap";
const SERIF_URL =
	"https://fonts.googleapis.com/css2?family=Source+Serif+4:ital,wght@0,400;0,600;1,400&family=JetBrains+Mono:wght@400;500&display=swap";
const COMIC_URL =
	"https://fonts.googleapis.com/css2?family=Comic+Neue:wght@400;700&display=swap";

const FONT_URLS: Partial<Record<ThemeName, string>> = {
	light: PLEX_URL,
	dark: PLEX_URL,
	matrix: JETBRAINS_URL,
	winnie: SERIF_URL,
	unicorn: COMIC_URL,
};

function loadFont(theme: ThemeName) {
	const url = FONT_URLS[theme];
	if (!url || loadedFonts.has(theme)) return;
	loadedFonts.add(theme);
	const link = document.createElement("link");
	link.rel = "stylesheet";
	link.href = url;
	document.head.appendChild(link);
}

function getSnapshot(): ThemeName {
	if (typeof localStorage === "undefined") return "light";
	const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
	return THEME_CYCLE.includes(stored as ThemeName)
		? (stored as ThemeName)
		: "light";
}

const listeners = new Set<() => void>();

// Apply font/theme on module load so body font is set before first render
applyTheme(getSnapshot());

function subscribe(cb: () => void) {
	listeners.add(cb);
	return () => listeners.delete(cb);
}

function persistTheme(t: ThemeName) {
	if (typeof localStorage !== "undefined") {
		localStorage.setItem(STORAGE_KEY, t);
	}
}

function updateThemeDOM(t: ThemeName) {
	document.documentElement.dataset.theme = t;
	document.documentElement.classList.toggle(
		"dark",
		t === "dark" || t === "matrix",
	);
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

function applyTheme(t: ThemeName) {
	loadFont(t);
	persistTheme(t);
	updateThemeDOM(t);
	updateThemeVariables(t);
	notifyListeners();
}

export function useTheme(): [ThemeName, () => void, (t: ThemeName) => void] {
	const theme = useSyncExternalStore(subscribe, getSnapshot);
	const cycle = () =>
		applyTheme(
			THEME_CYCLE[(THEME_CYCLE.indexOf(theme) + 1) % THEME_CYCLE.length],
		);
	const set = (t: ThemeName) => applyTheme(t);
	return [theme, cycle, set];
}
