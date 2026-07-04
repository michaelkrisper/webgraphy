import type { Theme } from "../themes";
import { formatAxisLabel, getAxisById } from "../utils/axisCalculations";
import { getColumnIndex } from "../utils/columns";
import { worldToScreen } from "../utils/coords";
import { m4Float32 } from "../utils/decimation";
import { escapeHTML } from "../utils/dom";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "./persistence";

const AXIS_WIDTH_BASE = 15; // Ticks, gap, and safe margin

/**
 * Generates a production-quality SVG that exactly matches the WebGL plot visuals.
 * Handles multi-axis layouts, auto-scales ticks/labels, and renders large datasets efficiently.
 * @param {Dataset[]} datasets - Array of imported datasets with parsed columns
 * @param {SeriesConfig[]} series - Array of series configurations (styling, axis assignments)
 * @param {XAxisConfig[]} xAxes - Array of X-axis configurations
 * @param {YAxisConfig[]} yAxes - Array of Y-axis configurations (min, max, position, color)
 * @param {number} width - SVG canvas width in pixels
 * @param {number} height - SVG canvas height in pixels
 * @param {Theme} theme - Theme object with colors, fonts, and styling
 * @returns {string} SVG string ready for export or embedding
 */
export const exportToSVG = (
	datasets: Dataset[],
	series: SeriesConfig[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
	theme: Theme,
): string => {
	// 1. Determine active axes and layout
	const axisToMinDsIdx = new Map<string, number>();
	const activeDatasetIds = series.reduce(
		(acc, s) => acc.add(s.sourceId),
		new Set<string>(),
	);
	datasets.forEach((d, dsIdx) => {
		if (!activeDatasetIds.has(d.id)) return;
		const xId = d.xAxisId || "axis-1";
		const currentMin = axisToMinDsIdx.get(xId);
		if (currentMin === undefined || dsIdx < currentMin) {
			axisToMinDsIdx.set(xId, dsIdx);
		}
	});
	const activeXAxes = xAxes
		.filter((a) => axisToMinDsIdx.has(a.id))
		.sort(
			(a, b) =>
				(axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0),
		);

	const usedAxisIds = new Set<string>();
	for (let i = 0; i < series.length; i++) {
		usedAxisIds.add(series[i].yAxisId);
	}

	const activeYAxes: YAxisConfig[] = [];
	const leftAxes: YAxisConfig[] = [];
	const rightAxes: YAxisConfig[] = [];
	for (let i = 0; i < yAxes.length; i++) {
		const a = yAxes[i];
		if (usedAxisIds.has(a.id)) {
			activeYAxes.push(a);
			if (a.position === "left") {
				leftAxes.push(a);
			} else if (a.position === "right") {
				rightAxes.push(a);
			}
		}
	}

	// Helper to calculate required axis width
	const getAxisWidth = (axis: YAxisConfig) => {
		const range = axis.max - axis.min;
		const step = range / Math.max(2, Math.floor(height / 30));
		const magnitude = 10 ** Math.floor(Math.log10(Math.abs(step) || 1));
		const normalizedStep = step / magnitude;
		const finalStep =
			normalizedStep < 1.5
				? 1
				: normalizedStep < 3
					? 2
					: normalizedStep < 7
						? 5
						: 10;
		const actualStep = finalStep * magnitude;
		const precision = Math.max(0, -Math.floor(Math.log10(actualStep || 1)));

		const widestVal = Math.max(
			formatAxisLabel(axis.min, precision).length,
			formatAxisLabel(axis.max, precision).length,
		);
		return widestVal * 6 + AXIS_WIDTH_BASE;
	};

	const axisWidthMap: Record<string, number> = {};
	activeYAxes.forEach((a) => {
		axisWidthMap[a.id] = getAxisWidth(a);
	});

	// ⚡ Bolt Optimization: Pre-calculate Y-axis cumulative offsets to replace O(N^2) inline loop lookups with O(1) property access
	const yAxesOffsets: Record<string, number> = {};
	let leftCumulative = 0;
	for (const axis of leftAxes) {
		yAxesOffsets[axis.id] = leftCumulative;
		leftCumulative += axisWidthMap[axis.id];
	}
	let rightCumulative = 0;
	for (const axis of rightAxes) {
		yAxesOffsets[axis.id] = rightCumulative;
		rightCumulative += axisWidthMap[axis.id];
	}

	const leftSum = leftCumulative;
	const rightSum = rightCumulative;

	const padding = {
		top: 20,
		right: 20 + rightSum,
		bottom: 60 + (activeXAxes.length - 1) * 60,
		left: 20 + leftSum,
	};

	const chartWidth = Math.max(0, width - padding.left - padding.right);
	const chartHeight = Math.max(0, height - padding.top - padding.bottom);

	let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="background: ${escapeHTML(theme.plotBg)}; font-family: ${escapeHTML(theme.fontFamily)};">`;

	svg += `<rect width="100%" height="100%" fill="${escapeHTML(theme.plotBg)}" />`;

	// 2. Draw Grid
	const gridAxis = activeYAxes.find((a) => a.showGrid) || activeYAxes[0];
	const gridXAxis = activeXAxes[0];
	if (gridAxis && gridXAxis) {
		const yRange = gridAxis.max - gridAxis.min;
		const yStep = yRange / Math.max(2, Math.floor(chartHeight / 30));
		const firstYTick = Math.ceil(gridAxis.min / yStep) * yStep;
		const vp = {
			xMin: gridXAxis.min,
			xMax: gridXAxis.max,
			yMin: gridAxis.min,
			yMax: gridAxis.max,
			width,
			height,
			padding,
		};
		for (let t = firstYTick; t <= gridAxis.max; t += yStep) {
			const { y } = worldToScreen(gridXAxis.min, t, vp);
			svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${escapeHTML(theme.gridColor)}" stroke-width="1" />`;
		}

		const xRange = gridXAxis.max - gridXAxis.min;
		const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
		const firstXTick = Math.ceil(gridXAxis.min / xStep) * xStep;
		for (let t = firstXTick; t <= gridXAxis.max; t += xStep) {
			const { x } = worldToScreen(t, gridAxis.min, vp);
			svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="${escapeHTML(theme.gridColor)}" stroke-width="1" />`;
		}
	}

	// 2b. Zero lines
	if (gridXAxis?.showGrid && gridXAxis.min <= 0 && gridXAxis.max >= 0) {
		const normX = (0 - gridXAxis.min) / (gridXAxis.max - gridXAxis.min);
		const x = padding.left + normX * chartWidth;
		const arrowSize = 6;
		svg += `<line x1="${x}" y1="${height - padding.bottom}" x2="${x}" y2="${padding.top - 8}" stroke="${escapeHTML(theme.zeroLineColor)}" stroke-width="1.5" />`;
		svg += `<polygon points="${x},${padding.top - 8} ${x - arrowSize / 2},${padding.top - 8 + arrowSize} ${x + arrowSize / 2},${padding.top - 8 + arrowSize}" fill="${escapeHTML(theme.zeroLineColor)}" />`;
	}
	activeYAxes.forEach((axis) => {
		if (axis.showGrid && axis.min <= 0 && axis.max >= 0) {
			const vp = {
				xMin: gridXAxis?.min ?? 0,
				xMax: gridXAxis?.max ?? 1,
				yMin: axis.min,
				yMax: axis.max,
				width,
				height,
				padding,
			};
			const { y } = worldToScreen(gridXAxis?.min ?? 0, 0, vp);
			const arrowSize = 6;
			const x2 = width - padding.right + 8;
			svg += `<line x1="${padding.left}" y1="${y}" x2="${x2}" y2="${y}" stroke="${escapeHTML(theme.zeroLineColor)}" stroke-width="1.5" />`;
			svg += `<polygon points="${x2},${y} ${x2 - arrowSize},${y - arrowSize / 2} ${x2 - arrowSize},${y + arrowSize / 2}" fill="${escapeHTML(theme.zeroLineColor)}" />`;
		}
	});

	// 3. Draw Series Data
	const datasetsMap = new Map(datasets.map((d) => [d.id, d]));

	const m4Out = { x: new Float32Array(0), y: new Float32Array(0) };

	series.forEach((s) => {
		if (s.hidden) return;
		const ds = datasetsMap.get(s.sourceId);
		const xAxis = getAxisById(xAxes, ds?.xAxisId || "axis-1");
		const yAxis = getAxisById(yAxes, s.yAxisId);
		if (!ds || !xAxis || !yAxis) return;

		const xIdx = getColumnIndex(ds, ds.xAxisColumn);
		const yIdx = getColumnIndex(ds, s.yColumn);
		if (xIdx === -1 || yIdx === -1) return;

		const xCol = ds.data[xIdx],
			yCol = ds.data[yIdx];
		const xData = xCol.data,
			yData = yCol.data;
		// binary search visible range
		let visStart = 0,
			visEnd = ds.rowCount - 1;
		{
			let lo = 0,
				hi = ds.rowCount - 1;
			while (lo <= hi) {
				const m = (lo + hi) >>> 1;
				if (xData[m] + xCol.refPoint <= xAxis.min) {
					visStart = m;
					lo = m + 1;
				} else hi = m - 1;
			}
		}
		{
			let lo = 0,
				hi = ds.rowCount - 1;
			while (lo <= hi) {
				const m = (lo + hi) >>> 1;
				if (xData[m] + xCol.refPoint >= xAxis.max) {
					visEnd = m;
					hi = m - 1;
				} else lo = m + 1;
			}
		}
		if (visStart > 0) visStart--;
		if (visEnd < ds.rowCount - 1) visEnd++;
		const xSlice = xData.subarray(visStart, visEnd + 1);
		const ySlice = yData.subarray(visStart, visEnd + 1);
		const sampled = m4Float32(xSlice, ySlice, width, m4Out);
		const seriesVp = {
			xMin: xAxis.min,
			xMax: xAxis.max,
			yMin: yAxis.min,
			yMax: yAxis.max,
			width,
			height,
			padding,
		};
		const screenPoints: { x: number; y: number }[] = [];
		for (let i = 0; i < sampled.x.length; i++)
			screenPoints.push(
				worldToScreen(
					sampled.x[i] + xCol.refPoint,
					sampled.y[i] + yCol.refPoint,
					seriesVp,
				),
			);
		if (screenPoints.length > 1 && s.lineStyle !== "none") {
			let pathData = "";
			let penDown = false;
			let prevScreenX = -Infinity;
			for (let i = 0; i < sampled.x.length; i++) {
				const p = screenPoints[i];
				if (Number.isNaN(sampled.y[i]) || p.x < prevScreenX - 1) {
					penDown = false;
				}
				if (!Number.isNaN(sampled.y[i])) {
					pathData += `${penDown ? "L" : "M"} ${p.x} ${p.y} `;
					penDown = true;
					prevScreenX = p.x;
				}
			}
			if (pathData) {
				let dashArray = "";
				if (s.lineStyle === "dashed") dashArray = 'stroke-dasharray="8,6"';
				else if (s.lineStyle === "dotted") dashArray = 'stroke-dasharray="2,4"';
				svg += `<path d="${pathData.trim()}" fill="none" stroke="${escapeHTML(s.lineColor)}" stroke-width="1" ${dashArray} />`;
			}
		}
		if (s.pointStyle !== "none") {
			screenPoints.forEach((p, i) => {
				if (Number.isNaN(sampled.y[i])) return;
				if (s.pointStyle === "circle")
					svg += `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${escapeHTML(s.pointColor)}" />`;
				else if (s.pointStyle === "square")
					svg += `<rect x="${p.x - 2.5}" y="${p.y - 2.5}" width="5" height="5" fill="${escapeHTML(s.pointColor)}" />`;
				else if (s.pointStyle === "cross")
					svg += `<path d="M ${p.x - 2.5} ${p.y - 2.5} L ${p.x + 2.5} ${p.y + 2.5} M ${p.x + 2.5} ${p.y - 2.5} L ${p.x - 2.5} ${p.y + 2.5}" stroke="${escapeHTML(s.pointColor)}" stroke-width="1" />`;
			});
		}
	});

	// 4. Draw Axes
	svg += `<rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="${escapeHTML(theme.axisColor)}" stroke-width="2" />`;

	// Pre-compute dataset and series relationships for O(1) lookups
	const datasetsByXAxisId: Record<string, Dataset[]> = {};
	const seriesByXAxisId: Record<string, SeriesConfig[]> = {};

	// Group datasets by xAxisId, only including those that have at least one series
	datasets.forEach((d) => {
		if (activeDatasetIds.has(d.id)) {
			const xAxisId = d.xAxisId || "axis-1";
			if (!datasetsByXAxisId[xAxisId]) datasetsByXAxisId[xAxisId] = [];
			datasetsByXAxisId[xAxisId].push(d);
		}
	});

	// Group series by the xAxisId of their source dataset
	const datasetXAxisMap = new Map<string, string>();
	for (const d of datasets) {
		datasetXAxisMap.set(d.id, d.xAxisId || "axis-1");
	}

	series.forEach((s) => {
		const xAxisId = datasetXAxisMap.get(s.sourceId);
		if (xAxisId) {
			if (!seriesByXAxisId[xAxisId]) seriesByXAxisId[xAxisId] = [];
			seriesByXAxisId[xAxisId].push(s);
		}
	});

	activeXAxes.forEach((axis, idx) => {
		const xRange = axis.max - axis.min;
		const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
		const firstXTick = Math.ceil(axis.min / xStep) * xStep;
		const xPrecision = Math.max(0, -Math.floor(Math.log10(xStep || 1)));
		const vp = {
			xMin: axis.min,
			xMax: axis.max,
			yMin: 0,
			yMax: 100,
			width,
			height,
			padding,
		};
		const baseY = height - padding.bottom + idx * 60;

		svg += `<line x1="${padding.left}" y1="${baseY}" x2="${width - padding.right + 8}" y2="${baseY}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;

		for (let t = firstXTick; t <= axis.max; t += xStep) {
			const { x } = worldToScreen(t, 0, vp);
			if (x < padding.left || x > width - padding.right) continue;
			svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 6}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
			const label =
				axis.xMode === "date"
					? formatDate(t, xStep)
					: formatAxisLabel(t, xPrecision);
			svg += `<text x="${x}" y="${baseY + 24}" text-anchor="middle" font-size="12" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(label)}</text>`;
		}

		const datasetsForThisAxis = datasetsByXAxisId[axis.id] || [];
		const title = Array.from(
			new Set(datasetsForThisAxis.map((d) => d.xAxisColumn)),
		).join(" / ");
		svg += `<text x="${padding.left + chartWidth / 2}" y="${baseY + 48}" text-anchor="middle" font-size="14" font-weight="bold" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(title)}</text>`;
	});

	const seriesByYAxisId: Record<string, SeriesConfig[]> = {};
	for (let i = 0; i < series.length; i++) {
		const s = series[i];
		if (!seriesByYAxisId[s.yAxisId]) {
			seriesByYAxisId[s.yAxisId] = [];
		}
		seriesByYAxisId[s.yAxisId].push(s);
	}

	activeYAxes.forEach((axis) => {
		const isLeft = axis.position === "left";
		const axisWidth = axisWidthMap[axis.id];
		const xPos = isLeft
			? padding.left - (yAxesOffsets[axis.id] || 0) - axisWidth
			: width - padding.right + (yAxesOffsets[axis.id] || 0);

		const range = axis.max - axis.min,
			step = range / Math.max(2, Math.floor(chartHeight / 30));
		const firstTick = Math.ceil(axis.min / step) * step;
		const precision = Math.max(0, -Math.floor(Math.log10(step || 1)));

		// Axis Line
		const lineX = xPos + (isLeft ? axisWidth : 0);
		svg += `<line x1="${lineX}" y1="${padding.top}" x2="${lineX}" y2="${height - padding.bottom}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;

		// Ticks and Labels (Right-Aligned)
		const mainXConf = activeXAxes[0] || xAxes[0];
		for (let t = firstTick; t <= axis.max; t += step) {
			const { y } = worldToScreen(mainXConf.min, t, {
				xMin: mainXConf.min,
				xMax: mainXConf.max,
				yMin: axis.min,
				yMax: axis.max,
				width,
				height,
				padding,
			});
			svg += `<line x1="${lineX - (isLeft ? 5 : 0)}" y1="${y}" x2="${lineX + (isLeft ? 0 : 5)}" y2="${y}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
			const labelX = xPos + axisWidth - 8;
			svg += `<text x="${labelX}" y="${y + 4}" text-anchor="end" font-size="12" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(formatAxisLabel(t, precision))}</text>`;
		}

		const axisSeries = seriesByYAxisId[axis.id] || [];
		const fullTitle = axisSeries.map((s) => s.name || s.yColumn).join(" / ");
		const titleX = isLeft ? xPos + 5 : xPos + axisWidth - 5;
		const titleY = padding.top + chartHeight / 2,
			rotate = isLeft ? -90 : 90;
		const estW = Math.min(chartHeight, fullTitle.length * 8 + 8);
		svg += `<g transform="translate(${titleX}, ${titleY}) rotate(${rotate})">`;
		svg += `<rect x="-${estW / 2}" y="-10" width="${estW}" height="20" fill="${escapeHTML(theme.secLabelBg)}" rx="2" />`;
		svg += `<text x="0" y="5" text-anchor="middle" font-size="14" font-weight="bold" fill="${escapeHTML(theme.labelColor)}">`;
		axisSeries.forEach((s, i) => {
			if (i > 0)
				svg += `<tspan fill="${escapeHTML(theme.labelColor)}"> / </tspan>`;
			svg += `<tspan fill="${escapeHTML(s.lineColor)}">${escapeHTML(s.name || s.yColumn)}</tspan>`;
		});
		svg += `</text></g>`;
	});

	svg += `</svg>`;
	return svg;
};

/**
 * Formats Unix timestamp as a human-readable date/time string based on tick step.
 * Adapts precision to grid granularity: days, hours, or minutes.
 * @param {number} val - Unix timestamp (in seconds, not milliseconds)
 * @param {number} step - Grid step size in seconds (determines format granularity)
 * @returns {string} Formatted date/time label (e.g., "14.3." or "15:30")
 */
export const formatDate = (val: number, step: number) => {
	const d = new Date(val * 1000);
	if (step >= 86400) return `${d.getDate()}.${d.getMonth() + 1}.`;
	if (step >= 3600) return `${d.getHours()}:00`;
	return (
		String(d.getHours()).padStart(2, "0") +
		":" +
		String(d.getMinutes()).padStart(2, "0")
	);
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
 * @returns {(() => void) | void} Cleanup function to revoke the object URL
 */
export const downloadFile = (
	content: string,
	fileName: string,
	contentType: string,
): (() => void) | void => {
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

	// Security/Memory leak prevention: return cleanup function to revoke the object URL after download.
	return () => URL.revokeObjectURL(urlToDownload);
};
