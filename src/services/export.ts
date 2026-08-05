import type { Theme } from "../themes";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "./persistence";
import { exportToSVG, formatDate } from "./svgExport";

export { exportToSVG, formatDate };

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
): Promise<string> => {
	const svgString = exportToSVG(
		datasets,
		series,
		xAxes,
		yAxes,
		width,
		height,
		theme,
	);
	return new Promise((resolve, reject) => {
		const canvas = document.createElement("canvas"),
			dpr = window.devicePixelRatio || 1;
		canvas.width = width * dpr;
		canvas.height = height * dpr;
		const ctx = canvas.getContext("2d");
		if (!ctx) {
			reject(new Error("Could not get 2D context"));
			return;
		}
		ctx.scale(dpr, dpr);
		const img = new Image(),
			svgBlob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" }),
			url = URL.createObjectURL(svgBlob);
		img.onload = () => {
			ctx.fillStyle = theme.plotBg;
			ctx.fillRect(0, 0, width, height);
			ctx.drawImage(img, 0, 0, width, height);
			URL.revokeObjectURL(url);
			resolve(canvas.toDataURL("image/png"));
		};
		img.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error("Failed to load SVG into image for PNG export"));
		};
		img.src = url;
	});
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

			if (
				!mimeType.startsWith("image/") &&
				!mimeType.startsWith("application/")
			) {
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

			const byteString = isBase64 ? atob(data) : decodeURIComponent(data);
			const arrayBuffer = new Uint8Array(byteString.length);
			for (let i = 0; i < byteString.length; i++) {
				arrayBuffer[i] = byteString.charCodeAt(i);
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
