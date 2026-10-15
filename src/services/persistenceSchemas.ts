// Zod schemas for the persisted app state. They live apart from
// persistence.ts so zod is fetched (in parallel with opening IndexedDB) only
// when saved state is actually validated, instead of riding in the entry chunk.
// `zod/mini` covers the whole surface used here and keeps the chainable
// classic API out of the bundle. Keep in sync with the interfaces in
// persistence.ts.
import * as z from "zod/mini";
import type { AxisScale } from "../utils/axisScale";
import { logger } from "../utils/logger";
import type { ViewportState } from "./persistence";

// Saved before log axes existed: no `scale`, which defaults to linear.
const AxisScaleSchema = z._default(z.enum(["linear", "log"]), "linear");
// A log axis cannot show a range reaching 0 or below.
const logRangeValid = (a: { scale: AxisScale; min: number }) =>
	a.scale !== "log" || a.min > 0;

const XAxisConfigSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		min: z.number(),
		max: z.number(),
		showGrid: z.boolean(),
		xMode: z.enum(["date", "numeric", "categorical"]),
		scale: AxisScaleSchema,
	})
	.check(z.refine(logRangeValid));
const YAxisConfigSchema = z
	.object({
		id: z.string(),
		name: z.string(),
		min: z.number(),
		max: z.number(),
		position: z.enum(["left", "right"]),
		color: z.string(),
		showGrid: z.boolean(),
		scale: AxisScaleSchema,
	})
	.check(z.refine(logRangeValid));
const SeriesConfigSchema = z.object({
	id: z.string(),
	sourceId: z.string(),
	name: z.string(),
	yColumn: z.string(),
	yAxisId: z.string(),
	pointStyle: z.enum(["circle", "square", "cross", "none"]),
	pointColor: z.string(),
	lineStyle: z.enum(["solid", "dashed", "dotted", "none"]),
	lineColor: z.string(),
	hidden: z.optional(z.boolean()),
});
const ViewportSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
});
// Older persisted configs additionally carry an `axisTitles` object from a
// removed feature; Zod strips unknown keys, so they load unchanged.
export const ConfigSchema = z.object({
	series: z.array(SeriesConfigSchema),
	legendVisible: z.boolean(),
	crosshairVisible: z.boolean(),
});
export const LegacyAppStateSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
	series: z.array(SeriesConfigSchema),
});

const DEFAULT_AXIS_RANGE = { min: 0, max: 100 };
const DEFAULT_LOG_AXIS_RANGE = { min: 1, max: 100 };

/**
 * An axis range is view state, not data: a bad one (e.g. the ±Infinity bounds
 * of an all-NaN column saved by an older build) must not cost the user their
 * whole series config. Non-finite ranges fall back to the default and entries
 * that are otherwise malformed are dropped; the store refills missing slots.
 */
function sanitizeAxes<T>(
	raw: unknown,
	schema: z.ZodMiniType<T>,
	label: string,
): T[] {
	if (!Array.isArray(raw)) return [];
	const out: T[] = [];
	for (const entry of raw as unknown[]) {
		let candidate = entry;
		if (entry && typeof entry === "object") {
			const { min, max, scale } = entry as {
				min?: unknown;
				max?: unknown;
				scale?: unknown;
			};
			if (scale === "log") {
				if (!(Number.isFinite(max) && (min as number) > 0))
					candidate = { ...entry, ...DEFAULT_LOG_AXIS_RANGE };
			} else if (!(Number.isFinite(min) && Number.isFinite(max))) {
				candidate = { ...entry, ...DEFAULT_AXIS_RANGE };
			}
		}
		const parsed = schema.safeParse(candidate);
		if (parsed.success) out.push(parsed.data);
		if (!parsed.success || candidate !== entry)
			logger.warn("Repaired invalid saved axis", { label, entry });
	}
	return out;
}

export function parseViewport(raw: unknown): ViewportState {
	const v = ViewportSchema.safeParse(raw);
	if (v.success) return v.data;
	const r = (raw ?? {}) as { xAxes?: unknown; yAxes?: unknown };
	return {
		xAxes: sanitizeAxes(r.xAxes, XAxisConfigSchema, "x"),
		yAxes: sanitizeAxes(r.yAxes, YAxisConfigSchema, "y"),
	};
}
