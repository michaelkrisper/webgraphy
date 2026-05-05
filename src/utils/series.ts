import type { SeriesConfig } from "../services/persistence";
import { COLOR_PALETTE } from "../themes";

export const buildSeriesConfig = (
	columnName: string,
	sourceId: string,
	existingSeriesCount: number,
	isCategorical = false,
): SeriesConfig => {
	const color = COLOR_PALETTE[existingSeriesCount % COLOR_PALETTE.length];
	const axisNum = (existingSeriesCount % 9) + 1;
	return {
		id: crypto.randomUUID(),
		sourceId,
		name: columnName,
		yColumn: columnName,
		yAxisId: `axis-${axisNum}`,
		pointStyle: "circle",
		pointColor: color,
		lineStyle: isCategorical ? "none" : "solid",
		lineColor: color,
		hidden: false,
	};
};
