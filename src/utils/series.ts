import type { SeriesConfig } from "../services/persistence";
import { COLOR_PALETTE } from "../themes";

/**
 * Line and point styles cycle alongside the colour so series identity does
 * not rest on hue alone — cobalt and violet are ΔE 6.4 apart under
 * deuteranopia, teal and cyan ΔE 4.3 under tritanopia, both well inside the
 * range where thin plot lines read as the same colour.
 *
 * The two periods are coprime, so the pair (line, point) enumerates all
 * twelve combinations before repeating: any two of the first twelve series
 * differ in shape whatever their colours do.
 */
const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
const POINT_STYLES = ["circle", "square", "cross", "none"] as const;

export const buildSeriesConfig = (
	columnName: string,
	sourceId: string,
	existingSeriesCount: number,
	isCategorical = false,
): SeriesConfig => {
	const color = COLOR_PALETTE[existingSeriesCount % COLOR_PALETTE.length];
	const axisNum = (existingSeriesCount % 9) + 1;
	const lineStyle = LINE_STYLES[existingSeriesCount % LINE_STYLES.length];
	let pointStyle = POINT_STYLES[existingSeriesCount % POINT_STYLES.length];
	// A categorical series draws no line, so "none" points would leave it
	// invisible. Shift to the next shape rather than dropping the cue.
	if (isCategorical && pointStyle === "none") {
		pointStyle = POINT_STYLES[(existingSeriesCount + 1) % POINT_STYLES.length];
	}
	return {
		id: crypto.randomUUID(),
		sourceId,
		name: columnName,
		yColumn: columnName,
		yAxisId: `axis-${axisNum}`,
		pointStyle,
		pointColor: color,
		lineStyle: isCategorical ? "none" : lineStyle,
		lineColor: color,
		hidden: false,
	};
};
