import type { SeriesConfig } from "../services/persistence";

type TitleSeries = Pick<SeriesConfig, "name" | "yColumn"> & {
	lineColor?: string;
};

export interface TitlePart {
	text: string;
	color: string;
}

export const Y_TITLE_SEPARATOR = " / ";

/** The automatic y-axis title: the names of its series, joined. */
export const autoYAxisTitle = (series: readonly TitleSeries[]): string =>
	series.map((s) => s.name || s.yColumn).join(Y_TITLE_SEPARATOR);

/** The title a y axis shows: its custom `title`, else the automatic one. */
export const yAxisTitleText = (
	title: string | undefined,
	series: readonly TitleSeries[],
): string => title || autoYAxisTitle(series);

/**
 * The y-axis title as coloured parts, separators not included. A custom
 * title is one part, in the series colour when all its series share one
 * (like an x-axis title); the automatic title is each series' name in its
 * own colour.
 */
export function yAxisTitleParts(
	title: string | undefined,
	series: readonly TitleSeries[],
	labelColor: string,
): TitlePart[] {
	if (title) {
		const colors = new Set(series.map((s) => s.lineColor));
		const only = colors.size === 1 ? series[0]?.lineColor : undefined;
		return [{ text: title, color: only ?? labelColor }];
	}
	return series.map((s) => ({
		text: s.name || s.yColumn,
		color: s.lineColor ?? labelColor,
	}));
}

/**
 * The `title` to store for what was typed: blank, or the automatic title
 * itself, means automatic, so an unchanged rename does not freeze the title
 * against later series changes.
 */
export function customYAxisTitle(
	typed: string,
	series: readonly TitleSeries[],
): string | undefined {
	const t = typed.trim();
	return t && t !== autoYAxisTitle(series) ? t : undefined;
}
