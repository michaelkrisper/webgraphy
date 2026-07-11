/**
 * Builds the per-frame axis-label list for the WebGL renderer: tick labels,
 * secondary (date context) labels with their background/separator chrome,
 * and axis titles. Pure CPU-side math extracted from the former 2D-canvas
 * AxesLayer so it can be unit-tested and shipped to the render worker; text
 * measurement and rasterization happen renderer-side (labelAtlas.ts).
 */

import type { SeriesConfig } from "../../services/persistence";
import { formatAxisLabel } from "../../utils/axisCalculations";
import { findExact } from "../../utils/binarySearch";
import type { SecondaryLabel } from "../../utils/time";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";
import type { RenderLabel } from "./rendererCore";

export interface LabelBuildContext {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	axisLayout: Record<string, { total: number; label: number }>;
	xAxesMetrics: XAxisMetrics[];
	labelColor: string;
	secLabelBg: string;
	fontFamily: string;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	seriesByXAxisId: Record<string, SeriesConfig[]>;
	seriesByYAxisId: Record<string, SeriesConfig[]>;
}

/**
 * Formatted-label string cache: per-axis (id+precision) → tickValue → string.
 * Avoids per-frame toFixed/toExponential calls; entries for axes/precisions
 * not seen in a frame are evicted at its end.
 */
export interface LabelStringCache {
	byAxis: Map<string, Map<number, string>>;
	used: Set<string>;
}

export const createLabelStringCache = (): LabelStringCache => ({
	byAxis: new Map(),
	used: new Set(),
});

function getCachedLabel(
	cache: LabelStringCache,
	axisKey: string,
	precision: number,
	value: number,
): string {
	const mapKey = `${axisKey}|${precision}`;
	cache.used.add(mapKey);
	let m = cache.byAxis.get(mapKey);
	if (!m) {
		m = new Map();
		cache.byAxis.set(mapKey, m);
	}
	let s = m.get(value);
	if (s === undefined) {
		s = formatAxisLabel(value, precision);
		if (m.size > 4096) m.clear();
		m.set(value, s);
	}
	return s;
}

function buildXAxisLabels(
	out: RenderLabel[],
	axis: XAxisLayout,
	metrics: XAxisMetrics | undefined,
	ctx: LabelBuildContext,
	cache: LabelStringCache,
): void {
	if (!metrics) return;
	const { height, width, padding, fontFamily, labelColor } = ctx;
	const chartWidth = width - padding.left - padding.right;
	const baseY = height - padding.bottom + metrics.cumulativeOffset;
	const lblColor = axis.color || labelColor;

	// Primary tick labels
	const primaryFont = `9px ${fontFamily}`;
	const primaryY = baseY + metrics.labelBottom;
	axis.ticks.result.forEach((t) => {
		const timestamp = typeof t === "number" ? t : t.timestamp;
		const normX = (timestamp - axis.min) / (axis.max - axis.min);
		if (normX < 0 || normX > 1) return;
		const x = padding.left + normX * chartWidth;
		let label: string;
		if (axis.categoryLabels) {
			const v = typeof t === "number" ? t : t.timestamp;
			const idx = axis.categoryTicks
				? findExact(axis.categoryTicks, v)
				: Math.round(v);
			const name = idx >= 0 ? axis.categoryLabels[idx] : undefined;
			if (name === undefined) return;
			label = name;
		} else {
			label =
				typeof t === "number"
					? getCachedLabel(cache, `x:${axis.id}`, axis.ticks.precision ?? 0, t)
					: t.label;
		}
		out.push({
			text: label,
			color: lblColor,
			font: primaryFont,
			x,
			y: primaryY,
			align: "center",
			baseline: "alphabetic",
		});
	});

	// Secondary labels (date context row): background quad + separator stroke
	// are emitted as label chrome — their width depends on the rendered text.
	if (axis.ticks.secondaryLabels) {
		const secFont = `bold 10px ${fontFamily}`;
		const secList = axis.ticks.secondaryLabels;
		const textY = baseY + metrics.secLabelBottom - 2;
		secList.forEach((sl: SecondaryLabel, i: number) => {
			const nextSl = secList[i + 1];
			const normX = (sl.timestamp - axis.min) / (axis.max - axis.min);
			const nextNormX = nextSl
				? (nextSl.timestamp - axis.min) / (axis.max - axis.min)
				: 1.5;

			const currentX = padding.left + normX * chartWidth;
			const nextX = padding.left + nextNormX * chartWidth;
			if (currentX > width - padding.right || nextX < padding.left) return;

			const x = Math.max(currentX + 5, padding.left + 5);
			out.push({
				text: sl.label,
				color: lblColor,
				font: secFont,
				x,
				y: textY,
				align: "left",
				baseline: "alphabetic",
				bg: ctx.secLabelBg,
				tick: currentX > padding.left ? { x: currentX, color: lblColor } : undefined,
			});
		});
	}

	// Axis title
	const axisSeries = ctx.seriesByXAxisId[axis.id] || [];
	const uniqueColors = new Set(axisSeries.map((s) => s.lineColor));
	const titleColor =
		uniqueColors.size === 1
			? (axisSeries[0].lineColor ?? labelColor)
			: lblColor;
	out.push({
		text: axis.title,
		color: titleColor,
		font: `bold 12px ${fontFamily}`,
		x: padding.left + chartWidth / 2,
		y: baseY + metrics.titleBottom,
		align: "center",
		baseline: "alphabetic",
	});
}

function buildYAxisLabels(
	out: RenderLabel[],
	axis: YAxisLayout,
	ctx: LabelBuildContext,
	cache: LabelStringCache,
): void {
	const { width, height, padding, fontFamily, labelColor } = ctx;
	const chartHeight = height - padding.top - padding.bottom;
	const isLeft = axis.position === "left";
	const metrics = ctx.axisLayout[axis.id] || { total: 40, label: 30 };

	const xPos = isLeft
		? padding.left - (ctx.leftOffsets[axis.id] ?? 0) - metrics.total
		: width - padding.right + (ctx.rightOffsets[axis.id] ?? 0);

	const spineX = isLeft ? xPos + metrics.total : xPos;
	const labelX = isLeft ? spineX - 7 : spineX + 7;
	const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

	const tickFont = `9px ${fontFamily}`;
	axis.ticks.forEach((t) => {
		const normY = (t - axis.min) / (axis.max - axis.min);
		if (normY < 0 || normY > 1) return;
		const y = padding.top + (1 - normY) * chartHeight;
		let label: string;
		if (axis.categoryLabels) {
			const idx = Math.round(t);
			const name = axis.categoryLabels[idx];
			if (name === undefined) return;
			label = name;
		} else {
			label = getCachedLabel(cache, `y:${axis.id}`, axis.precision, t);
		}
		out.push({
			text: label,
			color: labelColor,
			font: tickFont,
			x: labelX,
			y,
			align: isLeft ? "right" : "left",
			baseline: "middle",
		});
	});

	// Axis title: one composite multi-color label, rotated ±90° around its
	// center on the axis gutter.
	const axisSeries = ctx.seriesByYAxisId[axis.id] || [];
	if (axisSeries.length > 0) {
		const segments: { text: string; color: string }[] = [];
		axisSeries.forEach((s, i) => {
			if (i > 0 && axisSeries.length > 1) {
				segments.push({ text: " / ", color: labelColor });
			}
			segments.push({
				text: s.name || s.yColumn,
				color: s.lineColor ?? labelColor,
			});
		});
		out.push({
			text: "",
			color: labelColor,
			font: `bold 12px ${fontFamily}`,
			x: titleX,
			y: padding.top + chartHeight / 2,
			align: "center",
			baseline: "middle",
			rot: isLeft ? -1 : 1,
			segments,
		});
	}
}

export function buildLabels(
	xAxes: XAxisLayout[],
	yAxes: YAxisLayout[],
	ctx: LabelBuildContext,
	cache: LabelStringCache,
): RenderLabel[] {
	const out: RenderLabel[] = [];
	cache.used.clear();
	xAxes.forEach((axis, i) =>
		buildXAxisLabels(out, axis, ctx.xAxesMetrics[i], ctx, cache),
	);
	yAxes.forEach((axis) => buildYAxisLabels(out, axis, ctx, cache));
	// Evict string caches for axes/precisions not seen this frame.
	cache.byAxis.forEach((_, key) => {
		if (!cache.used.has(key)) cache.byAxis.delete(key);
	});
	return out;
}
