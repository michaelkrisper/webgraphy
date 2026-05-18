export type ThemeName = "light" | "dark" | "matrix" | "winnie" | "unicorn";

export interface Theme {
	fontFamily: string;
	fontFamilyMono: string;
	// Sidebar / UI
	bg: string;
	bg2: string;
	bg3: string;
	border: string;
	border2: string;
	text: string;
	textMid: string;
	textMuted: string;
	textLight: string;
	accent: string;
	danger: string;
	shadow: string;
	selectBg: string;
	selectColor: string;
	btnBorder: string;
	btnColor: string;
	cardBorder: string;
	sectionHeaderBg: string;
	// Chart
	plotBg: string;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	labelColor: string;
	secLabelBg: string;
	tooltipBg: string;
	tooltipColor: string;
	tooltipBorder: string;
	snapLineColor: string;
	tooltipDividerColor: string;
	tooltipSubColor: string;
	noDataColor: string;
}

export const THEMES: Record<ThemeName, Theme> = {
	// Modern light — warm near-white, cobalt accent, hairline borders
	light: {
		fontFamily: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
		fontFamilyMono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
		bg: "#ffffff",
		bg2: "#fafaf7",
		bg3: "#f1efeb",
		border: "#e6e3dc",
		border2: "#d6d2c8",
		text: "#1a1a17",
		textMid: "#3a3a35",
		textMuted: "#6b6760",
		textLight: "#a09c93",
		accent: "#1f4ed8",
		danger: "#c93636",
		shadow: "rgba(26,26,23,0.06)",
		selectBg: "#ffffff",
		selectColor: "#1a1a17",
		btnBorder: "#e6e3dc",
		btnColor: "#3a3a35",
		cardBorder: "#e6e3dc",
		sectionHeaderBg: "#fafaf7",
		plotBg: "#ffffff",
		axisColor: "#3a3a35",
		zeroLineColor: "#a09c93",
		gridColor: "#ececea",
		labelColor: "#6b6760",
		secLabelBg: "rgba(255,255,255,0.93)",
		tooltipBg: "rgba(255,255,255,0.97)",
		tooltipColor: "#1a1a17",
		tooltipBorder: "#d6d2c8",
		snapLineColor: "#d6d2c8",
		tooltipDividerColor: "rgba(26,26,23,0.07)",
		tooltipSubColor: "#6b6760",
		noDataColor: "#d6d2c8",
	},

	// Modern dark — desaturated blue-black
	dark: {
		fontFamily: '"IBM Plex Sans", "Helvetica Neue", Arial, sans-serif',
		fontFamilyMono: '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
		bg: "#15181f",
		bg2: "#0f1115",
		bg3: "#1c2028",
		border: "#23272f",
		border2: "#2e333d",
		text: "#e8e6e1",
		textMid: "#b8b6b1",
		textMuted: "#807c75",
		textLight: "#54514c",
		accent: "#5b8dff",
		danger: "#f06262",
		shadow: "rgba(0,0,0,0.5)",
		selectBg: "#1c2028",
		selectColor: "#b8b6b1",
		btnBorder: "#23272f",
		btnColor: "#807c75",
		cardBorder: "#23272f",
		sectionHeaderBg: "#0f1115",
		plotBg: "#0a0c10",
		axisColor: "#54514c",
		zeroLineColor: "#2e333d",
		gridColor: "#181a20",
		labelColor: "#807c75",
		secLabelBg: "rgba(15,17,21,0.93)",
		tooltipBg: "rgba(21,24,31,0.97)",
		tooltipColor: "#e8e6e1",
		tooltipBorder: "#2e333d",
		snapLineColor: "#2e333d",
		tooltipDividerColor: "rgba(255,255,255,0.05)",
		tooltipSubColor: "#807c75",
		noDataColor: "#23272f",
	},

	// Matrix — phosphor green on near-black
	matrix: {
		fontFamily: '"JetBrains Mono", "Share Tech Mono", "Courier New", monospace',
		fontFamilyMono: '"JetBrains Mono", "Share Tech Mono", "Courier New", monospace',
		bg: "#081109",
		bg2: "#040806",
		bg3: "#0c1a0e",
		border: "#13301a",
		border2: "#1d4a26",
		text: "#7dffa3",
		textMid: "#4fcc73",
		textMuted: "#2f9c4a",
		textLight: "#1f6230",
		accent: "#7dffa3",
		danger: "#ff5c5c",
		shadow: "rgba(125,255,163,0.1)",
		selectBg: "#040806",
		selectColor: "#7dffa3",
		btnBorder: "#13301a",
		btnColor: "#4fcc73",
		cardBorder: "#13301a",
		sectionHeaderBg: "#040806",
		plotBg: "#020503",
		axisColor: "#2f9c4a",
		zeroLineColor: "#13301a",
		gridColor: "#0a1a0d",
		labelColor: "#4fcc73",
		secLabelBg: "rgba(2,5,3,0.88)",
		tooltipBg: "rgba(4,8,6,0.96)",
		tooltipColor: "#7dffa3",
		tooltipBorder: "#1d4a26",
		snapLineColor: "#1d4a26",
		tooltipDividerColor: "rgba(125,255,163,0.1)",
		tooltipSubColor: "#2f9c4a",
		noDataColor: "#13301a",
	},

	// Winnie — warm editorial, deep oak on cream linen
	winnie: {
		fontFamily: '"Source Serif 4", "Lora", Georgia, serif',
		fontFamilyMono: '"JetBrains Mono", ui-monospace, monospace',
		bg: "#faf3df",
		bg2: "#f4ead4",
		bg3: "#ecdfbe",
		border: "#d9c290",
		border2: "#b8975c",
		text: "#3a2410",
		textMid: "#5b3a1a",
		textMuted: "#8a6634",
		textLight: "#b08c5b",
		accent: "#a0521b",
		danger: "#a23a1d",
		shadow: "rgba(58,36,16,0.12)",
		selectBg: "#faf3df",
		selectColor: "#3a2410",
		btnBorder: "#d9c290",
		btnColor: "#5b3a1a",
		cardBorder: "#d9c290",
		sectionHeaderBg: "#f4ead4",
		plotBg: "#faf3df",
		axisColor: "#5b3a1a",
		zeroLineColor: "#b8975c",
		gridColor: "#e8d8a8",
		labelColor: "#8a6634",
		secLabelBg: "rgba(250,243,223,0.92)",
		tooltipBg: "rgba(250,243,223,0.98)",
		tooltipColor: "#3a2410",
		tooltipBorder: "#d9c290",
		snapLineColor: "#b8975c",
		tooltipDividerColor: "rgba(58,36,16,0.10)",
		tooltipSubColor: "#8a6634",
		noDataColor: "#d9c290",
	},

	// Unicorn — refined vapor-pop
	unicorn: {
		fontFamily: '"Comic Neue", "Comic Sans MS", cursive',
		fontFamilyMono: '"Comic Neue", "Comic Sans MS", cursive',
		bg: "#ffffff",
		bg2: "#fff4fb",
		bg3: "#fde6f3",
		border: "#f9c8e0",
		border2: "#f191c1",
		text: "#4a1066",
		textMid: "#7b2da1",
		textMuted: "#b04dc4",
		textLight: "#dba5e0",
		accent: "#d422a4",
		danger: "#e23a7a",
		shadow: "rgba(212,34,164,0.18)",
		selectBg: "#fff4fb",
		selectColor: "#4a1066",
		btnBorder: "#f9c8e0",
		btnColor: "#7b2da1",
		cardBorder: "#f9c8e0",
		sectionHeaderBg: "#fff4fb",
		plotBg: "#fff4fb",
		axisColor: "#7b2da1",
		zeroLineColor: "#f191c1",
		gridColor: "#fcdcef",
		labelColor: "#b04dc4",
		secLabelBg: "rgba(255,244,251,0.9)",
		tooltipBg: "rgba(255,244,251,0.97)",
		tooltipColor: "#4a1066",
		tooltipBorder: "#f9c8e0",
		snapLineColor: "#f9c8e0",
		tooltipDividerColor: "rgba(212,34,164,0.12)",
		tooltipSubColor: "#b04dc4",
		noDataColor: "#f9c8e0",
	},
};

// Refined series palette — works on both light and dark
export const COLOR_PALETTE = [
	"#1f4ed8", // cobalt
	"#d97706", // amber
	"#0d8770", // teal
	"#db2777", // magenta
	"#7c3aed", // violet
	"#0891b2", // cyan
];

export const THEME_CYCLE: ThemeName[] = [
	"light",
	"dark",
	"matrix",
	"winnie",
	"unicorn",
];
