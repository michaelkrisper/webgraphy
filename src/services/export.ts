import type { Theme } from "../themes";
import type { TextMeasurer } from "./exportLayout";
import { embeddedFontCss, waitForFonts } from "./exportFonts";
import { CSS_DPI, canvasLimitError } from "./exportOptions";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "./persistence";
import { setPngBlobDpi } from "./pngMetadata";
import { exportToSVG, formatDate, type SvgExportOptions } from "./svgExport";

export { exportToSVG, formatDate };

export interface PngExportOptions extends SvgExportOptions {
	/** Device pixels per layout px; defaults to the screen's devicePixelRatio. */
	pixelRatio?: number;
}

/** The requested image is beyond what the browser can allocate as a canvas. */
export class CanvasSizeError extends Error {
	override name = "CanvasSizeError";
}

/**
 * Draws `svgString` onto a canvas of `width`×`height` layout px at
 * `pixelRatio`. Rejects with CanvasSizeError past the browser's canvas limits.
 */
const rasterize = (
	svgString: string,
	width: number,
	height: number,
	pixelRatio: number,
	background: string | null,
): Promise<HTMLCanvasElement> => {
	const pixelWidth = Math.round(width * pixelRatio);
	const pixelHeight = Math.round(height * pixelRatio);
	const limit = canvasLimitError(pixelWidth, pixelHeight);
	if (limit) return Promise.reject(new CanvasSizeError(limit));
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas");
		canvas.width = pixelWidth;
		canvas.height = pixelHeight;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			reject(new Error("Could not get 2D context"));
			return;
		}
		ctx.scale(pixelWidth / width, pixelHeight / height);
		const img = new Image(),
			svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }),
			url = URL.createObjectURL(svgBlob);
		img.onload = async () => {
			// The embedded fonts decode with the image; decode() settles once
			// they have, so no label is drawn in a fallback face.
			await img.decode?.().catch(() => {});
			if (background) {
				ctx.fillStyle = background;
				ctx.fillRect(0, 0, width, height);
			}
			ctx.drawImage(img, 0, 0, width, height);
			URL.revokeObjectURL(url);
			resolve(canvas);
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to load SVG into image for PNG export"));
		};
		img.src = url;
	});
};

/**
 * Converts plot to PNG by rendering SVG on canvas with device-pixel scaling.
 * Returns data URL suitable for download or clipboard.
 * @param {Dataset[]} datasets - Array of imported datasets
 * @param {SeriesConfig[]} series - Series configurations
 * @param {XAxisConfig[]} xAxes - X-axis array
 * @param {YAxisConfig[]} yAxes - Y-axis array
 * @param {number} width - Canvas width in logical pixels
 * @param {number} height - Canvas height in logical pixels
 * @param {Theme} theme - Theme for styling
 * @param {PngExportOptions} options - SVG options plus the pixel ratio
 * @returns {Promise<string>} PNG data URL (data:image/png;...)
 */
export const exportToPNG = async (
	datasets: Dataset[],
	series: SeriesConfig[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
	theme: Theme,
	options: PngExportOptions = {},
): Promise<string> => {
	const canvas = await renderPNGCanvas(
		datasets,
		series,
		xAxes,
		yAxes,
		width,
		height,
		theme,
		options,
	);
	return canvas.toDataURL("image/png");
};

const renderPNGCanvas = (
	datasets: Dataset[],
	series: SeriesConfig[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
	theme: Theme,
	options: PngExportOptions,
) => {
	const { pixelRatio = window.devicePixelRatio || 1, ...svgOptions } = options;
	const svgString = exportToSVG(
		datasets,
		series,
		xAxes,
		yAxes,
		width,
		height,
		theme,
		svgOptions,
	);
	return rasterize(
		svgString,
		width,
		height,
		pixelRatio,
		options.transparent ? null : theme.plotBg,
	);
};

/** Measures with the theme font through a 2D canvas; estimates without one. */
const canvasMeasurer = (fontFamily: string): TextMeasurer | undefined => {
	const ctx = document.createElement("canvas").getContext?.("2d");
	if (!ctx) return undefined;
	return (text, fontPx, bold) => {
		ctx.font = `${bold ? "bold " : ""}${fontPx}px ${fontFamily}`;
		return ctx.measureText(text).width;
	};
};

export interface PlotSnapshot {
	datasets: Dataset[];
	series: SeriesConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
}

export interface ImageExportRequest
	extends Pick<
		SvgExportOptions,
		"title" | "legend" | "transparent" | "physical"
	> {
	format: "svg" | "png";
	/** Layout size in CSS px. */
	width: number;
	height: number;
	/** PNG device pixels per layout px. */
	pixelRatio: number;
	fileName?: string;
}

/**
 * Builds and downloads an SVG or PNG of the plot, with the theme font
 * embedded and loaded first. Rejects with CanvasSizeError when a PNG would
 * exceed the browser's canvas limits.
 */
export async function exportImage(
	plot: PlotSnapshot,
	request: ImageExportRequest,
	theme: Theme,
): Promise<void> {
	const { format, width, height, pixelRatio, fileName, ...decor } = request;
	if (format === "png") {
		const limit = canvasLimitError(
			Math.round(width * pixelRatio),
			Math.round(height * pixelRatio),
		);
		if (limit) throw new CanvasSizeError(limit);
	}
	const [fontFaceCss] = await Promise.all([
		embeddedFontCss(theme.fontFamily),
		waitForFonts(theme.fontFamily),
	]);
	const options: SvgExportOptions = {
		...decor,
		fontFaceCss,
		measureText: canvasMeasurer(theme.fontFamily),
	};
	const { datasets, series, xAxes, yAxes } = plot;
	const name = fileName ?? "webgraphy-export";
	if (format === "svg") {
		const svg = exportToSVG(
			datasets,
			series,
			xAxes,
			yAxes,
			width,
			height,
			theme,
			options,
		);
		downloadBlob(new Blob([svg], { type: "image/svg+xml" }), `${name}.svg`);
		return;
	}
	const canvas = await renderPNGCanvas(
		datasets,
		series,
		xAxes,
		yAxes,
		width,
		height,
		theme,
		{ ...options, pixelRatio },
	);
	// toBlob, not toDataURL: a large PNG as a base64 string can exceed the
	// engine's maximum string length.
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, "image/png"),
	);
	if (!blob)
		throw new CanvasSizeError(
			"The browser could not encode an image this large. Choose a smaller size, scale or dpi.",
		);
	// Layout px are CSS px (96 per inch), so the true resolution is 96 dpi ×
	// pixel ratio: the chosen dpi for millimetre sizes, 192 dpi for a 2× pixel
	// export, which then opens at its on-screen size like a HiDPI screenshot.
	const dpi = CSS_DPI * pixelRatio;
	downloadBlob(await setPngBlobDpi(blob, dpi), `${name}.png`);
}

/** Triggers a browser download of `blob`. */
export const downloadBlob = (blob: Blob, fileName: string): void => {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 100);
};

/**
 * Triggers browser file download for SVG, PNG, or JSON content.
 * Handles both data URLs (already encoded) and plain text content.
 * @param {string} content - File content (data URL or text) to download
 * @param {string} fileName - Name for the downloaded file (e.g., "chart.svg")
 * @param {string} contentType - MIME type (e.g., "image/svg+xml", "application/json")
 * @returns {void}
 */
export const downloadFile = (
	content: string,
	fileName: string,
	contentType: string,
): void => {
	const a = document.createElement("a");
	const isDataUrl = content.startsWith("data:");
	let urlToDownload: string;

	if (isDataUrl) {
		// Ensure the data URL has a safe MIME type to prevent XSS
		try {
			const url = new URL(content);
			if (url.protocol !== "data:") {
				throw new Error("Invalid URL protocol: expected 'data:'");
			}
			const commaIndex = url.pathname.indexOf(",");
			if (commaIndex === -1) {
				throw new Error("Invalid data URL format: missing comma");
			}
			const mediaTypeAndParams = url.pathname.slice(0, commaIndex);
			const parts = mediaTypeAndParams.split(";");
			// If no media type is specified, it defaults to text/plain;charset=US-ASCII
			const mimeType = parts[0].trim().toLowerCase() || "text/plain";

			if (!mimeType.startsWith("image/") && !mimeType.startsWith("application/")) {
				throw new Error(
					`Unsupported MIME type: ${mimeType}. Expected 'image/*' or 'application/*'`,
				);
			}
			const lowerMimeType = mimeType.toLowerCase();
			if (
				lowerMimeType.includes("svg") ||
				lowerMimeType.includes("xml") ||
				lowerMimeType.includes("html")
			) {
				throw new Error(`Unsafe MIME type detected: ${mimeType}`);
			}

			const data = url.pathname.slice(commaIndex + 1);
			const isBase64 = parts.includes("base64");

			let arrayBuffer: Uint8Array<ArrayBuffer>;
			if (isBase64) {
				// atob yields a binary string — one byte per code unit — so
				// charCodeAt is the correct way to recover the bytes.
				const byteString = atob(data);
				arrayBuffer = new Uint8Array(byteString.length);
				for (let i = 0; i < byteString.length; i++) {
					arrayBuffer[i] = byteString.charCodeAt(i);
				}
			} else {
				// decodeURIComponent has already decoded the percent-escapes as
				// UTF-8, so `data` is text, not bytes. Re-encoding it keeps that
				// intact; a charCodeAt loop would emit Latin-1 for U+0080..U+00FF
				// and truncate anything above U+00FF outright.
				// Copied into a plain ArrayBuffer because TextEncoder returns an
				// ArrayBufferLike view, which Blob does not accept.
				const encoded = new TextEncoder().encode(decodeURIComponent(data));
				arrayBuffer = new Uint8Array(encoded);
			}

			const blob = new Blob([arrayBuffer], { type: contentType || mimeType });
			urlToDownload = URL.createObjectURL(blob);
		} catch (error) {
			throw new Error("Unsafe data URL scheme detected", { cause: error });
		}
	} else {
		const file = new Blob([content], { type: contentType });
		urlToDownload = URL.createObjectURL(file);
	}

	a.href = urlToDownload;
	a.download = fileName;
	a.click();

	// Security/Memory leak prevention: automatically revoke the object URL after a short delay
	// to ensure the browser has time to start the download.
	setTimeout(() => URL.revokeObjectURL(urlToDownload), 100);
};
