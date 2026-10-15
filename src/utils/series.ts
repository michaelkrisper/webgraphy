import type { Dataset, SeriesConfig } from "../services/persistence";
import { COLOR_PALETTE } from "../themes";

/**
 * Line and point styles cycle alongside the colour so series identity does
 * not rest on hue alone: the palette is chosen to stay distinguishable under
 * colour-vision deficiency, but thin lines still lose most of a hue cue.
 *
 * The two periods are coprime, so the pair (line, point) enumerates all
 * twelve combinations before repeating: any two of the first twelve series
 * differ in shape whatever their colours do. Dense series drop the point
 * shape (see `isDenseSeries`) and keep only the dash as the shape cue.
 */
const LINE_STYLES = ["solid", "dashed", "dotted"] as const;
const POINT_STYLES = ["circle", "square", "cross", "none"] as const;

const Y_AXIS_SLOTS = 9;

/** Plot width assumed at creation time, before the real one is known. */
const NOMINAL_PLOT_WIDTH_PX = 1500;
/** Closer than this, neighbouring markers overlap into a solid rope. */
const MIN_PX_PER_MARKER = 3;

interface Range {
	min: number;
	max: number;
}

const isFiniteRange = (r: Range | undefined): r is Range =>
	!!r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max;

/** Whether markers would pile up when the whole series is in view. */
export const isDenseSeries = (pointCount: number): boolean =>
	pointCount > NOMINAL_PLOT_WIDTH_PX / MIN_PX_PER_MARKER;

export interface SeriesConfigOptions {
	yAxisId?: string;
	/** Points in the series; dense series default to no markers. */
	pointCount?: number;
}

export const buildSeriesConfig = (
	columnName: string,
	sourceId: string,
	existingSeriesCount: number,
	isCategorical = false,
	{ yAxisId = "axis-1", pointCount = 0 }: SeriesConfigOptions = {},
): SeriesConfig => {
	const color = COLOR_PALETTE[existingSeriesCount % COLOR_PALETTE.length];
	const lineStyle = LINE_STYLES[existingSeriesCount % LINE_STYLES.length];
	let pointStyle: SeriesConfig["pointStyle"] =
		POINT_STYLES[existingSeriesCount % POINT_STYLES.length];
	// A categorical series draws no line, so "none" points would leave it
	// invisible. Shift to the next shape rather than dropping the cue.
	if (isCategorical && pointStyle === "none") {
		pointStyle = POINT_STYLES[(existingSeriesCount + 1) % POINT_STYLES.length];
	} else if (!isCategorical && isDenseSeries(pointCount)) {
		pointStyle = "none";
	}
	return {
		id: crypto.randomUUID(),
		sourceId,
		name: columnName,
		yColumn: columnName,
		yAxisId,
		pointStyle,
		pointColor: color,
		lineStyle: isCategorical ? "none" : lineStyle,
		lineColor: color,
		hidden: false,
	};
};

/** Overlap of two ranges as a share of their union (1 = identical). */
const overlapRatio = (a: Range, b: Range): number => {
	const union = Math.max(a.max, b.max) - Math.min(a.min, b.min);
	const inter = Math.min(a.max, b.max) - Math.max(a.min, b.min);
	if (inter < 0) return 0;
	return union > 0 ? inter / union : 1;
};

/**
 * Y-axis slot for a new series: the first slot no series uses yet. Once all
 * nine are taken, the axis whose current range overlaps `dataRange` most,
 * else the one carrying the fewest series.
 */
export function pickYAxisId(
	existing: readonly Pick<SeriesConfig, "yAxisId">[],
	yAxes: readonly ({ id: string } & Range)[],
	dataRange?: Range,
): string {
	const counts = new Map<string, number>();
	for (const s of existing) {
		counts.set(s.yAxisId, (counts.get(s.yAxisId) ?? 0) + 1);
	}
	const slots = Array.from({ length: Y_AXIS_SLOTS }, (_, i) => `axis-${i + 1}`);
	const free = slots.find((id) => !counts.has(id));
	if (free) return free;

	if (isFiniteRange(dataRange)) {
		let best: string | undefined;
		let bestScore = 0;
		for (const id of slots) {
			const axis = yAxes.find((a) => a.id === id);
			if (!isFiniteRange(axis)) continue;
			const score = overlapRatio(axis, dataRange);
			if (score > bestScore) {
				bestScore = score;
				best = id;
			}
		}
		if (best) return best;
	}

	let least = slots[0];
	for (const id of slots) {
		if ((counts.get(id) ?? 0) < (counts.get(least) ?? 0)) least = id;
	}
	return least;
}

/**
 * Columns imported together share a y axis when their ranges overlap and
 * their spans are within 10x of each other (a constant column joins any
 * range it falls inside) — e.g. min/mean/max of one sensor. Categorical
 * columns never share: each carries its own tick labels.
 */
const SHARED_AXIS_MAX_SPAN_RATIO = 10;

const similarRanges = (a: Range, b: Range): boolean => {
	if (a.min > b.max || b.min > a.max) return false;
	const sa = a.max - a.min;
	const sb = b.max - b.min;
	const lo = Math.min(sa, sb);
	return lo === 0 || Math.max(sa, sb) <= SHARED_AXIS_MAX_SPAN_RATIO * lo;
};

/**
 * Series configs for `columns` of one dataset added in one go, placed with
 * `pickYAxisId` and grouped onto shared axes by `similarRanges`.
 */
export function buildSeriesForColumns(
	ds: Pick<Dataset, "id" | "columns" | "data" | "rowCount">,
	columns: readonly string[],
	existing: readonly SeriesConfig[],
	yAxes: readonly ({ id: string } & Range)[],
): SeriesConfig[] {
	const built: SeriesConfig[] = [];
	const groups: { axisId: string; range: Range }[] = [];
	for (const col of columns) {
		const colData = ds.data[ds.columns.indexOf(col)];
		const isCategorical = !!colData?.categoryLabels;
		const bounds = isFiniteRange(colData?.bounds) ? colData.bounds : undefined;

		let yAxisId: string | undefined;
		if (!isCategorical && bounds) {
			const group = groups.find((g) => similarRanges(g.range, bounds));
			if (group) {
				yAxisId = group.axisId;
				group.range = {
					min: Math.min(group.range.min, bounds.min),
					max: Math.max(group.range.max, bounds.max),
				};
			}
		}
		if (!yAxisId) {
			yAxisId = pickYAxisId([...existing, ...built], yAxes, bounds);
			if (!isCategorical && bounds) {
				groups.push({ axisId: yAxisId, range: { ...bounds } });
			}
		}
		built.push(
			buildSeriesConfig(
				col,
				ds.id,
				existing.length + built.length,
				isCategorical,
				{
					yAxisId,
					pointCount: ds.rowCount,
				},
			),
		);
	}
	return built;
}
