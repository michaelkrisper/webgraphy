import type { LegendPosition } from "./exportOptions";
import type { SeriesConfig } from "./persistence";

/** Width in px of `text` set at `fontPx`, bold or regular. */
export type TextMeasurer = (
	text: string,
	fontPx: number,
	bold?: boolean,
) => number;

/**
 * Deliberately generous average glyph width: an overestimate only leaves a
 * little slack in the legend box, an underestimate would clip labels.
 */
export const estimateTextWidth: TextMeasurer = (text, fontPx, bold) =>
	text.length * fontPx * (bold ? 0.62 : 0.58);

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

export const rectsIntersect = (a: Rect, b: Rect) =>
	a.x < b.x + b.width &&
	b.x < a.x + a.width &&
	a.y < b.y + b.height &&
	b.y < a.y + a.height;

export const LEGEND = {
	fontPx: 12,
	rowHeight: 18,
	padX: 8,
	padY: 4,
	swatchWidth: 20,
	swatchGap: 6,
	maxLabelWidth: 220,
	/** Distance of an inside legend from the plot frame, as on screen. */
	inset: 10,
	/** Gap between the right axes' gutter and an outside legend. */
	gap: 16,
} as const;

export const TITLE = {
	fontPx: 16,
	/** Space reserved above the plot area, from the image's top edge. */
	blockHeight: 30,
	top: 8,
} as const;

export type LegendEntry = Pick<
	SeriesConfig,
	"id" | "name" | "lineColor" | "lineStyle" | "pointColor" | "pointStyle"
>;

/**
 * The series the exported legend lists: those actually drawn. The on-screen
 * legend also keeps hidden series (dimmed, to toggle back); an image cannot.
 */
export const legendEntries = (series: SeriesConfig[]): LegendEntry[] =>
	series
		.filter(
			(s) => !s.hidden && (s.lineStyle !== "none" || s.pointStyle !== "none"),
		)
		.map(({ id, name, lineColor, lineStyle, pointColor, pointStyle }) => ({
			id,
			name,
			lineColor,
			lineStyle,
			pointColor,
			pointStyle,
		}));

/** `text` shortened with an ellipsis until it fits `maxWidth`. */
export function fitText(
	text: string,
	maxWidth: number,
	measure: TextMeasurer,
	fontPx: number,
	bold = false,
): string {
	if (measure(text, fontPx, bold) <= maxWidth) return text;
	const chars = Array.from(text);
	let lo = 0;
	let hi = chars.length;
	while (lo < hi) {
		const mid = (lo + hi + 1) >> 1;
		if (measure(`${chars.slice(0, mid).join("")}…`, fontPx, bold) <= maxWidth)
			lo = mid;
		else hi = mid - 1;
	}
	return lo === 0 ? "" : `${chars.slice(0, lo).join("").trimEnd()}…`;
}

export interface LegendBlock {
	items: { entry: LegendEntry; label: string }[];
	rows: number;
	columns: number;
	/** Whether entries fill a column first (side legends) or a row (top band). */
	flow: "column" | "row";
	columnWidth: number;
	width: number;
	height: number;
}

const legendItems = (entries: LegendEntry[], measure: TextMeasurer) => {
	const items = entries.map((entry) => ({
		entry,
		label: fitText(entry.name, LEGEND.maxLabelWidth, measure, LEGEND.fontPx),
	}));
	const labelWidth = Math.max(
		0,
		...items.map((i) => measure(i.label, LEGEND.fontPx)),
	);
	const columnWidth =
		LEGEND.padX * 2 +
		LEGEND.swatchWidth +
		LEGEND.swatchGap +
		Math.ceil(labelWidth);
	return { items, columnWidth };
};

const legendBlock = (
	items: LegendBlock["items"],
	columnWidth: number,
	rows: number,
	columns: number,
	flow: LegendBlock["flow"],
): LegendBlock => ({
	items,
	rows,
	columns,
	flow,
	columnWidth,
	width: columns * columnWidth,
	height: rows * LEGEND.rowHeight + LEGEND.padY * 2,
});

/** Legend size, flowing into further columns once `maxHeight` is full. */
export function measureLegend(
	entries: LegendEntry[],
	maxHeight: number,
	measure: TextMeasurer,
): LegendBlock {
	const { items, columnWidth } = legendItems(entries, measure);
	const perColumn = Math.max(
		1,
		Math.floor((maxHeight - LEGEND.padY * 2) / LEGEND.rowHeight),
	);
	const columns = Math.max(1, Math.ceil(items.length / perColumn));
	const rows = Math.min(items.length, perColumn);
	return legendBlock(items, columnWidth, rows, columns, "column");
}

/** Legend laid out in rows, as many entries side by side as `maxWidth` takes. */
export function measureLegendRows(
	entries: LegendEntry[],
	maxWidth: number,
	measure: TextMeasurer,
): LegendBlock {
	const { items, columnWidth } = legendItems(entries, measure);
	const perRow = Math.max(1, Math.floor(maxWidth / columnWidth));
	const columns = Math.min(items.length, perRow);
	const rows = Math.max(1, Math.ceil(items.length / perRow));
	return legendBlock(items, columnWidth, rows, columns, "row");
}

/** `top` is the fallback band above the plot area, used when no other spot fits. */
export type LegendPlacement = Exclude<LegendPosition, "auto"> | "top";

export interface DecorationInput {
	width: number;
	height: number;
	/** Padding of the plot area before any title/legend space is reserved. */
	padding: Padding;
	/** Total gutter width of the right-hand y axes. */
	rightAxesWidth: number;
	title?: string;
	entries: LegendEntry[];
	/** `null` leaves the legend out. */
	legendPosition: LegendPosition | null;
	measure?: TextMeasurer;
}

export interface DecorationLayout {
	/** Extra space added to the plot padding. */
	reserve: { top: number; right: number };
	/** Plot padding with `reserve` applied. */
	padding: Padding;
	title?: { text: string; box: Rect };
	legend?: {
		block: LegendBlock;
		box: Rect;
		placement: LegendPlacement;
	};
}

const plotRect = (width: number, height: number, p: Padding): Rect => ({
	x: p.left,
	y: p.top,
	width: Math.max(0, width - p.left - p.right),
	height: Math.max(0, height - p.top - p.bottom),
});

/** An outside legend must leave the plot at least this share of its width. */
const MIN_PLOT_SHARE = 0.5;
/** Margin of the title and a top legend band from the image edges. */
const EDGE = TITLE.top;

/** Horizontal start of a `boxWidth` box centred over the plot, kept in the image. */
const centredX = (plot: Rect, boxWidth: number, width: number) =>
	Math.min(
		Math.max(plot.x + plot.width / 2 - boxWidth / 2, EDGE),
		width - EDGE - boxWidth,
	);

/**
 * Places the optional title (above the plot area) and legend (in a corner of
 * the plot area, in a column right of the right axes, or — when neither fits —
 * in a band above the plot), reserving padding so neither covers an axis, its
 * tick labels or its title.
 */
export function layoutDecorations(input: DecorationInput): DecorationLayout {
	const { width, height, rightAxesWidth, entries, legendPosition } = input;
	const measure = input.measure ?? estimateTextWidth;
	const title = input.title?.trim() ?? "";
	const titleBlock = title ? TITLE.blockHeight : 0;
	const reserve = { top: titleBlock, right: 0 };
	const withReserve = (): Padding => ({
		...input.padding,
		top: input.padding.top + reserve.top,
		right: input.padding.right + reserve.right,
	});

	let legend: DecorationLayout["legend"];
	if (legendPosition && entries.length > 0) {
		const plot = plotRect(width, height, withReserve());
		const inner = {
			width: plot.width - LEGEND.inset * 2,
			height: plot.height - LEGEND.inset * 2,
		};
		const insideBlock = measureLegend(entries, inner.height, measure);
		const fitsInside =
			insideBlock.width <= inner.width && insideBlock.height <= inner.height;
		const outsideBlock = measureLegend(entries, plot.height, measure);
		const fitsOutside =
			plot.width - outsideBlock.width - LEGEND.gap >= plot.width * MIN_PLOT_SHARE;
		const fallback: LegendPlacement = fitsOutside ? "outside-right" : "top";
		// Auto keeps the on-screen spot unless the legend would bury the data.
		const placement: LegendPlacement =
			legendPosition === "auto"
				? fitsInside &&
					insideBlock.columns === 1 &&
					insideBlock.width <= plot.width * 0.45
					? "top-right"
					: fallback
				: legendPosition === "outside-right" || !fitsInside
					? fallback
					: legendPosition;

		if (placement === "outside-right") {
			const block = outsideBlock;
			reserve.right = block.width + LEGEND.gap;
			const p = withReserve();
			legend = {
				block,
				placement,
				box: {
					x: width - p.right + rightAxesWidth + LEGEND.gap,
					y: p.top,
					width: block.width,
					height: block.height,
				},
			};
		} else if (placement === "top") {
			const block = measureLegendRows(entries, width - 2 * EDGE, measure);
			reserve.top += block.height;
			legend = {
				block,
				placement,
				box: {
					x: centredX(plot, block.width, width),
					y: title ? titleBlock + 2 : EDGE,
					width: block.width,
					height: block.height,
				},
			};
		} else {
			const b = insideBlock;
			const left = placement.endsWith("left");
			const top = placement.startsWith("top");
			legend = {
				block: b,
				placement,
				box: {
					x: left
						? plot.x + LEGEND.inset
						: plot.x + plot.width - LEGEND.inset - b.width,
					y: top
						? plot.y + LEGEND.inset
						: plot.y + plot.height - LEGEND.inset - b.height,
					width: b.width,
					height: b.height,
				},
			};
		}
	}

	const padding = withReserve();
	let titleLayout: DecorationLayout["title"];
	if (title) {
		const plot = plotRect(width, height, padding);
		// Centred over the plot area, but free to use the full image width.
		const maxWidth = Math.max(0, width - 2 * EDGE);
		const text = fitText(title, maxWidth, measure, TITLE.fontPx, true);
		const textWidth = Math.min(maxWidth, measure(text, TITLE.fontPx, true));
		titleLayout = {
			text,
			box: {
				x: centredX(plot, textWidth, width),
				y: TITLE.top,
				width: textWidth,
				height: TITLE.fontPx * 1.25,
			},
		};
	}

	return { reserve, padding, title: titleLayout, legend };
}
