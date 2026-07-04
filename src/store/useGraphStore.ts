import { create } from "zustand";
import { generateDemoDataset, getDemoAppState } from "../services/demoData";
import {
	type DataColumn,
	type Dataset,
	type ParsedDataset,
	persistence,
	type SeriesConfig,
	type XAxisConfig,
	type YAxisConfig,
} from "../services/persistence";
import { AXIS_EPSILON } from "../utils/axisCalculations";
import { getColumnIndex } from "../utils/columns";
import { compileFormula } from "../utils/formula";
import { evaluateFormulaInWorker } from "../workers/formulaClient";

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
	setPreviewColor: (
		preview: { seriesId: string; color: string } | null,
	) => void;
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
	addCalculatedColumn: (
		datasetId: string,
		name: string,
		formula: string,
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
	batchUpdateAxes: (
		xUpdates: Record<string, { min: number; max: number }>,
		yUpdates: Record<string, { min: number; max: number }>,
	) => void;

	reorderSeries: (fromId: string, toIndex: number) => void;

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
	}));
};

const xModeFor = (col?: DataColumn): XAxisConfig["xMode"] =>
	col?.categoryLabels ? "categorical" : col?.isFloat64 ? "date" : "numeric";

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
		set({ legendVisible: visible });
		if (useGraphStore.getState().isLoaded) debouncedSaveConfig();
	},
	crosshairVisible: true,
	setCrosshairVisible: (visible) => {
		set({ crosshairVisible: visible });
		if (useGraphStore.getState().isLoaded) debouncedSaveConfig();
	},
	previewColor: null,
	setPreviewColor: (previewColor) => set({ previewColor }),
	previewStyle: null,
	setPreviewStyle: (previewStyle) => set({ previewStyle }),

	addCalculatedColumn: async (datasetId, name, formula) => {
		const state = get();
		const dataset = state.datasets.find((d) => d.id === datasetId);
		if (!dataset) return { success: false, error: "Dataset not found" };

		const trimmedName = name.trim();
		if (!trimmedName)
			return { success: false, error: "Column name cannot be empty" };
		if (dataset.columns.includes(trimmedName)) {
			return {
				success: false,
				error: `Column "${trimmedName}" already exists`,
			};
		}

		// Check if this is a regression formula (needs special column handling)
		const regressionMatch = formula
			.trim()
			.match(/^(?:linreg|polyreg|expreg|logreg|kde)\(\[([^\]]+)\]/i);
		let columnData: { data: Float32Array; refPoint: number }[];

		if (regressionMatch) {
			const yColName = regressionMatch[1];
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
			const { newColumn, sparseXColumn } = result;
			if (sparseXColumn && newColumn) {
				// Sparse result (avgDay/avgHour etc.) — create a compact sub-dataset
				const xColName = dataset.xAxisColumn;
				const sparseRowCount = sparseXColumn.data.length;
				const sparseDataset: Dataset = {
					id: `${datasetId}-sparse-${trimmedName}-${crypto.randomUUID()}`,
					name: trimmedName,
					columns: [xColName, trimmedName],
					data: [{ ...sparseXColumn }, { ...newColumn, formula }],
					rowCount: sparseRowCount,
					xAxisColumn: xColName,
					xAxisId: dataset.xAxisId,
				};
				get().addDataset(sparseDataset);
				persistence.saveDataset(sparseDataset);
			} else if (newColumn) {
				const updatedDataset = {
					...dataset,
					columns: [...dataset.columns, trimmedName],
					data: [...dataset.data, { ...newColumn, formula }],
				};
				set((state) => ({
					datasets: state.datasets.map((d) =>
						d.id === datasetId ? updatedDataset : d,
					),
				}));
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
		if (get().isLoaded) debouncedSaveState();
	},

	addDataset: (dataset) => {
		const state = get();

		const xAxisColumn =
			dataset.xAxisColumn ||
			dataset.columns.find(
				(c) =>
					c.toLowerCase().includes("time") ||
					c.toLowerCase().includes("date"),
			) ||
			dataset.columns[0];

		let xAxisId = dataset.xAxisId;
		if (!xAxisId) {
			xAxisId =
				state.xAxes.find(
					(a) => !state.datasets.some((d) => d.xAxisId === a.id),
				)?.id || state.xAxes[0].id;
		}

		const newDataset: Dataset = { ...dataset, xAxisColumn, xAxisId };

		const xColIdx = getColumnIndex(newDataset, xAxisColumn);
		const col = newDataset.data[xColIdx];
		const bounds = col?.bounds || { min: 0, max: 100 };
		const xMode = xModeFor(col);

		set((s) => ({
			datasets: [...s.datasets, newDataset],
			xAxes: s.xAxes.map((a) =>
				a.id === xAxisId
					? { ...a, min: bounds.min, max: bounds.max, xMode }
					: a,
			),
		}));

		persistence.saveDataset(newDataset);
		if (get().isLoaded) debouncedSaveState();
	},

	renameColumn: (datasetId, oldName, newName) => {
		const trimmed = newName.trim();
		if (!trimmed || trimmed === oldName) return;
		set((state) => {
			const dataset = state.datasets.find((d) => d.id === datasetId);
			if (!dataset) return state;
			if (dataset.columns.includes(trimmed) && trimmed !== oldName)
				return state;
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
		if (get().isLoaded) debouncedSaveState();
	},

	updateDataset: (id, updates) => {
		set((state) => {
			const dataset = state.datasets.find((d) => d.id === id);
			if (!dataset) return state;

			const updatedDataset = { ...dataset, ...updates };
			const nextDatasets = state.datasets.map((d) =>
				d.id === id ? updatedDataset : d,
			);

			let nextXAxes = state.xAxes;
			if (updates.xAxisId !== undefined || updates.xAxisColumn !== undefined) {
				const xColIdx = getColumnIndex(
					updatedDataset,
					updatedDataset.xAxisColumn,
				);
				const col = updatedDataset.data[xColIdx];
				if (col) {
					const bounds = col.bounds || { min: 0, max: 100 };
					const xMode = xModeFor(col);

					nextXAxes = state.xAxes.map((a) =>
						a.id === updatedDataset.xAxisId
							? {
									...a,
									min: bounds.min,
									max: bounds.max,
									xMode,
								}
							: a,
					);
				}
			}

			persistence.saveDataset(updatedDataset);

			return {
				datasets: nextDatasets,
				xAxes: nextXAxes,
			};
		});
		if (get().isLoaded) debouncedSaveState();
	},

	removeDataset: (id) => {
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
		if (get().isLoaded) debouncedSaveState();
	},

	addSeries: (series) => {
		set((state) => ({ series: [...state.series, series] }));
		if (get().isLoaded) debouncedSaveConfig();
	},

	updateSeries: (id, updates) => {
		set((state) => ({
			series: state.series.map((s) => (s.id === id ? { ...s, ...updates } : s)),
		}));
		if (get().isLoaded) debouncedSaveConfig();
	},

	updateSeriesVisibility: (id, hidden) => {
		set((state) => ({
			series: state.series.map((s) => (s.id === id ? { ...s, hidden } : s)),
		}));
		if (get().isLoaded) debouncedSaveConfig();
	},

	removeSeries: (id) => {
		set((state) => {
			const newSeries = state.series.filter((s) => s.id !== id);
			if (newSeries.length === 0 && state.datasets.length === 0) {
				persistence.clearAppState();
				return createEmptyState();
			}
			return { series: newSeries };
		});
		if (get().isLoaded) debouncedSaveConfig();
	},

	setHighlightedSeries: (id) => {
		set({ highlightedSeriesId: id });
	},

	updateXAxis: (id, updates) => {
		set((state) => ({
			xAxes: state.xAxes.map((a) => (a.id === id ? { ...a, ...updates } : a)),
		}));
		if (get().isLoaded) debouncedSaveViewport();
	},

	updateYAxis: (id, updates) => {
		set((state) => ({
			yAxes: state.yAxes.map((a) => (a.id === id ? { ...a, ...updates } : a)),
		}));
		if (get().isLoaded) debouncedSaveViewport();
	},

	batchUpdateAxes: (xUpdates, yUpdates) => {
		set((state) => {
			let changed = false;
			const nextX = state.xAxes.map((a) => {
				const upd = xUpdates[a.id];
				if (
					upd &&
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
					upd &&
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
		set((state) => {
			const fromIndex = state.series.findIndex((s) => s.id === fromId);
			if (fromIndex === -1) return state;
			const newSeries = [...state.series];
			const [item] = newSeries.splice(fromIndex, 1);
			newSeries.splice(toIndex, 0, item);
			return { series: newSeries };
		});
		if (get().isLoaded) debouncedSaveConfig();
	},

	loadPersistedState: async () => {
		const savedState = await persistence.loadAppState();
		const allDatasets = await persistence.getAllDatasets();

		if (savedState) {
			if (savedState.series) {
				savedState.series = savedState.series.map((s) => ({
					...s,
					hidden: s.hidden ?? false,
				}));
			}
			set({ ...savedState, datasets: allDatasets, isLoaded: true });
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

		debouncedSaveState();
	},
}));

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
