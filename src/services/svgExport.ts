import type { Theme } from "../themes";
import {
	calcLogTicks,
	formatAxisLabel,
	getAxisById,
	type LogTicks,
	Y_TICK_SPACING_PX,
} from "../utils/axisCalculations";
import { isLogAxis } from "../utils/axisScale";
import { getColumnIndex } from "../utils/columns";
import { worldToScreen } from "../utils/coords";
import { m4Float32 } from "../utils/decimation";
import { escapeHTML } from "../utils/dom";
import { MS_PER_SECOND, UNIT_SECONDS } from "../utils/time";
import {
	type DecorationLayout,
	estimateTextWidth,
	fitText,
	LEGEND,
	type LegendEntry,
	layoutDecorations,
	legendEntries,
	TITLE,
	type TextMeasurer,
} from "./exportLayout";
import type { LegendPosition } from "./exportOptions";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "./persistence";

const AXIS_WIDTH_BASE = 15; // Ticks, gap, and safe margin
// Band at the outer edge of a y axis' gutter for its rotated title, so the
// title never covers tick labels.
const Y_TITLE_BAND = 22;
const TICK_FONT_PX = 12;
// Same label spacing and minor-grid opacity as the WebGL plot.
const X_TICK_SPACING_PX = 60;
const MINOR_GRID_OPACITY = 0.4;

/** Visible ticks of a log axis, the same set the WebGL plot draws. */
const logTicksFor = (
	axis: { min: number; max: number },
	spanPx: number,
	spacingPx: number,
): LogTicks => {
	const lt = calcLogTicks(axis.min, axis.max, spanPx, spacingPx);
	const inside = (t: number) => t >= axis.min && t <= axis.max;
	return {
		...lt,
		ticks: lt.ticks.filter(inside),
		minorTicks: lt.minorTicks.filter(inside),
	};
};

interface LayoutContext {
	activeXAxes: XAxisConfig[];
	activeYAxes: YAxisConfig[];
	padding: { top: number; right: number; bottom: number; left: number };
	chartWidth: number;
	chartHeight: number;
	datasetsByXAxisId: Record<string, Dataset[]>;
	seriesByYAxisId: Record<string, SeriesConfig[]>;
	axisWidthMap: Record<string, number>;
	yAxesOffsets: Record<string, number>;
	rightAxesWidth: number;
	measure: TextMeasurer;
}

const getAxisWidth = (
	axis: YAxisConfig,
	height: number,
	measure: TextMeasurer,
) => {
	const gutter = (labels: string[]) =>
		Math.ceil(Math.max(6, ...labels.map((l) => measure(l, TICK_FONT_PX)))) +
		AXIS_WIDTH_BASE +
		Y_TITLE_BAND;
	if (isLogAxis(axis)) {
		const lt = logTicksFor(axis, height, Y_TICK_SPACING_PX);
		return gutter(lt.ticks.map((t) => formatAxisLabel(t, lt.precision)));
	}
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

	return gutter([
		formatAxisLabel(axis.min, precision),
		formatAxisLabel(axis.max, precision),
	]);
};

const calculateLayout = (
	datasets: Dataset[],
	series: SeriesConfig[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
	measure: TextMeasurer,
	reserve = { top: 0, right: 0 },
): LayoutContext => {
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
			(a, b) => (axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0),
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

	const axisWidthMap: Record<string, number> = {};
	activeYAxes.forEach((a) => {
		axisWidthMap[a.id] = getAxisWidth(a, height, measure);
	});

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
		top: 20 + reserve.top,
		right: 20 + rightSum + reserve.right,
		bottom: 60 + (activeXAxes.length - 1) * 60,
		left: 20 + leftSum,
	};

	const chartWidth = Math.max(0, width - padding.left - padding.right);
	const chartHeight = Math.max(0, height - padding.top - padding.bottom);

	const datasetsByXAxisId: Record<string, Dataset[]> = {};
	datasets.forEach((d) => {
		if (activeDatasetIds.has(d.id)) {
			const xAxisId = d.xAxisId || "axis-1";
			if (!datasetsByXAxisId[xAxisId]) datasetsByXAxisId[xAxisId] = [];
			datasetsByXAxisId[xAxisId].push(d);
		}
	});

	const seriesByYAxisId: Record<string, SeriesConfig[]> = {};
	for (let i = 0; i < series.length; i++) {
		const s = series[i];
		if (!seriesByYAxisId[s.yAxisId]) {
			seriesByYAxisId[s.yAxisId] = [];
		}
		seriesByYAxisId[s.yAxisId].push(s);
	}

	return {
		activeXAxes,
		activeYAxes,
		padding,
		chartWidth,
		chartHeight,
		datasetsByXAxisId,
		seriesByYAxisId,
		axisWidthMap,
		yAxesOffsets,
		rightAxesWidth: rightSum,
		measure,
	};
};

const drawGrid = (
	ctx: LayoutContext,
	width: number,
	height: number,
	theme: Theme,
): string => {
	let svg = "";
	const { activeXAxes, activeYAxes, padding, chartWidth, chartHeight } = ctx;
	const gridAxis = activeYAxes.find((a) => a.showGrid) || activeYAxes[0];
	const gridXAxis = activeXAxes[0];
	if (gridAxis && gridXAxis) {
		const vp = {
			xMin: gridXAxis.min,
			xMax: gridXAxis.max,
			yMin: gridAxis.min,
			yMax: gridAxis.max,
			width,
			height,
			padding,
			xLog: isLogAxis(gridXAxis),
			yLog: isLogAxis(gridAxis),
		};
		const stroke = escapeHTML(theme.gridColor);
		const hLine = (t: number, minor = false) => {
			const { y } = worldToScreen(gridXAxis.min, t, vp);
			svg += `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="${stroke}" stroke-width="1"${minor ? ` stroke-opacity="${MINOR_GRID_OPACITY}"` : ""} />`;
		};
		const vLine = (t: number, minor = false) => {
			const { x } = worldToScreen(t, gridAxis.min, vp);
			svg += `<line x1="${x}" y1="${padding.top}" x2="${x}" y2="${height - padding.bottom}" stroke="${stroke}" stroke-width="1"${minor ? ` stroke-opacity="${MINOR_GRID_OPACITY}"` : ""} />`;
		};

		if (vp.yLog) {
			const lt = logTicksFor(gridAxis, chartHeight, Y_TICK_SPACING_PX);
			for (const t of lt.minorTicks) hLine(t, true);
			for (const t of lt.ticks) hLine(t);
		} else {
			const yRange = gridAxis.max - gridAxis.min;
			const yStep = yRange / Math.max(2, Math.floor(chartHeight / 30));
			const firstYTick = Math.ceil(gridAxis.min / yStep) * yStep;
			for (let t = firstYTick; t <= gridAxis.max; t += yStep) hLine(t);
		}

		if (vp.xLog) {
			const lt = logTicksFor(gridXAxis, chartWidth, X_TICK_SPACING_PX);
			for (const t of lt.minorTicks) vLine(t, true);
			for (const t of lt.ticks) vLine(t);
		} else {
			const xRange = gridXAxis.max - gridXAxis.min;
			const xStep = xRange / Math.max(2, Math.floor(chartWidth / 60));
			const firstXTick = Math.ceil(gridXAxis.min / xStep) * xStep;
			for (let t = firstXTick; t <= gridXAxis.max; t += xStep) vLine(t);
		}
	}
	return svg;
};

const drawZeroLines = (
	ctx: LayoutContext,
	width: number,
	height: number,
	theme: Theme,
): string => {
	let svg = "";
	const { activeXAxes, activeYAxes, padding, chartWidth } = ctx;
	const gridXAxis = activeXAxes[0];

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
	return svg;
};

const drawSeriesData = (
	ctx: LayoutContext,
	datasets: Dataset[],
	series: SeriesConfig[],
	xAxes: XAxisConfig[],
	yAxes: YAxisConfig[],
	width: number,
	height: number,
): string => {
	let svg = "";
	const datasetsMap = new Map(datasets.map((d) => [d.id, d]));
	const m4Out = { x: new Float32Array(0), y: new Float32Array(0) };
	const { padding } = ctx;

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
			xLog: isLogAxis(xAxis),
			yLog: isLogAxis(yAxis),
		};
		// NaN samples, and values a log axis cannot place, leave a gap.
		const drawable = (i: number) =>
			Number.isFinite(screenPoints[i].x) && Number.isFinite(screenPoints[i].y);
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
				if (!drawable(i) || p.x < prevScreenX - 1) {
					penDown = false;
				}
				if (drawable(i)) {
					pathData += `${penDown ? "L" : "M"} ${p.x} ${p.y} `;
					penDown = true;
					prevScreenX = p.x;
				}
			}
			if (pathData) {
				let dashArray = "";
				if (s.lineStyle === "dashed") dashArray = 'stroke-dasharray="8,6"';
				else if (s.lineStyle === "dotted") dashArray = 'stroke-dasharray="2,4"';
				svg += `<path d="${escapeHTML(pathData.trim())}" fill="none" stroke="${escapeHTML(s.lineColor)}" stroke-width="1" ${dashArray} />`;
			}
		}
		if (s.pointStyle !== "none") {
			screenPoints.forEach((p, i) => {
				if (!drawable(i)) return;
				if (s.pointStyle === "circle")
					svg += `<circle cx="${p.x}" cy="${p.y}" r="2.5" fill="${escapeHTML(s.pointColor)}" />`;
				else if (s.pointStyle === "square")
					svg += `<rect x="${p.x - 2.5}" y="${p.y - 2.5}" width="5" height="5" fill="${escapeHTML(s.pointColor)}" />`;
				else if (s.pointStyle === "cross")
					svg += `<path d="M ${p.x - 2.5} ${p.y - 2.5} L ${p.x + 2.5} ${p.y + 2.5} M ${p.x + 2.5} ${p.y - 2.5} L ${p.x - 2.5} ${p.y + 2.5}" stroke="${escapeHTML(s.pointColor)}" stroke-width="1" />`;
			});
		}
	});
	return svg;
};

const Y_TITLE_FONT_PX = 14;

/**
 * The coloured series names of a y axis title, joined by " / " and cut with
 * an ellipsis where they would run past the plot's height. Separators carry no
 * colour (the label colour).
 */
export const fitAxisTitle = (
	names: { text: string; color: string }[],
	maxWidth: number,
	measure: TextMeasurer,
): { text: string; color?: string }[] => {
	const width = (t: string) => measure(t, Y_TITLE_FONT_PX, true);
	const out: { text: string; color?: string }[] = [];
	let used = 0;
	for (const [i, name] of names.entries()) {
		const sep = i > 0 ? " / " : "";
		const w = width(sep + name.text);
		if (used + w <= maxWidth) {
			if (sep) out.push({ text: sep });
			out.push(name);
			used += w;
			continue;
		}
		const room = maxWidth - used - width(sep);
		const cut = fitText(name.text, room, measure, Y_TITLE_FONT_PX, true);
		if (cut) {
			if (sep) out.push({ text: sep });
			out.push({ text: cut, color: name.color });
		} else if (out.length && used + width(" …") <= maxWidth) {
			out.push({ text: " …" });
		}
		break;
	}
	return out;
};

const drawAxes = (
	ctx: LayoutContext,
	xAxes: XAxisConfig[],
	width: number,
	height: number,
	theme: Theme,
): string => {
	let svg = "";
	const {
		activeXAxes,
		activeYAxes,
		padding,
		chartWidth,
		chartHeight,
		datasetsByXAxisId,
		seriesByYAxisId,
		axisWidthMap,
		yAxesOffsets,
		measure,
	} = ctx;

	svg += `<rect x="${padding.left}" y="${padding.top}" width="${chartWidth}" height="${chartHeight}" fill="none" stroke="${escapeHTML(theme.axisColor)}" stroke-width="2" />`;

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

		if (isLogAxis(axis)) {
			const logVp = { ...vp, xLog: true };
			const lt = logTicksFor(axis, chartWidth, X_TICK_SPACING_PX);
			for (const t of lt.minorTicks) {
				const { x } = worldToScreen(t, 0, logVp);
				svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 3}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
			}
			for (const t of lt.ticks) {
				const { x } = worldToScreen(t, 0, logVp);
				svg += `<line x1="${x}" y1="${baseY}" x2="${x}" y2="${baseY + 6}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
				svg += `<text x="${x}" y="${baseY + 24}" text-anchor="middle" font-size="12" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(formatAxisLabel(t, lt.precision))}</text>`;
			}
		} else {
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
		}

		const datasetsForThisAxis = datasetsByXAxisId[axis.id] || [];
		const title = Array.from(
			new Set(datasetsForThisAxis.map((d) => d.xAxisColumn)),
		).join(" / ");
		svg += `<text x="${padding.left + chartWidth / 2}" y="${baseY + 48}" text-anchor="middle" font-size="14" font-weight="bold" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(title)}</text>`;
	});

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

		const lineX = xPos + (isLeft ? axisWidth : 0);
		const labelX = isLeft ? lineX - 8 : lineX + 8;
		const labelAnchor = isLeft ? "end" : "start";
		svg += `<line x1="${lineX}" y1="${padding.top}" x2="${lineX}" y2="${height - padding.bottom}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;

		const mainXConf = activeXAxes[0] || xAxes[0];
		if (isLogAxis(axis)) {
			const logVp = {
				xMin: mainXConf.min,
				xMax: mainXConf.max,
				yMin: axis.min,
				yMax: axis.max,
				width,
				height,
				padding,
				yLog: true,
			};
			const lt = logTicksFor(axis, chartHeight, Y_TICK_SPACING_PX);
			for (const t of lt.minorTicks) {
				const { y } = worldToScreen(mainXConf.min, t, logVp);
				svg += `<line x1="${lineX - (isLeft ? 3 : 0)}" y1="${y}" x2="${lineX + (isLeft ? 0 : 3)}" y2="${y}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
			}
			for (const t of lt.ticks) {
				const { y } = worldToScreen(mainXConf.min, t, logVp);
				svg += `<line x1="${lineX - (isLeft ? 5 : 0)}" y1="${y}" x2="${lineX + (isLeft ? 0 : 5)}" y2="${y}" stroke="${escapeHTML(theme.axisColor)}" stroke-width="1" />`;
				svg += `<text x="${labelX}" y="${y + 4}" text-anchor="${labelAnchor}" font-size="12" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(formatAxisLabel(t, lt.precision))}</text>`;
			}
		} else {
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
				svg += `<text x="${labelX}" y="${y + 4}" text-anchor="${labelAnchor}" font-size="12" fill="${escapeHTML(theme.labelColor)}">${escapeHTML(formatAxisLabel(t, precision))}</text>`;
			}
		}

		const axisSeries = seriesByYAxisId[axis.id] || [];
		const segments = fitAxisTitle(
			axisSeries.map((s) => ({ text: s.name || s.yColumn, color: s.lineColor })),
			chartHeight - 8,
			measure,
		);
		const titleWidth = measure(
			segments.map((seg) => seg.text).join(""),
			Y_TITLE_FONT_PX,
			true,
		);
		const titleX = isLeft
			? xPos + Y_TITLE_BAND / 2
			: xPos + axisWidth - Y_TITLE_BAND / 2;
		const titleY = padding.top + chartHeight / 2,
			rotate = isLeft ? -90 : 90;
		const estW = Math.min(chartHeight, titleWidth + 8);
		svg += `<g transform="translate(${titleX}, ${titleY}) rotate(${rotate})">`;
		svg += `<rect x="-${estW / 2}" y="-10" width="${estW}" height="20" fill="${escapeHTML(theme.secLabelBg)}" rx="2" />`;
		svg += `<text x="0" y="5" text-anchor="middle" font-size="${Y_TITLE_FONT_PX}" font-weight="bold" fill="${escapeHTML(theme.labelColor)}">`;
		for (const seg of segments)
			svg += `<tspan fill="${escapeHTML(seg.color ?? theme.labelColor)}">${escapeHTML(seg.text)}</tspan>`;
		svg += `</text></g>`;
	});

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
	const d = new Date(val * MS_PER_SECOND);
	if (step >= UNIT_SECONDS.day) return `${d.getDate()}.${d.getMonth() + 1}.`;
	if (step >= UNIT_SECONDS.hour) return `${d.getHours()}:00`;
	return (
		String(d.getHours()).padStart(2, "0") +
		":" +
		String(d.getMinutes()).padStart(2, "0")
	);
};

const LEGEND_DASH: Record<string, string> = { dashed: "6,4", dotted: "2,3" };

/** Swatch and label of one entry, drawn like the on-screen legend's icon. */
const drawLegendEntry = (
	entry: LegendEntry,
	label: string,
	x: number,
	cy: number,
	theme: Theme,
): string => {
	let svg = "";
	const mx = x + LEGEND.swatchWidth / 2;
	if (entry.lineStyle !== "none") {
		const dash = LEGEND_DASH[entry.lineStyle];
		svg += `<line x1="${x}" y1="${cy}" x2="${x + LEGEND.swatchWidth}" y2="${cy}" stroke="${escapeHTML(entry.lineColor)}" stroke-width="1"${dash ? ` stroke-dasharray="${dash}"` : ""} />`;
	}
	const fill = escapeHTML(entry.pointColor);
	const outline = `stroke="white" stroke-width="0.75" paint-order="stroke fill"`;
	if (entry.pointStyle === "circle")
		svg += `<circle cx="${mx}" cy="${cy}" r="2.5" fill="${fill}" ${outline} />`;
	else if (entry.pointStyle === "square")
		svg += `<rect x="${mx - 2.5}" y="${cy - 2.5}" width="5" height="5" fill="${fill}" ${outline} />`;
	else if (entry.pointStyle === "cross")
		svg += `<path d="M ${mx - 2.5} ${cy - 2.5} L ${mx + 2.5} ${cy + 2.5} M ${mx + 2.5} ${cy - 2.5} L ${mx - 2.5} ${cy + 2.5}" stroke="${fill}" stroke-width="1.5" />`;
	const tx = x + LEGEND.swatchWidth + LEGEND.swatchGap;
	svg += `<text x="${tx}" y="${cy + 4}" font-size="${LEGEND.fontPx}" fill="${escapeHTML(theme.tooltipColor)}">${escapeHTML(label)}</text>`;
	return svg;
};

const drawLegend = (
	legend: NonNullable<DecorationLayout["legend"]>,
	theme: Theme,
): string => {
	const { box, block } = legend;
	let svg = `<g>`;
	svg += `<rect x="${box.x}" y="${box.y}" width="${box.width}" height="${box.height}" fill="${escapeHTML(theme.tooltipBg)}" stroke="${escapeHTML(theme.tooltipBorder)}" stroke-width="1" />`;
	block.items.forEach(({ entry, label }, i) => {
		const byRow = block.flow === "row";
		const col = byRow ? i % block.columns : Math.floor(i / block.rows);
		const row = byRow ? Math.floor(i / block.columns) : i % block.rows;
		const x = box.x + col * block.columnWidth + LEGEND.padX;
		const cy =
			box.y + LEGEND.padY + row * LEGEND.rowHeight + LEGEND.rowHeight / 2;
		svg += drawLegendEntry(entry, label, x, cy, theme);
	});
	return `${svg}</g>`;
};

const drawTitle = (
	title: NonNullable<DecorationLayout["title"]>,
	theme: Theme,
): string => {
	const { box, text } = title;
	return `<text x="${box.x + box.width / 2}" y="${box.y + TITLE.fontPx}" text-anchor="middle" font-size="${TITLE.fontPx}" font-weight="bold" fill="${escapeHTML(theme.tooltipColor)}">${escapeHTML(text)}</text>`;
};

export interface SvgExportOptions {
	/** Text above the plot area; blank leaves it out. */
	title?: string;
	/** Where to put the legend; `null`/absent leaves it out. */
	legend?: LegendPosition | null;
	/** Leave out the background fill. */
	transparent?: boolean;
	/** `@font-face` rules embedded in the SVG (see exportFonts.ts). */
	fontFaceCss?: string;
	/** Physical size for the root `width`/`height`; the viewBox stays in px. */
	physical?: { widthMm: number; heightMm: number };
	measureText?: TextMeasurer;
}

const num = (v: number) => Math.round(v * 100) / 100;

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
 * @param {SvgExportOptions} options - Title, legend, background and font embedding
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
	options: SvgExportOptions = {},
): string => {
	const measure = options.measureText ?? estimateTextWidth;
	const base = calculateLayout(
		datasets,
		series,
		xAxes,
		yAxes,
		width,
		height,
		measure,
	);
	const deco = layoutDecorations({
		width,
		height,
		padding: base.padding,
		rightAxesWidth: base.rightAxesWidth,
		title: options.title,
		entries: options.legend ? legendEntries(series) : [],
		legendPosition: options.legend ?? null,
		measure,
	});
	const ctx =
		deco.reserve.top || deco.reserve.right
			? calculateLayout(
					datasets,
					series,
					xAxes,
					yAxes,
					width,
					height,
					measure,
					deco.reserve,
				)
			: base;

	const size = options.physical
		? `width="${num(options.physical.widthMm)}mm" height="${num(options.physical.heightMm)}mm"`
		: `width="${width}" height="${height}"`;
	const background = options.transparent
		? ""
		: `background: ${escapeHTML(theme.plotBg)}; `;
	let svg = `<svg ${size} viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg" style="${background}font-family: ${escapeHTML(theme.fontFamily)};">`;
	if (options.fontFaceCss)
		svg += `<defs><style>${options.fontFaceCss}</style></defs>`;
	if (!options.transparent)
		svg += `<rect width="100%" height="100%" fill="${escapeHTML(theme.plotBg)}" />`;

	svg += drawGrid(ctx, width, height, theme);
	svg += drawZeroLines(ctx, width, height, theme);
	svg += drawSeriesData(ctx, datasets, series, xAxes, yAxes, width, height);
	svg += drawAxes(ctx, xAxes, width, height, theme);
	if (deco.legend) svg += drawLegend(deco.legend, theme);
	if (deco.title) svg += drawTitle(deco.title, theme);

	svg += `</svg>`;
	return svg;
};
