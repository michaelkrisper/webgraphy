import type { SeriesConfig } from "../services/persistence";

/** Series line widths, in CSS px. `SeriesConfig.lineWidth` absent means 1. */
export const DEFAULT_LINE_WIDTH = 1;
export const MIN_LINE_WIDTH = 0.5;
export const MAX_LINE_WIDTH = 10;

export const lineWidthOf = (s: Pick<SeriesConfig, "lineWidth">): number =>
	s.lineWidth ?? DEFAULT_LINE_WIDTH;

/** The default is stored as absent, so choosing it on a new series is no edit. */
export const lineWidthUpdate = (
	width: number,
): Pick<SeriesConfig, "lineWidth"> => ({
	lineWidth: width === DEFAULT_LINE_WIDTH ? undefined : width,
});

/** A highlighted line stays visibly bolder than its own width. */
export const highlightedLineWidth = (width: number): number =>
	Math.max(2.5, width + 1.5);

/**
 * Dash and gap lengths grow with the width so wide dashed and dotted lines
 * keep their rhythm; thinner than the default keeps the default pattern.
 */
export const dashScale = (width: number): number => Math.max(1, width);

/** Legend swatches are 10 px tall; wider lines are drawn capped. */
export const legendLineWidth = (s: Pick<SeriesConfig, "lineWidth">): number =>
	Math.min(lineWidthOf(s), 3);
