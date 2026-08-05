import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { formatFullDate } from "../../utils/time";

/**
 * The plot is a WebGL canvas, which is entirely opaque to assistive
 * technology: without an accessible name it is announced as nothing at all.
 * This builds that name from the same data the renderer draws, so it stays in
 * step with what is on screen instead of being a fixed string.
 *
 * Kept short on purpose. A screen reader announces the whole label in one go,
 * so it names what is plotted and over which ranges; per-point data belongs in
 * a table, not in a label.
 */

/** Series listed by name before the label switches to a count. */
const MAX_NAMED_SERIES = 5;

function formatBound(value: number, xMode: XAxisConfig["xMode"]): string {
	if (!Number.isFinite(value)) return "unknown";
	if (xMode === "date") return formatFullDate(value);
	// toPrecision keeps long floats from flooding the announcement. The
	// explicit fraction-digit ceiling matters: toLocaleString defaults to three
	// decimals, which would announce a 0.000123-wide axis as "0 to 0".
	return parseFloat(value.toPrecision(6)).toLocaleString(undefined, {
		maximumFractionDigits: 10,
	});
}

export interface DescribeChartInput {
	series: readonly SeriesConfig[];
	datasets: readonly Dataset[];
	xAxes: readonly XAxisConfig[];
	yAxes: readonly YAxisConfig[];
}

/**
 * A one-sentence-per-part description of the current chart, suitable for
 * `aria-label` on the plot canvas.
 */
export function describeChart({
	series,
	datasets,
	xAxes,
	yAxes,
}: DescribeChartInput): string {
	const visible = series.filter((s) => !s.hidden);
	if (visible.length === 0) {
		return "Empty chart. No data series are displayed.";
	}

	const names = visible.map((s) => s.name || s.yColumn);
	const seriesPart =
		names.length <= MAX_NAMED_SERIES
			? `${names.length} data series: ${names.join(", ")}.`
			: `${names.length} data series, including ${names
					.slice(0, MAX_NAMED_SERIES)
					.join(", ")}.`;

	// Only axes actually carrying a visible series are announced; the other
	// slots exist up front but are empty. A series reaches its x axis through
	// its dataset, which is what owns the x column.
	const xAxisIdByDatasetId = new Map(datasets.map((d) => [d.id, d.xAxisId]));
	const usedXIds = new Set<string>();
	for (const s of visible) {
		const xAxisId = xAxisIdByDatasetId.get(s.sourceId);
		if (xAxisId) usedXIds.add(xAxisId);
	}
	const usedYIds = new Set(visible.map((s) => s.yAxisId));

	const axisParts: string[] = [];
	for (const axis of xAxes) {
		if (!usedXIds.has(axis.id)) continue;
		const label = axis.name || "Horizontal axis";
		axisParts.push(
			`${label} from ${formatBound(axis.min, axis.xMode)} to ${formatBound(
				axis.max,
				axis.xMode,
			)}.`,
		);
	}
	for (const axis of yAxes) {
		if (!usedYIds.has(axis.id)) continue;
		const label = axis.name || "Vertical axis";
		axisParts.push(
			`${label} from ${formatBound(axis.min, "numeric")} to ${formatBound(
				axis.max,
				"numeric",
			)}.`,
		);
	}

	return `Line chart. ${seriesPart} ${axisParts.join(" ")}`.trim();
}
