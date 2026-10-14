import { create } from "zustand";
import { generateDemoDataset, getDemoAppState } from "../services/demoData";
import {
	type AppState,
	type DataColumn,
	type Dataset,
	type ParsedDataset,
	persistence,
	type SeriesConfig,
	type XAxisConfig,
	type YAxisConfig,
} from "../services/persistence";
import { AXIS_EPSILON, DEFAULT_X_AXIS_ID } from "../utils/axisCalculations";
import {
	type AxisScale,
	logSafeRange,
	positiveBounds,
} from "../utils/axisScale";
import { getColumnIndex } from "../utils/columns";
import { compileFormula, matchRegressionFormula } from "../utils/formula";
import { logger } from "../utils/logger";
import { evaluateFormulaInWorker } from "../workers/formulaClient";
import { notify } from "./useNotificationStore";
import { createHistory } from "./history";

interface GraphState {
	datasets: Dataset[];
	series: SeriesConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	isLoaded: boolean;
	highlightedSeriesId: string | null;
	legendVisible: boolean;
	setLegendVisible: (visible: boolean) => void;
	crosshairVisible: boolean;
	setCrosshairVisible: (visible: boolean) => void;
	previewColor: { seriesId: string; color: string } | null;
	setPreviewColor: (preview: { seriesId: string; color: string } | null) => void;
	previewStyle: {
		seriesId: string;
		lineStyle?: SeriesConfig["lineStyle"];
		pointStyle?: SeriesConfig["pointStyle"];
	} | null;
	setPreviewStyle: (
		preview: {
			seriesId: string;
			lineStyle?: SeriesConfig["lineStyle"];
			pointStyle?: SeriesConfig["pointStyle"];
		} | null,
	) => void;

	// Actions
	addDataset: (dataset: ParsedDataset & { xAxisId?: string }) => void;
	/**
	 * Computes a calculated column in the worker. With `replaceColumn` it edits
	 * that column instead: the old column stays until the new one is ready and
	 * the swap is a single undo step; a failure leaves state and history alone.
	 */
	addCalculatedColumn: (
		datasetId: string,
		name: string,
		formula: string,
		replaceColumn?: string,
	) => Promise<{ success: boolean; error?: string }>;
	removeCalculatedColumn: (datasetId: string, columnName: string) => void;
	updateDataset: (id: string, updates: Partial<Dataset>) => void;
	renameColumn: (datasetId: string, oldName: string, newName: string) => void;
	removeDataset: (id: string) => void;

	addSeries: (series: SeriesConfig) => void;
	updateSeries: (id: string, updates: Partial<SeriesConfig>) => void;
	updateSeriesVisibility: (id: string, hidden: boolean) => void;
	removeSeries: (id: string) => void;
	setHighlightedSeries: (id: string | null) => void;

	updateXAxis: (id: string, updates: Partial<XAxisConfig>) => void;
	updateYAxis: (id: string, updates: Partial<YAxisConfig>) => void;
	/**
	 * Switch an axis between linear and log. Going log with a range that
	 * reaches 0 or below refits it to the axis' positive data.
	 */
	setAxisScale: (kind: "x" | "y", id: string, scale: AxisScale) => void;
	batchUpdateAxes: (
		xUpdates: Record<string, { min: number; max: number }>,
		yUpdates: Record<string, { min: number; max: number }>,
	) => void;

	reorderSeries: (fromId: string, toIndex: number) => void;

	undo: () => void;
	redo: () => void;
	/** Swaps in a whole workspace (an opened session) as one undoable step. */
	replaceWorkspace: (next: GraphSnapshot, label: string) => void;

	loadPersistedState: () => Promise<void>;
	loadDemoData: () => Promise<void>;
}

const createInitialXAxes = (): XAxisConfig[] => {
	return Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: "",
		min: 0,
		max: 100,
		showGrid: i === 0,
		xMode: "numeric",
		scale: "linear",
	}));
};

const createInitialYAxes = (): YAxisConfig[] => {
	return Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: `Axis ${i + 1}`,
		min: 0,
		max: 100,
		position: i % 2 === 0 ? "left" : "right",
		color: "#475569",
		showGrid: i === 0,
		scale: "linear",
	}));
};

/**
 * Column bounds are {Infinity, -Infinity} for a 0-row or all-NaN column. Such
 * a range must never reach an axis: it renders nothing and fails the Zod
 * viewport schema on reload.
 */
const isFiniteRange = (r?: {
	min: number;
	max: number;
}): r is { min: number; max: number } =>
	!!r && Number.isFinite(r.min) && Number.isFinite(r.max) && r.min <= r.max;

const axisRangeFor = (col?: DataColumn): { min: number; max: number } =>
	col && isFiniteRange(col.bounds) ? col.bounds : { min: 0, max: 100 };

/** Persistence drops invalid axis entries; every fixed slot must still exist. */
const withAllSlots = <T extends { id: string }>(saved: T[], defaults: T[]) => [
	...saved,
	...defaults.filter((d) => !saved.some((a) => a.id === d.id)),
];

const xModeFor = (col?: DataColumn): XAxisConfig["xMode"] =>
	col?.categoryLabels ? "categorical" : col?.isFloat64 ? "date" : "numeric";

/**
 * The x axis refitted to a newly bound column. A log axis keeps log only for
 * numeric data (dates and categories fall back to linear) and is fitted to
 * the column's positive values.
 */
const fitXAxisToColumn = (a: XAxisConfig, col?: DataColumn): XAxisConfig => {
	const bounds = axisRangeFor(col);
	const xMode = xModeFor(col);
	if (a.scale !== "log") return { ...a, ...bounds, xMode };
	if (xMode !== "numeric") return { ...a, ...bounds, xMode, scale: "linear" };
	const positive = col ? positiveBounds(col.data, col.refPoint) : null;
	return { ...a, ...logSafeRange(bounds.min, bounds.max, positive), xMode };
};

/** Positive-value bounds over every column plotted on an axis. */
function positiveAxisBounds(
	state: Pick<GraphState, "datasets" | "series">,
	kind: "x" | "y",
	id: string,
): { min: number; max: number } | null {
	const cols: DataColumn[] = [];
	if (kind === "x") {
		for (const d of state.datasets) {
			if ((d.xAxisId || DEFAULT_X_AXIS_ID) !== id) continue;
			const col = d.data[getColumnIndex(d, d.xAxisColumn)];
			if (col) cols.push(col);
		}
	} else {
		for (const s of state.series) {
			if (s.yAxisId !== id) continue;
			const d = state.datasets.find((ds) => ds.id === s.sourceId);
			const col = d?.data[getColumnIndex(d, s.yColumn)];
			if (col) cols.push(col);
		}
	}
	let min = Infinity;
	let max = -Infinity;
	for (const col of cols) {
		const b = positiveBounds(col.data, col.refPoint);
		if (!b) continue;
		if (b.min < min) min = b.min;
		if (b.max > max) max = b.max;
	}
	return min === Infinity ? null : { min, max };
}

const createEmptyState = () => ({
	datasets: [],
	series: [],
	xAxes: createInitialXAxes(),
	yAxes: createInitialYAxes(),
});

export const useGraphStore = create<GraphState>((set, get) => ({
	datasets: [],
	series: [],
	xAxes: createInitialXAxes(),
	yAxes: createInitialYAxes(),
	isLoaded: false,
	highlightedSeriesId: null,
	legendVisible: true,
	setLegendVisible: (visible) => {
		const before = beginHistory();
		set({ legendVisible: visible });
		commitHistory(before, visible ? "show legend" : "hide legend");
		if (useGraphStore.getState().isLoaded) debouncedSaveConfig();
	},
	crosshairVisible: true,
	setCrosshairVisible: (visible) => {
		const before = beginHistory();
		set({ crosshairVisible: visible });
		commitHistory(before, visible ? "show crosshair" : "hide crosshair");
		if (useGraphStore.getState().isLoaded) debouncedSaveConfig();
	},
	previewColor: null,
	setPreviewColor: (previewColor) => set({ previewColor }),
	previewStyle: null,
	setPreviewStyle: (previewStyle) => set({ previewStyle }),

	addCalculatedColumn: async (datasetId, name, formula, replaceColumn) => {
		const state = get();
		const stored = state.datasets.find((d) => d.id === datasetId);
		if (!stored) return { success: false, error: "Dataset not found" };
		const replaceIdx =
			replaceColumn === undefined ? -1 : stored.columns.indexOf(replaceColumn);
		// The edited column is out of scope for its own formula, exactly as if it
		// had been deleted first.
		const dataset =
			replaceIdx === -1
				? stored
				: {
						...stored,
						columns: stored.columns.filter((_, i) => i !== replaceIdx),
						data: stored.data.filter((_, i) => i !== replaceIdx),
					};

		const trimmedName = name.trim();
		if (!trimmedName)
			return { success: false, error: "Column name cannot be empty" };
		if (dataset.columns.includes(trimmedName)) {
			return {
				success: false,
				error: `Column "${trimmedName}" already exists`,
			};
		}

		// Regressions get the [x, y] columns positionally instead of the
		// compiler's used-column list; the worker uses the same matcher.
		const regression = matchRegressionFormula(formula);
		if (regression && "error" in regression)
			return { success: false, error: regression.error };
		let columnData: { data: Float32Array; refPoint: number }[];

		if (regression) {
			const yColName = regression.column;
			const xColIdx = getColumnIndex(dataset, dataset.xAxisColumn);
			const yColIdx = getColumnIndex(dataset, yColName);
			if (xColIdx === -1 || yColIdx === -1)
				return { success: false, error: `Column not found: ${yColName}` };

			columnData = [
				{
					data: dataset.data[xColIdx].data,
					refPoint: dataset.data[xColIdx].refPoint,
				},
				{
					data: dataset.data[yColIdx].data,
					refPoint: dataset.data[yColIdx].refPoint,
				},
			];
		} else {
			const { usedColumnIndices, error } = compileFormula(
				formula,
				dataset.columns,
			);
			if (error) return { success: false, error };
			columnData = usedColumnIndices.map((idx) => ({
				data: dataset.data[idx].data,
				refPoint: dataset.data[idx].refPoint,
			}));
		}

		let result;
		try {
			result = await evaluateFormulaInWorker({
				datasetId,
				name: trimmedName,
				formula,
				columns: dataset.columns,
				rowCount: dataset.rowCount,
				columnData,
			});
		} catch (err) {
			return {
				success: false,
				error: err instanceof Error ? err.message : String(err),
			};
		}

		if (result.type === "success") {
			// The store may have changed during the worker round-trip: re-read
			// the dataset instead of writing back the stale snapshot, which would
			// resurrect a removed dataset or drop a concurrent edit.
			const current = get().datasets.find((d) => d.id === datasetId);
			if (!current)
				return { success: false, error: "Dataset was removed during calculation" };
			const { newColumn, sparseXColumn } = result;
			const replacing =
				replaceColumn !== undefined && current.columns.includes(replaceColumn);
			const label = replacing
				? `edit calculated column '${trimmedName}'`
				: `add calculated column '${trimmedName}'`;
			if (sparseXColumn && newColumn) {
				// Sparse result (avgDay/avgHour etc.) — create a compact sub-dataset
				const xColName = current.xAxisColumn;
				const sparseRowCount = sparseXColumn.data.length;
				const sparseDataset: Dataset = {
					id: `${datasetId}-sparse-${trimmedName}-${crypto.randomUUID()}`,
					name: trimmedName,
					columns: [xColName, trimmedName],
					data: [{ ...sparseXColumn }, { ...newColumn, formula }],
					rowCount: sparseRowCount,
					xAxisColumn: xColName,
					xAxisId: current.xAxisId,
				};
				// addDataset persists it.
				withHistory(label, () => {
					if (replacing) get().removeCalculatedColumn(datasetId, replaceColumn);
					get().addDataset(sparseDataset);
				});
			} else if (newColumn) {
				let updatedDataset: Dataset | undefined;
				const before = beginHistory();
				set((state) => {
					const ds = state.datasets.find((d) => d.id === datasetId);
					if (!ds) return state;
					const idx = replacing ? ds.columns.indexOf(replaceColumn) : -1;
					if (ds.columns.some((c, i) => c === trimmedName && i !== idx))
						return state;
					const column = { ...newColumn, formula };
					const next: Dataset =
						idx === -1
							? {
									...ds,
									columns: [...ds.columns, trimmedName],
									data: [...ds.data, column],
								}
							: {
									...ds,
									columns: ds.columns.map((c, i) => (i === idx ? trimmedName : c)),
									data: ds.data.map((d, i) => (i === idx ? column : d)),
									xAxisColumn:
										ds.xAxisColumn === replaceColumn ? trimmedName : ds.xAxisColumn,
								};
					updatedDataset = next;
					// Series plotting the edited column follow it.
					const series =
						idx === -1 || replaceColumn === trimmedName
							? state.series
							: state.series.map((s) =>
									s.sourceId === datasetId && s.yColumn === replaceColumn
										? {
												...s,
												yColumn: trimmedName,
												name: s.name === replaceColumn ? trimmedName : s.name,
											}
										: s,
								);
					return {
						datasets: state.datasets.map((d) => (d.id === datasetId ? next : d)),
						series,
					};
				});
				commitHistory(before, label);
				if (!updatedDataset)
					return {
						success: false,
						error: `Column "${trimmedName}" already exists`,
					};
				persistence.saveDataset(updatedDataset);
			}
			if (get().isLoaded) debouncedSaveState();
			return { success: true };
		}

		return {
			success: false,
			error: result.error || "Calculation failed",
		};
	},

	removeCalculatedColumn: (datasetId, columnName) => {
		const before = beginHistory();
		set((state) => {
			const dataset = state.datasets.find((d) => d.id === datasetId);
			if (!dataset) return state;
			const colIdx = getColumnIndex(dataset, columnName);
			if (colIdx === -1) return state;
			const updatedDataset = {
				...dataset,
				columns: dataset.columns.filter((_, i) => i !== colIdx),
				data: dataset.data.filter((_, i) => i !== colIdx),
			};
			persistence.saveDataset(updatedDataset);
			const newSeries = state.series.filter(
				(s) => !(s.sourceId === datasetId && s.yColumn === columnName),
			);
			return {
				datasets: state.datasets.map((d) =>
					d.id === datasetId ? updatedDataset : d,
				),
				series: newSeries,
			};
		});
		commitHistory(before, `delete column '${columnName}'`);
		if (get().isLoaded) debouncedSaveState();
	},

	addDataset: (dataset) => {
		const state = get();

		const xAxisColumn =
			dataset.xAxisColumn ||
			dataset.columns.find(
				(c) => c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
			) ||
			dataset.columns[0];

		let xAxisId = dataset.xAxisId;
		if (!xAxisId) {
			xAxisId =
				state.xAxes.find((a) => !state.datasets.some((d) => d.xAxisId === a.id))
					?.id || state.xAxes[0].id;
		}

		const newDataset: Dataset = { ...dataset, xAxisColumn, xAxisId };

		const xColIdx = getColumnIndex(newDataset, xAxisColumn);
		const col = newDataset.data[xColIdx];

		const before = beginHistory();
		set((s) => ({
			datasets: [...s.datasets, newDataset],
			xAxes: s.xAxes.map((a) => (a.id === xAxisId ? fitXAxisToColumn(a, col) : a)),
		}));
		commitHistory(before, `add dataset '${newDataset.name}'`);

		persistence.saveDataset(newDataset);
		if (get().isLoaded) debouncedSaveState();
	},

	renameColumn: (datasetId, oldName, newName) => {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === oldName) return;
		const before = beginHistory();
		set((state) => {
			const dataset = state.datasets.find((d) => d.id === datasetId);
			if (!dataset) return state;
			if (dataset.columns.includes(trimmed) && trimmed !== oldName) return state;
			const updatedDataset = {
				...dataset,
				columns: dataset.columns.map((c) => (c === oldName ? trimmed : c)),
				xAxisColumn:
					dataset.xAxisColumn === oldName ? trimmed : dataset.xAxisColumn,
			};
			persistence.saveDataset(updatedDataset);
			const updatedSeries = state.series.map((s) =>
				s.sourceId === datasetId && s.yColumn === oldName
					? {
							...s,
							yColumn: trimmed,
							name: s.name === oldName ? trimmed : s.name,
						}
					: s,
			);
			return {
				datasets: state.datasets.map((d) =>
					d.id === datasetId ? updatedDataset : d,
				),
				series: updatedSeries,
			};
		});
		commitHistory(before, `rename column '${oldName}' to '${trimmed}'`);
		if (get().isLoaded) debouncedSaveState();
	},

	updateDataset: (id, updates) => {
		const before = beginHistory();
		set((state) => {
			const dataset = state.datasets.find((d) => d.id === id);
			if (!dataset) return state;

			const updatedDataset = { ...dataset, ...updates };
			const nextDatasets = state.datasets.map((d) =>
				d.id === id ? updatedDataset : d,
			);

			let nextXAxes = state.xAxes;
			if (updates.xAxisId !== undefined || updates.xAxisColumn !== undefined) {
				const xColIdx = getColumnIndex(updatedDataset, updatedDataset.xAxisColumn);
				const col = updatedDataset.data[xColIdx];
				if (col) {
					nextXAxes = state.xAxes.map((a) =>
						a.id === updatedDataset.xAxisId ? fitXAxisToColumn(a, col) : a,
					);
				}
			}

			persistence.saveDataset(updatedDataset);

			return {
				datasets: nextDatasets,
				xAxes: nextXAxes,
			};
		});
		const name = get().datasets.find((d) => d.id === id)?.name ?? id;
		commitHistory(before, `edit dataset '${name}'`);
		if (get().isLoaded) debouncedSaveState();
	},

	removeDataset: (id) => {
		const name = get().datasets.find((d) => d.id === id)?.name ?? id;
		const before = beginHistory();
		persistence.deleteDataset(id);
		set((state) => {
			const newDatasets = state.datasets.filter((d) => d.id !== id);
			const newSeries = state.series.filter((s) => s.sourceId !== id);
			if (newDatasets.length === 0 && newSeries.length === 0) {
				persistence.clearAppState();
				return createEmptyState();
			}
			return { datasets: newDatasets, series: newSeries };
		});
		commitHistory(before, `delete dataset '${name}'`);
		if (get().isLoaded) debouncedSaveState();
	},

	addSeries: (series) => {
		const before = beginHistory();
		set((state) => ({ series: [...state.series, series] }));
		commitHistory(before, `add series '${seriesName(series)}'`);
		if (get().isLoaded) debouncedSaveConfig();
	},

	updateSeries: (id, updates) => {
		const current = get().series.find((s) => s.id === id);
		if (!current || !differs(current, updates)) return;
		const before = beginHistory();
		set((state) => ({
			series: state.series.map((s) => (s.id === id ? { ...s, ...updates } : s)),
		}));
		commitHistory(
			before,
			seriesUpdateLabel(current, updates),
			`series:${id}:${Object.keys(updates).sort().join(",")}`,
		);
		if (get().isLoaded) debouncedSaveConfig();
	},

	updateSeriesVisibility: (id, hidden) => {
		const before = beginHistory();
		set((state) => ({
			series: state.series.map((s) => (s.id === id ? { ...s, hidden } : s)),
		}));
		const current = get().series.find((s) => s.id === id);
		const name = current ? seriesName(current) : id;
		commitHistory(before, `${hidden ? "hide" : "show"} series '${name}'`);
		if (get().isLoaded) debouncedSaveConfig();
	},

	removeSeries: (id) => {
		const removed = get().series.find((s) => s.id === id);
		const before = beginHistory();
		set((state) => {
			const index = state.series.findIndex((s) => s.id === id);
			const newSeries =
				index !== -1 ? state.series.toSpliced(index, 1) : state.series;
			if (newSeries.length === 0 && state.datasets.length === 0) {
				persistence.clearAppState();
				return createEmptyState();
			}
			return { series: newSeries };
		});
		commitHistory(
			before,
			`delete series '${removed ? seriesName(removed) : id}'`,
		);
		if (get().isLoaded) debouncedSaveConfig();
	},

	setHighlightedSeries: (id) => {
		set({ highlightedSeriesId: id });
	},

	updateXAxis: (id, updates) => {
		const current = get().xAxes.find((a) => a.id === id);
		const before =
			current && isConfigEdit(current, updates) ? beginHistory() : null;
		set((state) => ({
			xAxes: state.xAxes.map((a) => (a.id === id ? { ...a, ...updates } : a)),
		}));
		commitHistory(
			before,
			axisUpdateLabel("X", id, updates),
			`x:${id}:${Object.keys(updates).sort().join(",")}`,
		);
		if (get().isLoaded) debouncedSaveViewport();
	},

	updateYAxis: (id, updates) => {
		const current = get().yAxes.find((a) => a.id === id);
		const before =
			current && isConfigEdit(current, updates) ? beginHistory() : null;
		set((state) => ({
			yAxes: state.yAxes.map((a) => (a.id === id ? { ...a, ...updates } : a)),
		}));
		commitHistory(
			before,
			axisUpdateLabel("Y", id, updates),
			`y:${id}:${Object.keys(updates).sort().join(",")}`,
		);
		if (get().isLoaded) debouncedSaveViewport();
	},

	setAxisScale: (kind, id, scale) => {
		const state = get();
		const axis = (kind === "x" ? state.xAxes : state.yAxes).find(
			(a) => a.id === id,
		);
		if (!axis || (axis.scale ?? "linear") === scale) return;
		const updates =
			scale === "log"
				? {
						scale,
						...logSafeRange(axis.min, axis.max, positiveAxisBounds(state, kind, id)),
					}
				: { scale };
		if (kind === "x") get().updateXAxis(id, updates);
		else get().updateYAxis(id, updates);
	},

	batchUpdateAxes: (xUpdates, yUpdates) => {
		set((state) => {
			let changed = false;
			const nextX = state.xAxes.map((a) => {
				const upd = xUpdates[a.id];
				if (
					isFiniteRange(upd) &&
					(a.scale !== "log" || upd.min > 0) &&
					(Math.abs(upd.min - a.min) > AXIS_EPSILON ||
						Math.abs(upd.max - a.max) > AXIS_EPSILON)
				) {
					changed = true;
					return { ...a, ...upd };
				}
				return a;
			});
			const nextY = state.yAxes.map((a) => {
				const upd = yUpdates[a.id];
				if (
					isFiniteRange(upd) &&
					(a.scale !== "log" || upd.min > 0) &&
					(Math.abs(upd.min - a.min) > AXIS_EPSILON ||
						Math.abs(upd.max - a.max) > AXIS_EPSILON)
				) {
					changed = true;
					return { ...a, ...upd };
				}
				return a;
			});

			if (!changed) return state;
			return { xAxes: nextX, yAxes: nextY };
		});
		if (get().isLoaded) debouncedSaveViewport();
	},

	reorderSeries: (fromId, toIndex) => {
		const before = beginHistory();
		set((state) => {
			const fromIndex = state.series.findIndex((s) => s.id === fromId);
			if (fromIndex === -1) return state;
			const newSeries = [...state.series];
			const [item] = newSeries.splice(fromIndex, 1);
			newSeries.splice(toIndex, 0, item);
			return { series: newSeries };
		});
		commitHistory(before, "reorder series");
		if (get().isLoaded) debouncedSaveConfig();
	},

	undo: () => {
		const state = get();
		if (!state.isLoaded) return;
		const entry = graphHistory.undo(snapshotOf(state));
		if (entry) applySnapshot(entry.snapshot);
	},

	redo: () => {
		const state = get();
		if (!state.isLoaded) return;
		const entry = graphHistory.redo(snapshotOf(state));
		if (entry) applySnapshot(entry.snapshot);
	},

	replaceWorkspace: (next, label) => {
		const before = beginHistory();
		applySnapshot(
			{
				...next,
				series: next.series.map((s) => ({ ...s, hidden: s.hidden ?? false })),
				xAxes: withAllSlots(next.xAxes, createInitialXAxes()),
				yAxes: withAllSlots(next.yAxes, createInitialYAxes()),
			},
			false,
		);
		commitHistory(before, label);
	},

	loadPersistedState: async () => {
		let savedState: AppState | null;
		let allDatasets: Dataset[];
		try {
			savedState = await persistence.loadAppState();
			allDatasets = await persistence.getAllDatasets();
		} catch (error) {
			// Storage disabled, private mode or a failed open: run on demo data
			// without persistence, which also keeps whatever is on disk intact.
			logger.error("Failed to load saved data", { error });
			persistence.disable();
			notify({
				kind: "error",
				message:
					"Could not open browser storage — showing demo data. Changes in this session won't be saved.",
			});
			try {
				await get().loadDemoData();
			} catch (demoError) {
				logger.error("Failed to load demo data", { error: demoError });
			} finally {
				if (!get().isLoaded) set({ isLoaded: true });
			}
			return;
		}

		if (savedState) {
			if (savedState.series) {
				savedState.series = savedState.series.map((s) => ({
					...s,
					hidden: s.hidden ?? false,
				}));
			}
			set({
				...savedState,
				xAxes: withAllSlots(savedState.xAxes, createInitialXAxes()),
				yAxes: withAllSlots(savedState.yAxes, createInitialYAxes()),
				datasets: allDatasets,
				isLoaded: true,
			});
			// Don't call debouncedSaveState immediately to avoid overwriting with incomplete data
		} else if (allDatasets.length > 0) {
			set({ datasets: allDatasets, isLoaded: true });
		} else if (localStorage.getItem("webgraphy-cleared")) {
			localStorage.removeItem("webgraphy-cleared");
			set({ isLoaded: true });
		} else {
			const { loadDemoData } = get();
			await loadDemoData();
		}
	},

	loadDemoData: async () => {
		const demoDataset = generateDemoDataset();
		const demoState = getDemoAppState(demoDataset);

		withHistory("load demo data", () => {
			get().addDataset(demoDataset);

			set((state) => {
				const overrides = new Map(demoState.yAxes.map((c) => [c.id, c]));
				return {
					yAxes: state.yAxes.map((a) => {
						const o = overrides.get(a.id);
						return o ? { ...a, ...o } : a;
					}),
					series: [...state.series, ...demoState.series],
					isLoaded: true,
				};
			});
		});

		debouncedSaveState();
	},
}));

// --- Undo/redo -------------------------------------------------------------

/** The user-meaningful slices undo/redo restores. Held by reference, never copied. */
export type GraphSnapshot = Pick<
	GraphState,
	| "datasets"
	| "series"
	| "xAxes"
	| "yAxes"
	| "legendVisible"
	| "crosshairVisible"
>;

const graphHistory = createHistory<GraphSnapshot>();

/** Undo/redo stacks; subscribe for button state and labels. */
export const useGraphHistory = graphHistory.store;

const snapshotOf = (s: GraphSnapshot): GraphSnapshot => ({
	datasets: s.datasets,
	series: s.series,
	xAxes: s.xAxes,
	yAxes: s.yAxes,
	legendVisible: s.legendVisible,
	crosshairVisible: s.crosshairVisible,
});

const sameSnapshot = (a: GraphSnapshot, b: GraphSnapshot) =>
	a.datasets === b.datasets &&
	a.series === b.series &&
	a.xAxes === b.xAxes &&
	a.yAxes === b.yAxes &&
	a.legendVisible === b.legendVisible &&
	a.crosshairVisible === b.crosshairVisible;

let historyDepth = 0;

/**
 * Starts recording one undoable step: returns the state to restore, or null
 * when nothing should be recorded (before the initial load, or inside a
 * {@link withHistory} group, which records the whole group instead).
 */
function beginHistory(): GraphSnapshot | null {
	const state = useGraphStore.getState();
	return historyDepth > 0 || !state.isLoaded ? null : snapshotOf(state);
}

/**
 * Pushes the step begun by {@link beginHistory} unless the mutation left the
 * state untouched. Edits sharing a `coalesceKey` in quick succession (colour
 * drags, typing) merge into one entry.
 */
function commitHistory(
	before: GraphSnapshot | null,
	label: string,
	coalesceKey?: string,
): void {
	if (before && !sameSnapshot(before, useGraphStore.getState())) {
		graphHistory.push(label, before, coalesceKey);
	}
}

/**
 * Runs a synchronous mutation as one undoable step; actions called inside
 * fold into it (an import adding datasets and series undoes as one step).
 */
export function withHistory<T>(label: string, fn: () => T): T {
	const before = beginHistory();
	historyDepth++;
	try {
		return fn();
	} finally {
		historyDepth--;
		commitHistory(before, label);
	}
}

/** Id of the newest undoable entry, e.g. to bind a toast's Undo button to it. */
export function latestHistoryId(): number | undefined {
	return graphHistory.store.getState().past.at(-1)?.id;
}

/**
 * Undoes entry `id` only while it is still the newest one, so a stale toast
 * cannot undo some later, unrelated action. Returns whether it undid.
 */
export function undoIfLatest(id: number): boolean {
	if (latestHistoryId() !== id) return false;
	useGraphStore.getState().undo();
	return true;
}

export function clearHistory(): void {
	graphHistory.clear();
}

const xBinding = (datasets: Dataset[], axisId: string) =>
	datasets
		.filter((d) => (d.xAxisId || DEFAULT_X_AXIS_ID) === axisId)
		.map((d) => `${d.id}\u0000${d.xAxisColumn}`)
		.join("\n");

/**
 * Undo is not a viewport history: an axis keeps its current range unless the
 * data plotted on it changes (e.g. a removed dataset comes back, or the x
 * column is switched back), in which case the snapshot's range is the one
 * that fits that data.
 */
function mergeViewport(cur: GraphSnapshot, target: GraphSnapshot) {
	// A scale switch redefines what the range means, so it restores the
	// snapshot's range too (which is also the one valid for that scale).
	const keep = <
		A extends { id: string; min: number; max: number; scale?: AxisScale },
	>(
		a: A,
		current: A | undefined,
		dataChanged: boolean,
	): A =>
		!current ||
		dataChanged ||
		(current.scale ?? "linear") !== (a.scale ?? "linear") ||
		(current.min === a.min && current.max === a.max)
			? a
			: { ...a, min: current.min, max: current.max };
	return {
		xAxes: target.xAxes.map((a) =>
			keep(
				a,
				cur.xAxes.find((c) => c.id === a.id),
				xBinding(cur.datasets, a.id) !== xBinding(target.datasets, a.id),
			),
		),
		yAxes: target.yAxes.map((a) =>
			keep(
				a,
				cur.yAxes.find((c) => c.id === a.id),
				!cur.series.some((s) => s.yAxisId === a.id),
			),
		),
	};
}

/** `keepViewport`: undo/redo keeps the current ranges where the data allows it. */
function applySnapshot(target: GraphSnapshot, keepViewport = true) {
	const cur = useGraphStore.getState();
	// IndexedDB already reflects `cur`: delete what disappears, re-save every
	// dataset whose object differs (restored, or an older column set).
	const targetIds = new Set(target.datasets.map((d) => d.id));
	for (const d of cur.datasets) {
		if (!targetIds.has(d.id)) persistence.deleteDataset(d.id);
	}
	const curById = new Map(cur.datasets.map((d) => [d.id, d]));
	for (const d of target.datasets) {
		if (curById.get(d.id) !== d) persistence.saveDataset(d);
	}
	useGraphStore.setState({
		datasets: target.datasets,
		series: target.series,
		...(keepViewport
			? mergeViewport(cur, target)
			: { xAxes: target.xAxes, yAxes: target.yAxes }),
		legendVisible: target.legendVisible,
		crosshairVisible: target.crosshairVisible,
		highlightedSeriesId: null,
		previewColor: null,
		previewStyle: null,
	});
	debouncedSaveState();
}

const seriesName = (s: SeriesConfig) => s.name || s.yColumn;

const differs = <T extends object>(current: T, updates: Partial<T>) =>
	(Object.keys(updates) as (keyof T)[]).some((k) => current[k] !== updates[k]);

function seriesUpdateLabel(
	s: SeriesConfig,
	updates: Partial<SeriesConfig>,
): string {
	const name = seriesName(s);
	if ("lineColor" in updates || "pointColor" in updates)
		return `change color of '${name}'`;
	if ("lineStyle" in updates) return `change line style of '${name}'`;
	if ("pointStyle" in updates) return `change point style of '${name}'`;
	if ("yAxisId" in updates)
		return `move '${name}' to Y-axis ${updates.yAxisId?.split("-")[1]}`;
	if ("yColumn" in updates || "sourceId" in updates)
		return `change column of '${name}'`;
	if ("name" in updates) return `rename series '${name}'`;
	return `edit series '${name}'`;
}

/** Range-only updates are viewport changes and stay out of the history. */
const isConfigEdit = <A extends { min: number; max: number }>(
	current: A,
	updates: Partial<A>,
) =>
	(Object.keys(updates) as (keyof A)[]).some(
		(k) => k !== "min" && k !== "max" && current[k] !== updates[k],
	);

function axisUpdateLabel(
	kind: "X" | "Y",
	id: string,
	updates: Partial<XAxisConfig & YAxisConfig>,
): string {
	const axis = `${kind}-axis ${id.split("-")[1]}`;
	if ("name" in updates) return `rename ${axis}`;
	if ("showGrid" in updates)
		return `${updates.showGrid ? "show" : "hide"} ${axis} grid`;
	if ("position" in updates) return `move ${axis} to the ${updates.position}`;
	if ("scale" in updates)
		return `set ${axis} to ${updates.scale === "log" ? "log" : "linear"} scale`;
	return `edit ${axis}`;
}

let viewportTimer: ReturnType<typeof setTimeout> | null = null;
let configTimer: ReturnType<typeof setTimeout> | null = null;

// Schedule low-priority work via requestIdleCallback so persistence writes
// don't compete with a render burst. Falls back to setTimeout in non-Chromium
// browsers and during SSR/tests.
const requestIdle =
	typeof globalThis.requestIdleCallback === "function"
		? globalThis.requestIdleCallback
		: (cb: () => void) => setTimeout(cb, 0);

function debouncedSaveViewport() {
	if (viewportTimer) clearTimeout(viewportTimer);
	viewportTimer = setTimeout(() => {
		viewportTimer = null;
		requestIdle(() => {
			const s = useGraphStore.getState();
			if (!s.isLoaded) return;
			persistence.saveViewport({ xAxes: s.xAxes, yAxes: s.yAxes });
		});
	}, 250);
}

function debouncedSaveConfig() {
	if (configTimer) clearTimeout(configTimer);
	configTimer = setTimeout(() => {
		configTimer = null;
		requestIdle(() => {
			const s = useGraphStore.getState();
			if (!s.isLoaded) return;
			persistence.saveConfig({
				series: s.series,
				legendVisible: s.legendVisible,
				crosshairVisible: s.crosshairVisible,
			});
		});
	}, 150);
}

function debouncedSaveState() {
	debouncedSaveViewport();
	debouncedSaveConfig();
}

/**
 * Writes viewport, config and pending datasets now instead of after their
 * debounce, for callers about to reload the page (e.g. an app update).
 */
export async function flushPendingSaves(): Promise<void> {
	if (viewportTimer) clearTimeout(viewportTimer);
	if (configTimer) clearTimeout(configTimer);
	viewportTimer = null;
	configTimer = null;
	const s = useGraphStore.getState();
	await Promise.all([
		s.isLoaded &&
			persistence.saveAppState({
				xAxes: s.xAxes,
				yAxes: s.yAxes,
				series: s.series,
				legendVisible: s.legendVisible,
				crosshairVisible: s.crosshairVisible,
			}),
		persistence.flushAll(),
	]);
}
