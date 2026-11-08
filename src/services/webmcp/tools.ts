// WebMCP tools: what an in-browser AI agent may read and do. Privacy rule:
// results carry metadata and aggregates only, never row values, and nothing
// exports, downloads or deletes data. Mutations go through the store actions,
// so they are undoable and persisted exactly like the same edit in the UI.

import { describeChart } from "../../components/Plot/chartDescription";
import {
	latestHistoryId,
	undoIfLatest,
	useGraphHistory,
	useGraphStore,
	withHistory,
} from "../../store/useGraphStore";
import { notify } from "../../store/useNotificationStore";
import { DEFAULT_X_AXIS_ID } from "../../utils/axisCalculations";
import { parseAxisValue, validateAxisRange } from "../../utils/axisRange";
import { getColumnIndex } from "../../utils/columns";
import type { FormulaCategory } from "../../utils/formulaFunctions";
import { buildSeriesConfig, pickYAxisId } from "../../utils/series";
import { runViewportCommand } from "../../utils/viewportCommands";
import { firstFreeYAxisSlot, yAxisSlot } from "../../utils/yAxisSlots";
import { customYAxisTitle, yAxisTitleText } from "../../utils/yAxisTitle";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../persistence";
import type { ModelContextTool, ToolResult } from "./detect";
import { type JsonSchema, validateInput } from "./schema";
import { columnStatistics } from "./stats";

const PRIVACY =
	"Returns metadata and aggregate statistics only, never individual row values.";
// Over an X range this narrow, statistics give rows away: one row has
// min = max = mean = its value, so a column could be read row by row.
const MIN_RANGE_VALUES = 5;
const NOT_MOUNTED =
	"The chart is not on screen, so the view cannot be changed right now";

/** Expected failures: their message is the answer to the agent. */
class ToolError extends Error {}

const ok = (body: unknown): ToolResult => ({
	content: [
		{
			type: "text",
			text: typeof body === "string" ? body : JSON.stringify(body),
		},
	],
});

const failure = (message: string): ToolResult => ({
	content: [{ type: "text", text: `Error: ${message}` }],
	isError: true,
});

interface ToolSpec<I> {
	name: string;
	title: string;
	description: string;
	inputSchema: JsonSchema;
	readOnly?: boolean;
	/** Output echoes names that come from the user's files. */
	untrusted?: boolean;
	run(input: I): ToolResult | Promise<ToolResult>;
}

function defineTool<I>(spec: ToolSpec<I>): ModelContextTool {
	return {
		name: spec.name,
		title: spec.title,
		description: spec.description,
		inputSchema: spec.inputSchema,
		annotations: {
			readOnlyHint: spec.readOnly ?? false,
			untrustedContentHint: spec.untrusted ?? false,
		},
		async execute(input) {
			const invalid = validateInput(spec.inputSchema, input);
			if (invalid) return failure(invalid);
			if (!useGraphStore.getState().isLoaded)
				return failure("WebGraphy is still loading; try again in a moment");
			try {
				return await spec.run((input ?? {}) as I);
			} catch (error) {
				return failure(error instanceof Error ? error.message : String(error));
			}
		},
	};
}

// --- Lookups -----------------------------------------------------------------

function findDataset(ref: string): Dataset {
	const { datasets } = useGraphStore.getState();
	const byId = datasets.find((d) => d.id === ref);
	if (byId) return byId;
	const byName = datasets.filter((d) => d.name === ref);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1)
		throw new ToolError(
			`Several datasets are named "${ref}"; pass the id instead: ${byName.map((d) => d.id).join(", ")}`,
		);
	if (datasets.length === 0)
		throw new ToolError("The workspace has no datasets");
	throw new ToolError(
		`No dataset "${ref}". Datasets: ${datasets.map((d) => `"${d.name}" (id ${d.id})`).join(", ")}`,
	);
}

function findColumn(
	ds: Dataset,
	ref: string,
): { name: string; col: DataColumn } {
	const idx = getColumnIndex(ds, ref);
	if (idx === -1)
		throw new ToolError(
			`Dataset "${ds.name}" has no column "${ref}". Columns: ${ds.columns.join(", ")}`,
		);
	return { name: ds.columns[idx], col: ds.data[idx] };
}

const seriesName = (s: SeriesConfig) => s.name || s.yColumn;

function findSeries(ref: string): SeriesConfig {
	const { series } = useGraphStore.getState();
	const byId = series.find((s) => s.id === ref);
	if (byId) return byId;
	const byName = series.filter((s) => seriesName(s) === ref);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1)
		throw new ToolError(
			`Several series are named "${ref}"; pass the id instead: ${byName.map((s) => s.id).join(", ")}`,
		);
	if (series.length === 0) throw new ToolError("Nothing is plotted");
	throw new ToolError(
		`No series "${ref}". Series: ${series.map((s) => `"${seriesName(s)}" (id ${s.id})`).join(", ")}`,
	);
}

// --- Output ------------------------------------------------------------------

type ColumnKind = "numeric" | "date" | "categorical";

const columnKind = (col: DataColumn): ColumnKind =>
	col.categoryLabels ? "categorical" : col.isFloat64 ? "date" : "numeric";

/** 12 significant digits hide float noise but keep what a zoom resolves. */
const num = (v: number): number | null =>
	Number.isFinite(v) ? Number(v.toPrecision(12)) : null;

/** Dates are stored as epoch seconds. */
const isoDate = (seconds: number): string | null =>
	Number.isFinite(seconds) && Math.abs(seconds) < 8.64e12
		? new Date(seconds * 1000).toISOString()
		: null;

function range(min: number, max: number, isDate: boolean) {
	return isDate
		? {
				min: num(min),
				max: num(max),
				minDate: isoDate(min),
				maxDate: isoDate(max),
			}
		: { min: num(min), max: num(max) };
}

function describeColumn(name: string, col: DataColumn) {
	const kind = columnKind(col);
	return {
		name,
		kind,
		...(kind === "categorical"
			? { categories: col.categoryLabels?.length ?? 0 }
			: range(col.bounds.min, col.bounds.max, kind === "date")),
		...(col.formula ? { formula: col.formula } : {}),
	};
}

const describeSeries = (s: SeriesConfig) => ({
	id: s.id,
	name: seriesName(s),
	dataset: s.sourceId,
	column: s.yColumn,
	yAxis: yAxisSlot(s.yAxisId),
	color: s.lineColor,
	...(s.pointColor !== s.lineColor ? { pointColor: s.pointColor } : {}),
	lineStyle: s.lineStyle,
	pointStyle: s.pointStyle,
	visible: !s.hidden,
});

const xAxisOf = (d: Dataset) => d.xAxisId || DEFAULT_X_AXIS_ID;

function describeXAxis(a: XAxisConfig, datasets: readonly Dataset[]) {
	const on = datasets.filter((d) => xAxisOf(d) === a.id);
	return {
		slot: yAxisSlot(a.id),
		title: a.name || [...new Set(on.map((d) => d.xAxisColumn))].join(" / "),
		...range(a.min, a.max, a.xMode === "date"),
		scale: a.scale ?? "linear",
		mode: a.xMode,
		datasets: on.map((d) => d.id),
	};
}

function describeYAxis(a: YAxisConfig, series: readonly SeriesConfig[]) {
	const on = series.filter((s) => s.yAxisId === a.id);
	return {
		slot: yAxisSlot(a.id),
		title: yAxisTitleText(a.title, on),
		...range(a.min, a.max, false),
		scale: a.scale ?? "linear",
		side: a.position,
		series: on.map((s) => s.id),
	};
}

/**
 * Shows the user what the agent just did, with an Undo bound to the history
 * entry `before` was taken ahead of; silent when no entry was recorded.
 */
function announce(before: number | undefined): void {
	const id = latestHistoryId();
	if (id === undefined || id === before) return;
	const label = useGraphHistory.getState().past.at(-1)?.label;
	notify({
		kind: "info",
		message: `AI agent: ${label}`,
		action: { label: "Undo", onAction: () => undoIfLatest(id) },
	});
}

function agentChange(mutate: () => void): void {
	const before = latestHistoryId();
	mutate();
	announce(before);
}

// --- Schemas -----------------------------------------------------------------

const noInput: JsonSchema = {
	type: "object",
	properties: {},
	additionalProperties: false,
};

const datasetRef: JsonSchema = {
	type: "string",
	minLength: 1,
	description:
		"Dataset id from get_workspace (a unique dataset name also works).",
};

const seriesRef: JsonSchema = {
	type: "string",
	minLength: 1,
	description: "Series id from get_workspace (a unique series name also works).",
};

const slot: JsonSchema = { type: "integer", minimum: 1, maximum: 9 };

const bound = (what: string): JsonSchema => ({
	anyOf: [{ type: "number" }, { type: "string", minLength: 1 }],
	description: `${what} A number; on a date axis epoch seconds or a date string such as "2024-03-05T12:00:00Z".`,
});

const FORMULA_CATEGORIES = [
	"math",
	"trig",
	"stat",
	"rolling",
	"row",
	"time",
	"logic",
	"regression",
	"constant",
] as const satisfies readonly FormulaCategory[];

const FORMULA_SYNTAX = [
	"A formula computes one value per row of a dataset.",
	"Reference a column by its exact name in square brackets: [Temperature], [Flow rate].",
	"Operators: + - * / % and ^ (power); comparisons < > <= >= == != give 1 or 0; && and || combine conditions; parentheses group.",
	"Function names are case-insensitive. Constants: pi, e.",
	"Time functions read the dataset's X column (epoch seconds) implicitly.",
	"Regression functions must be the entire formula, e.g. linreg([y]); they fit against the X column.",
	"Time-bucket averages (avgDay, avgHour, ...) produce a new, smaller dataset instead of a column.",
];

// --- Tools -------------------------------------------------------------------

export function createTools(): ModelContextTool[] {
	return [
		defineTool<Record<string, never>>({
			name: "get_workspace",
			title: "Describe the workspace",
			description: `Describes everything loaded in WebGraphy: datasets (id, name, row count, X column, and each column's kind, min and max), plotted series (column, Y axis slot, color, line and point style, visibility), the axes in use (slot, current visible range, scale, title) and what undo/redo would revert. Call this first: other tools take the ids it returns. ${PRIVACY}`,
			inputSchema: noInput,
			readOnly: true,
			untrusted: true,
			run() {
				const s = useGraphStore.getState();
				const { past, future } = useGraphHistory.getState();
				return ok({
					summary: `${describeChart(s)} ${s.datasets.length} dataset(s), ${s.series.length} series.`,
					datasets: s.datasets.map((d) => ({
						id: d.id,
						name: d.name,
						rows: d.rowCount,
						xColumn: d.xAxisColumn,
						xAxis: yAxisSlot(xAxisOf(d)),
						columns: d.columns.map((c, i) => describeColumn(c, d.data[i])),
					})),
					series: s.series.map(describeSeries),
					xAxes: s.xAxes
						.filter((a) => s.datasets.some((d) => xAxisOf(d) === a.id))
						.map((a) => describeXAxis(a, s.datasets)),
					yAxes: s.yAxes
						.filter((a) => s.series.some((x) => x.yAxisId === a.id))
						.map((a) => describeYAxis(a, s.series)),
					freeYAxisSlots: s.yAxes
						.map((a) => yAxisSlot(a.id))
						.filter((n) => !s.series.some((x) => x.yAxisId === `axis-${n}`)),
					undo: past.at(-1)?.label ?? null,
					redo: future.at(-1)?.label ?? null,
					notes: [
						"There are 9 X and 9 Y axis slots; only axes showing data are listed.",
						"Date values are epoch seconds; the *Date fields give the same instant in ISO 8601 (UTC).",
						"Axis min/max is the current visible range, not the data range.",
					],
				});
			},
		}),

		defineTool<{
			dataset: string;
			column: string;
			xMin?: number | string;
			xMax?: number | string;
		}>({
			name: "get_column_statistics",
			title: "Column statistics",
			description: `Computes count, missing values, min, max, mean and sample standard deviation (n - 1) of one dataset column, locally in the browser. Optionally restricted to rows whose X value lies within [xMin, xMax] (either bound may be omitted); such a range must hold at least ${MIN_RANGE_VALUES} values, otherwise only the counts are returned. ${PRIVACY}`,
			inputSchema: {
				type: "object",
				properties: {
					dataset: datasetRef,
					column: { type: "string", minLength: 1, description: "Column name." },
					xMin: bound("Lowest X value to include."),
					xMax: bound("Highest X value to include."),
				},
				required: ["dataset", "column"],
				additionalProperties: false,
			},
			readOnly: true,
			untrusted: true,
			run(input) {
				const ds = findDataset(input.dataset);
				const { name, col } = findColumn(ds, input.column);
				const xCol = ds.data[getColumnIndex(ds, ds.xAxisColumn)];
				const xIsDate = !!xCol && columnKind(xCol) === "date";
				let xRange: { min: number; max: number } | undefined;
				if (input.xMin != null || input.xMax != null) {
					const parse = (v: number | string | undefined, missing: number) => {
						if (v == null) return missing;
						const n = parseAxisValue(String(v), xIsDate);
						if (Number.isNaN(n))
							throw new ToolError(
								`X bounds must be ${xIsDate ? "epoch seconds or a date string" : "numbers"}; got "${v}"`,
							);
						return n;
					};
					xRange = {
						min: parse(input.xMin, -Infinity),
						max: parse(input.xMax, Infinity),
					};
					if (xRange.min > xRange.max)
						throw new ToolError("xMin must not be greater than xMax");
				}
				const st = columnStatistics(col, xCol, xRange);
				const kind = columnKind(col);
				const head = {
					dataset: ds.name,
					column: name,
					kind,
					xColumn: ds.xAxisColumn,
					xRange: xRange ? range(xRange.min, xRange.max, xIsDate) : "all rows",
					rows: st.rows,
					n: st.n,
					missing: st.rows - st.n,
				};
				if (kind === "categorical")
					return ok({
						...head,
						categories: col.categoryLabels?.length ?? 0,
						note: "Numeric statistics do not apply to a categorical column.",
					});
				if (xRange && st.n < MIN_RANGE_VALUES)
					return ok({
						...head,
						note: `Fewer than ${MIN_RANGE_VALUES} values in this X range, so only counts are given: statistics this narrow would reveal individual values. Widen the range.`,
					});
				return ok({
					...head,
					...range(st.min, st.max, kind === "date"),
					mean: num(st.mean),
					...(kind === "date" ? { meanDate: isoDate(st.mean) } : {}),
					std: st.std === null ? null : num(st.std),
				});
			},
		}),

		defineTool<{ category?: FormulaCategory }>({
			name: "list_formula_functions",
			title: "List formula functions",
			description:
				"Lists the functions, operators and syntax available for calculated column formulas (see add_calculated_column), optionally filtered by category.",
			inputSchema: {
				type: "object",
				properties: {
					category: {
						type: "string",
						enum: FORMULA_CATEGORIES,
						description: "Only list functions of this category.",
					},
				},
				additionalProperties: false,
			},
			readOnly: true,
			async run({ category }) {
				// Lazy like the formula editor: the engine stays out of this chunk.
				const { CONSTANTS, FUNCTIONS } = await import(
					"../../utils/formulaFunctions"
				);
				return ok({
					syntax: FORMULA_SYNTAX,
					functions: FUNCTIONS.filter(
						(f) => !category || f.category === category,
					).map((f) => ({
						signature: f.signature,
						description: f.description,
						category: f.category,
						example: f.example,
					})),
					constants: CONSTANTS.map((c) => ({
						name: c.name,
						description: c.description,
					})),
				});
			},
		}),

		defineTool<{ dataset: string; column: string; yAxis?: number | "new" }>({
			name: "plot_column",
			title: "Plot a column",
			description:
				'Plots a dataset column as a new series against the dataset\'s X column. By default it goes on the first free Y axis (or the best-matching one when all nine are taken); pass yAxis 1-9 to share a specific axis, or "new" to require a free one. The axes fit the new data automatically. Undoable.',
			inputSchema: {
				type: "object",
				properties: {
					dataset: datasetRef,
					column: {
						type: "string",
						minLength: 1,
						description: "Column name to plot.",
					},
					yAxis: {
						anyOf: [slot, { type: "string", enum: ["new"] }],
						description: 'Y axis slot 1-9, or "new" for the first unused one.',
					},
				},
				required: ["dataset", "column"],
				additionalProperties: false,
			},
			run(input) {
				const s = useGraphStore.getState();
				const ds = findDataset(input.dataset);
				const { name, col } = findColumn(ds, input.column);
				if (name === ds.xAxisColumn)
					throw new ToolError(
						`"${name}" is the X column of "${ds.name}"; other columns are plotted against it`,
					);
				let yAxisId: string;
				if (input.yAxis === "new") {
					const free = firstFreeYAxisSlot(s.series);
					if (free === null)
						throw new ToolError(
							"All nine Y axes are in use; pass a slot number 1-9 to share one",
						);
					yAxisId = `axis-${free}`;
				} else if (typeof input.yAxis === "number") {
					yAxisId = `axis-${input.yAxis}`;
				} else {
					yAxisId = pickYAxisId(s.series, s.yAxes, col.bounds);
				}
				const existing = s.series.find(
					(x) =>
						x.sourceId === ds.id &&
						x.yColumn === name &&
						(input.yAxis === undefined || x.yAxisId === yAxisId),
				);
				if (existing)
					throw new ToolError(
						`"${name}" is already plotted on Y axis ${yAxisSlot(existing.yAxisId)} as series ${existing.id}; pass another yAxis to plot it again`,
					);
				const series = buildSeriesConfig(
					name,
					ds.id,
					s.series.length,
					!!col.categoryLabels,
					{ yAxisId, pointCount: ds.rowCount },
				);
				agentChange(() => s.addSeries(series));
				return ok({
					message: `Plotted "${name}" from "${ds.name}" on Y axis ${yAxisSlot(yAxisId)}.`,
					series: describeSeries(series),
				});
			},
		}),

		defineTool<{ series: string }>({
			name: "remove_series",
			title: "Remove a series",
			description:
				"Removes a plotted series from the chart. The column and its data stay in the dataset, so it can be plotted again. Undoable.",
			inputSchema: {
				type: "object",
				properties: { series: seriesRef },
				required: ["series"],
				additionalProperties: false,
			},
			run(input) {
				const series = findSeries(input.series);
				agentChange(() => useGraphStore.getState().removeSeries(series.id));
				return ok(`Removed series "${seriesName(series)}".`);
			},
		}),

		defineTool<{
			series: string;
			color?: string;
			lineStyle?: SeriesConfig["lineStyle"];
			pointStyle?: SeriesConfig["pointStyle"];
			visible?: boolean;
		}>({
			name: "set_series_style",
			title: "Style a series",
			description:
				"Changes how a plotted series is drawn: color (line and points), line style, point marker and visibility. Only the properties passed change; line width is fixed and cannot be set. Undoable.",
			inputSchema: {
				type: "object",
				properties: {
					series: seriesRef,
					color: {
						type: "string",
						pattern: "^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$",
						description: 'Hex color such as "#1f77b4".',
					},
					lineStyle: { type: "string", enum: ["solid", "dashed", "dotted", "none"] },
					pointStyle: {
						type: "string",
						enum: ["circle", "square", "cross", "none"],
					},
					visible: { type: "boolean", description: "false hides the series." },
				},
				required: ["series"],
				additionalProperties: false,
			},
			run(input) {
				const series = findSeries(input.series);
				const updates: Partial<SeriesConfig> = {};
				if (input.color) {
					const c = input.color.toLowerCase();
					const hex =
						c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c;
					updates.lineColor = hex;
					updates.pointColor = hex;
				}
				if (input.lineStyle) updates.lineStyle = input.lineStyle;
				if (input.pointStyle) updates.pointStyle = input.pointStyle;
				const restyle = Object.keys(updates).length > 0;
				if (!restyle && input.visible == null)
					throw new ToolError(
						"Pass at least one of color, lineStyle, pointStyle, visible",
					);
				if (
					(input.lineStyle || input.pointStyle) &&
					(updates.lineStyle ?? series.lineStyle) === "none" &&
					(updates.pointStyle ?? series.pointStyle) === "none"
				)
					throw new ToolError(
						'lineStyle and pointStyle cannot both be "none"; use visible: false to hide the series',
					);
				const toggle = input.visible != null && input.visible === !!series.hidden;
				const { updateSeries, updateSeriesVisibility } = useGraphStore.getState();
				const apply = () => {
					if (restyle) updateSeries(series.id, updates);
					if (toggle) updateSeriesVisibility(series.id, !input.visible);
				};
				agentChange(() =>
					restyle && toggle
						? withHistory(`restyle series '${seriesName(series)}'`, apply)
						: apply(),
				);
				const next = useGraphStore
					.getState()
					.series.find((s) => s.id === series.id);
				return ok({
					message: `Updated series "${seriesName(series)}".`,
					series: next && describeSeries(next),
				});
			},
		}),

		defineTool<{
			axis: "x" | "y";
			slot: number;
			scale?: "linear" | "log";
			title?: string;
			min?: number | string;
			max?: number | string;
		}>({
			name: "set_axis",
			title: "Configure an axis",
			description:
				"Changes an axis that shows data: its scale (linear or log, numeric axes only), its title (an empty string restores the default: the X column name, or the joined series names for a Y axis), and its visible range (pass min and max together). Scale and title changes are undoable; a range change is a view change, which Alt+Left steps back through instead.",
			inputSchema: {
				type: "object",
				properties: {
					axis: { type: "string", enum: ["x", "y"] },
					slot: {
						...slot,
						description: "Axis slot 1-9, as listed by get_workspace.",
					},
					scale: { type: "string", enum: ["linear", "log"] },
					title: { type: "string", maxLength: 200, description: "Axis title." },
					min: bound("Lower end of the visible range."),
					max: bound("Upper end of the visible range."),
				},
				required: ["axis", "slot"],
				additionalProperties: false,
			},
			run(input) {
				const s = useGraphStore.getState();
				const id = `axis-${input.slot}`;
				const label = `${input.axis.toUpperCase()} axis ${input.slot}`;
				const axis =
					input.axis === "x"
						? s.xAxes.find((a) => a.id === id)
						: s.yAxes.find((a) => a.id === id);
				const inUse =
					input.axis === "x"
						? s.datasets.some((d) => xAxisOf(d) === id)
						: s.series.some((x) => x.yAxisId === id);
				if (!axis || !inUse)
					throw new ToolError(
						`${label} shows no data; get_workspace lists the axes in use`,
					);
				const xMode = "xMode" in axis ? axis.xMode : "numeric";
				const hasMin = input.min != null;
				const hasMax = input.max != null;
				if (input.scale == null && input.title == null && !hasMin && !hasMax)
					throw new ToolError("Pass at least one of scale, title, or min and max");
				if (input.scale === "log" && xMode !== "numeric")
					throw new ToolError(
						`Log scale needs numeric data; ${label} shows ${xMode} values`,
					);
				if (hasMin !== hasMax) throw new ToolError("Pass min and max together");
				let next: { min: number; max: number } | null = null;
				if (hasMin) {
					const log = (input.scale ?? axis.scale ?? "linear") === "log";
					const r = validateAxisRange(String(input.min), String(input.max), {
						isDate: xMode === "date",
						log,
					});
					if (!r.ok) throw new ToolError(r.error);
					// Checked before anything changes, so a refused call changes nothing.
					if (!runViewportCommand(() => {})) throw new ToolError(NOT_MOUNTED);
					next = { min: r.min, max: r.max };
				}
				const { setAxisScale, updateXAxis, updateYAxis } = s;
				const setTitle = (title: string) =>
					input.axis === "x"
						? updateXAxis(id, { name: title.trim() })
						: updateYAxis(id, {
								title: customYAxisTitle(
									title,
									s.series.filter((x) => x.yAxisId === id),
								),
							});
				const configure = () => {
					if (input.scale) setAxisScale(input.axis, id, input.scale);
					if (input.title != null) setTitle(input.title);
				};
				agentChange(() =>
					input.scale && input.title != null
						? withHistory(`edit ${label}`, configure)
						: configure(),
				);
				const range = next;
				if (range) runViewportCommand((c) => c.applyRange(input.axis, id, range));
				const after = useGraphStore.getState();
				const updated =
					input.axis === "x"
						? describeXAxis(
								after.xAxes.find((a) => a.id === id) as XAxisConfig,
								after.datasets,
							)
						: describeYAxis(
								after.yAxes.find((a) => a.id === id) as YAxisConfig,
								after.series,
							);
				return ok({ message: `Updated ${label}.`, axis: updated });
			},
		}),

		defineTool<Record<string, never>>({
			name: "fit_all",
			title: "Fit all axes",
			description:
				"Zooms every axis in use to fit its data, like the Fit All button. A view change: Alt+Left steps back to the previous view. The view eases into place; read the new ranges with get_workspace afterwards.",
			inputSchema: noInput,
			run() {
				if (useGraphStore.getState().series.length === 0)
					throw new ToolError("Nothing is plotted; plot a column first");
				if (!runViewportCommand((c) => c.fitAll()))
					throw new ToolError(NOT_MOUNTED);
				return ok("Fitting all axes to their data.");
			},
		}),

		defineTool<{ dataset: string; name: string; formula: string }>({
			name: "add_calculated_column",
			title: "Add a calculated column",
			description:
				'Adds a column to a dataset computed from a formula over its other columns, e.g. "[Power] / [Voltage]" or "rolling([Temp], 10)". Call list_formula_functions for the syntax. Formula errors are returned verbatim. The column is not plotted automatically; use plot_column. Computed locally in the browser. Undoable.',
			inputSchema: {
				type: "object",
				properties: {
					dataset: datasetRef,
					name: {
						type: "string",
						minLength: 1,
						maxLength: 200,
						description: "Name of the new column.",
					},
					formula: { type: "string", minLength: 1, maxLength: 2000 },
				},
				required: ["dataset", "name", "formula"],
				additionalProperties: false,
			},
			async run(input) {
				const ds = findDataset(input.dataset);
				const name = input.name.trim();
				if (ds.columns.includes(name))
					throw new ToolError(`Dataset "${ds.name}" already has a column "${name}"`);
				// The store compiles again; this pass adds the error position.
				const { compileFormula, matchRegressionFormula } = await import(
					"../../utils/formula"
				);
				const regression = matchRegressionFormula(input.formula);
				if (regression && "error" in regression)
					throw new ToolError(`Formula error: ${regression.error}`);
				if (regression) {
					findColumn(ds, regression.column);
				} else {
					const { error, errorPos } = compileFormula(input.formula, ds.columns);
					if (error)
						throw new ToolError(
							`Formula error: ${error}${errorPos !== undefined && errorPos >= 0 ? ` (at character ${errorPos})` : ""}`,
						);
				}
				const before = latestHistoryId();
				const knownIds = new Set(
					useGraphStore.getState().datasets.map((d) => d.id),
				);
				const result = await useGraphStore
					.getState()
					.addCalculatedColumn(ds.id, name, input.formula);
				if (!result.success)
					throw new ToolError(result.error ?? "Calculation failed");
				announce(before);
				const after = useGraphStore.getState().datasets;
				const updated = after.find((d) => d.id === ds.id);
				const idx = updated ? updated.columns.indexOf(name) : -1;
				if (updated && idx !== -1)
					return ok({
						message: `Added "${name}" to "${ds.name}". Plot it with plot_column.`,
						column: describeColumn(name, updated.data[idx]),
					});
				const created = after.find((d) => !knownIds.has(d.id));
				return ok({
					message: `The formula aggregates into buckets, so "${name}" became a new dataset. Plot it with plot_column.`,
					dataset: created && {
						id: created.id,
						name: created.name,
						rows: created.rowCount,
					},
				});
			},
		}),

		defineTool<Record<string, never>>({
			name: "undo",
			title: "Undo",
			description:
				"Undoes the most recent change to the workspace (by the user or an agent), like Ctrl+Z. get_workspace reports what it would undo.",
			inputSchema: noInput,
			run() {
				const label = useGraphHistory.getState().past.at(-1)?.label;
				if (!label) return ok("Nothing to undo.");
				useGraphStore.getState().undo();
				notify({ kind: "info", message: `AI agent undid: ${label}` });
				return ok(`Undid "${label}".`);
			},
		}),

		defineTool<Record<string, never>>({
			name: "redo",
			title: "Redo",
			description:
				"Redoes the change most recently undone, like Ctrl+Y. get_workspace reports what it would redo.",
			inputSchema: noInput,
			run() {
				const label = useGraphHistory.getState().future.at(-1)?.label;
				if (!label) return ok("Nothing to redo.");
				useGraphStore.getState().redo();
				notify({ kind: "info", message: `AI agent redid: ${label}` });
				return ok(`Redid "${label}".`);
			},
		}),
	];
}
