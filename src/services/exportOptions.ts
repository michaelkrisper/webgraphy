import type { ImageExportRequest } from "./export";

export type ImageFormat = "svg" | "png";
export type SizeUnit = "px" | "mm";
export type LegendPosition =
	| "auto"
	| "top-right"
	| "top-left"
	| "bottom-right"
	| "bottom-left"
	| "outside-right";
export type SizePresetId =
	| "view"
	| "1200x800"
	| "1920x1080"
	| "journal-single"
	| "journal-double"
	| "custom";

export interface SizePreset {
	id: SizePresetId;
	label: string;
	/** Absent for "view" (the plot's on-screen size) and "custom". */
	size?: { width: number; height: number; unit: SizeUnit };
}

// Common journal column widths; the heights keep a print-friendly ~4:3 / ~16:10.
export const SIZE_PRESETS: SizePreset[] = [
	{ id: "view", label: "Current view" },
	{
		id: "1200x800",
		label: "1200 × 800 px",
		size: { width: 1200, height: 800, unit: "px" },
	},
	{
		id: "1920x1080",
		label: "1920 × 1080 px",
		size: { width: 1920, height: 1080, unit: "px" },
	},
	{
		id: "journal-single",
		label: "Journal single column (85 × 64 mm)",
		size: { width: 85, height: 64, unit: "mm" },
	},
	{
		id: "journal-double",
		label: "Journal double column (178 × 110 mm)",
		size: { width: 178, height: 110, unit: "mm" },
	},
	{ id: "custom", label: "Custom…" },
];

export const PNG_SCALES = [1, 2, 3] as const;
export type PngScale = (typeof PNG_SCALES)[number];

export interface ImageExportOptions {
	format: ImageFormat;
	preset: SizePresetId;
	customWidth: number;
	customHeight: number;
	customUnit: SizeUnit;
	/** Print resolution for millimetre sizes (PNG pixel density). */
	dpi: number;
	/** Pixel ratio for pixel sizes (PNG only). */
	scale: PngScale;
	legend: boolean;
	legendPosition: LegendPosition;
	title: string;
	transparent: boolean;
}

export const DEFAULT_EXPORT_OPTIONS: ImageExportOptions = {
	format: "png",
	preset: "view",
	customWidth: 1200,
	customHeight: 800,
	customUnit: "px",
	dpi: 300,
	scale: 2,
	legend: true,
	legendPosition: "auto",
	title: "",
	transparent: false,
};

export const MIN_DPI = 72;
export const MAX_DPI = 1200;
/** Smallest plot the layout can still draw axes into. */
export const MIN_SIZE_PX = 100;
export const MIN_SIZE_MM = 20;
/** CSS reference resolution: 1 in = 96 px. */
export const CSS_DPI = 96;
const MM_PER_INCH = 25.4;

// Chromium/Firefox reject canvases beyond 32767 px per side or ~268 M px area;
// Safari is stricter per side, so 16384 is the safe common side bound.
export const MAX_CANVAS_SIDE = 16384;
export const MAX_CANVAS_AREA = 268_435_456;

const STORAGE_KEY = "webgraphy-export-options";

const d = DEFAULT_EXPORT_OPTIONS;
const PRESET_IDS = SIZE_PRESETS.map((p) => p.id);
const LEGEND_POSITIONS: LegendPosition[] = [
	"auto",
	"top-right",
	"top-left",
	"bottom-right",
	"bottom-left",
	"outside-right",
];

const oneOf = <T>(v: unknown, allowed: readonly T[], fallback: T): T =>
	allowed.includes(v as T) ? (v as T) : fallback;
const inRange = (v: unknown, min: number, max: number, fallback: number) =>
	typeof v === "number" && Number.isFinite(v) && v >= min && v <= max
		? v
		: fallback;
const bool = (v: unknown, fallback: boolean) =>
	typeof v === "boolean" ? v : fallback;

const parseOptions = (o: Record<string, unknown>): ImageExportOptions => ({
	format: oneOf(o.format, ["svg", "png"] as const, d.format),
	preset: oneOf(o.preset, PRESET_IDS, d.preset),
	customWidth: inRange(o.customWidth, 1, 100_000, d.customWidth),
	customHeight: inRange(o.customHeight, 1, 100_000, d.customHeight),
	customUnit: oneOf(o.customUnit, ["px", "mm"] as const, d.customUnit),
	dpi: inRange(o.dpi, MIN_DPI, MAX_DPI, d.dpi),
	scale: oneOf(o.scale, PNG_SCALES, d.scale),
	legend: bool(o.legend, d.legend),
	legendPosition: oneOf(o.legendPosition, LEGEND_POSITIONS, d.legendPosition),
	title: typeof o.title === "string" ? o.title.slice(0, 500) : d.title,
	transparent: bool(o.transparent, d.transparent),
});

/** Last used options; unknown or corrupt entries fall back field by field. */
export function loadExportOptions(
	storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage,
): ImageExportOptions {
	try {
		const raw = storage?.getItem(STORAGE_KEY);
		if (!raw) return { ...d };
		const parsed: unknown = JSON.parse(raw);
		if (typeof parsed !== "object" || parsed === null) return { ...d };
		return parseOptions(parsed as Record<string, unknown>);
	} catch {
		return { ...d };
	}
}

export function saveExportOptions(
	options: ImageExportOptions,
	storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage,
): void {
	try {
		storage?.setItem(STORAGE_KEY, JSON.stringify(options));
	} catch {
		// Quota or privacy mode: forgetting the options is harmless.
	}
}

export const mmToPx = (mm: number, dpi: number) => (mm / MM_PER_INCH) * dpi;

export interface ResolvedExportSize {
	/** Layout size in CSS px (the SVG viewBox). */
	width: number;
	height: number;
	/** Rasterised PNG size in device pixels. */
	pixelWidth: number;
	pixelHeight: number;
	pixelRatio: number;
	/** Set for millimetre sizes: the SVG's physical width/height. */
	physical?: { widthMm: number; heightMm: number };
}

/**
 * Turns the chosen size into a layout size plus PNG pixel size. Millimetre
 * sizes lay out at the CSS reference 96 dpi, so a 12 px label prints at 9 pt
 * whatever the dpi, and the dpi only sets the rasterised pixel density.
 */
export function resolveExportSize(
	options: ImageExportOptions,
	view: { width: number; height: number },
): ResolvedExportSize {
	const preset = SIZE_PRESETS.find((p) => p.id === options.preset);
	const size =
		options.preset === "view"
			? { width: view.width, height: view.height, unit: "px" as const }
			: options.preset === "custom" || !preset?.size
				? {
						width: options.customWidth,
						height: options.customHeight,
						unit: options.customUnit,
					}
				: preset.size;

	if (size.unit === "mm") {
		const width = mmToPx(size.width, CSS_DPI);
		const height = mmToPx(size.height, CSS_DPI);
		return {
			width,
			height,
			pixelWidth: Math.round(mmToPx(size.width, options.dpi)),
			pixelHeight: Math.round(mmToPx(size.height, options.dpi)),
			pixelRatio: options.dpi / CSS_DPI,
			physical: { widthMm: size.width, heightMm: size.height },
		};
	}
	const width = Math.round(size.width);
	const height = Math.round(size.height);
	return {
		width,
		height,
		pixelWidth: Math.round(width * options.scale),
		pixelHeight: Math.round(height * options.scale),
		pixelRatio: options.scale,
	};
}

/** A message naming the violated limit, or null when the canvas is allowed. */
export function canvasLimitError(
	pixelWidth: number,
	pixelHeight: number,
	limits = { maxSide: MAX_CANVAS_SIDE, maxArea: MAX_CANVAS_AREA },
): string | null {
	const size = `${pixelWidth} × ${pixelHeight} px`;
	if (Math.max(pixelWidth, pixelHeight) > limits.maxSide)
		return `Image too large: ${size} exceeds the browser limit of ${limits.maxSide} px per side. Choose a smaller size, scale or dpi.`;
	if (pixelWidth * pixelHeight > limits.maxArea)
		return `Image too large: ${size} exceeds the browser limit of ${Math.round(limits.maxArea / 1e6)} megapixels. Choose a smaller size, scale or dpi.`;
	return null;
}

/** Validation message for the size fields, or null when they are usable. */
export function sizeFieldError(options: ImageExportOptions): string | null {
	if (options.preset !== "custom") return null;
	const min = options.customUnit === "mm" ? MIN_SIZE_MM : MIN_SIZE_PX;
	const { customWidth: w, customHeight: h } = options;
	if (!Number.isFinite(w) || !Number.isFinite(h) || w < min || h < min)
		return `Width and height must be at least ${min} ${options.customUnit}.`;
	return null;
}

/** The size unit the chosen preset (or the custom size) is given in. */
export const effectiveUnit = (options: ImageExportOptions): SizeUnit =>
	options.preset === "custom"
		? options.customUnit
		: (SIZE_PRESETS.find((p) => p.id === options.preset)?.size?.unit ?? "px");

/** First problem that blocks the export, or null when it can proceed. */
export function validateExportOptions(
	options: ImageExportOptions,
	view: { width: number; height: number },
): string | null {
	const sizeError = sizeFieldError(options);
	if (sizeError) return sizeError;
	if (options.format !== "png") return null;
	if (
		effectiveUnit(options) === "mm" &&
		!(options.dpi >= MIN_DPI && options.dpi <= MAX_DPI)
	)
		return `Resolution must be between ${MIN_DPI} and ${MAX_DPI} dpi.`;
	const size = resolveExportSize(options, view);
	return canvasLimitError(size.pixelWidth, size.pixelHeight);
}

/** The request `exportImage` takes, for these options. */
export function buildExportRequest(
	options: ImageExportOptions,
	view: { width: number; height: number },
): ImageExportRequest {
	const size = resolveExportSize(options, view);
	return {
		format: options.format,
		width: size.width,
		height: size.height,
		pixelRatio: size.pixelRatio,
		physical: size.physical,
		title: options.title.trim(),
		legend: options.legend ? options.legendPosition : null,
		transparent: options.transparent,
	};
}
