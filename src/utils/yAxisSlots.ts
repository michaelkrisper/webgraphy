import type { SeriesConfig, YAxisConfig } from "../services/persistence";
import { yAxisTitleText } from "./yAxisTitle";

const Y_AXIS_SLOTS = 9;

type AxisSeries = Pick<SeriesConfig, "yAxisId" | "name" | "yColumn"> & {
	lineColor?: string;
};

export interface UsedYAxis {
	/** Slot number, 1-9. */
	slot: number;
	id: string;
	/** Same text the chart draws as the axis title. */
	title: string;
	/** Distinct line colours of the series on the axis, in series order. */
	colors: string[];
}

export const yAxisSlot = (id: string): number =>
	Number.parseInt(id.split("-")[1], 10) || 1;

/** The y axes that carry at least one series, by slot number. */
export function usedYAxes(
	series: readonly AxisSeries[],
	yAxes: readonly Pick<YAxisConfig, "id" | "title">[] = [],
): UsedYAxis[] {
	const byId = new Map<string, { series: AxisSeries[]; colors: string[] }>();
	for (const s of series) {
		let entry = byId.get(s.yAxisId);
		if (!entry) {
			entry = { series: [], colors: [] };
			byId.set(s.yAxisId, entry);
		}
		entry.series.push(s);
		if (s.lineColor && !entry.colors.includes(s.lineColor)) {
			entry.colors.push(s.lineColor);
		}
	}
	return Array.from(byId, ([id, { series: onAxis, colors }]) => ({
		slot: yAxisSlot(id),
		id,
		title: yAxisTitleText(yAxes.find((a) => a.id === id)?.title, onAxis),
		colors,
	})).sort((a, b) => a.slot - b.slot);
}

/** Lowest slot no series uses, or null when all nine are taken. */
export function firstFreeYAxisSlot(
	series: readonly Pick<SeriesConfig, "yAxisId">[],
): number | null {
	for (let n = 1; n <= Y_AXIS_SLOTS; n++) {
		if (!series.some((s) => s.yAxisId === `axis-${n}`)) return n;
	}
	return null;
}

/**
 * Axis-level settings (side, grid) are shown once per axis, on the first row
 * that uses it, so rows sharing an axis do not look independently settable.
 */
export function ownsYAxisRow(
	series: readonly Pick<SeriesConfig, "id" | "yAxisId">[],
	row: Pick<SeriesConfig, "id" | "yAxisId">,
): boolean {
	const first = series.find((s) => s.yAxisId === row.yAxisId);
	return !first || first.id === row.id;
}
