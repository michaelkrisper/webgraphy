/**
 * Series key for the tooltip and the measurement panels: a short line in the
 * series' colour and dash style, or a dot for marker-only series. Text stays
 * in the neutral theme colour — light series colours (yellow, orange) are
 * unreadable as text on a light tooltip.
 */
export function swatchStyle(
	color: string,
	lineStyle: string | undefined,
): { dot: boolean; borderTop: string; backgroundColor: string } {
	const dot = lineStyle === "none";
	return {
		dot,
		borderTop: dot ? "" : `2px ${lineStyle || "solid"} ${color}`,
		backgroundColor: dot ? color : "",
	};
}
