import { create } from "zustand";
import { generateDemoDataset, getDemoAppState } from "../services/demoData";
import {
	type Dataset,
	persistence,
	type SeriesConfig,
	type XAxisConfig,
	type YAxisConfig,
} from "../services/persistence";
import { getColumnIndex } from "../utils/columns";
import { compileFormula, evaluateFormulaSync } from "../utils/formula";

interface GraphState {
	datasets: Dataset[];
	series: SeriesConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	axisTitles: { x: string; y: string };
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
	needsReset: boolean;
	setNeedsReset: (needsReset: boolean) => void;

	// Actions
	addDataset: (dataset: Dataset) => void;
	addCalculatedColumn: (
		datasetId: string,
		name: string,
		formula: string,
	) => Promise<{ success: boolean; error?: string }>;
	removeCalculatedColumn: (datasetId: string, columnName: string) => void;
	updateDataset: (id: string, updates: Partial<Dataset>) => void;
	renameColumn: (datasetId: string, oldName: string, newName: string) => void;
	removeDataset: (id: string) => void;
	moveDataset: (id: string, delta: -1 | 1) => void;

	addSeries: (series: SeriesConfig) => void;
	updateSeries: (id: string, updates: Partial<SeriesConfig>) => void;
	updateSeriesVisibility: (id: string, hidden: boolean) => void;
	removeSeries: (id: string) => void;
	setHighlightedSeries: (id: string | null) => void;
	bulkHideAllSeries: () => void;
	bulkShowAllSeries: () => void;

	updateXAxis: (id: string, updates: Partial<XAxisConfig>) => void;
	updateYAxis: (id: string, updates: Partial<YAxisConfig>) => void;
	batchUpdateAxes: (
		xUpdates: Record<string, { min: number; max: number }>,
		yUpdates: Record<string, { min: number; max: number }>,
	) => void;

	setAxisTitles: (x: string, y: string) => void;

	moveSeries: (id: string, delta: -1 | 1) => void;
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

export const useGraphStore = create<GraphState>((set, get) => ({
	datasets: [],
	series: [],
	xAxes: createInitialXAxes(),
	yAxes: createInitialYAxes(),
	axisTitles: { x: "X-Axis", y: "Y-Axis" },
	isLoaded: false,
	highlightedSeriesId: null,
	needsReset: false,
	setNeedsReset: (needsReset) => set({ needsReset }),
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
			let yColIdx = dataset.columns.indexOf(yColName);
			if (yColIdx === -1)
				yColIdx = dataset.columns.findIndex(
					(c) => c.endsWith(`: ${yColName}`) || c === yColName,
				);
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

		const result = evaluateFormulaSync({
			datasetId,
			name: trimmedName,
			formula,
			columns: dataset.columns,
			rowCount: dataset.rowCount,
			columnData,
		});

		if (result.type === "success") {
			const { newColumn, sparseXColumn } = result;
			if (sparseXColumn && newColumn) {
				// Sparse result (avgDay/avgHour etc.) — create a compact sub-dataset
				const xColName = dataset.xAxisColumn;
				const sparseRowCount = sparseXColumn.data.length;
				const letter = String.fromCharCode(65 + get().datasets.length);
				const sparseDataset: Dataset = {
					id: `${datasetId}-sparse-${trimmedName}-${Date.now()}`,
					name: `${letter} - ${trimmedName}`,
					columns: [
						`${letter}: ${xColName.includes(": ") ? xColName.split(": ")[1] : xColName}`,
						`${letter}: ${trimmedName}`,
					],
					data: [{ ...sparseXColumn }, { ...newColumn, formula }],
					rowCount: sparseRowCount,
					xAxisColumn: `${letter}: ${xColName.includes(": ") ? xColName.split(": ")[1] : xColName}`,
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
			const colIdx = dataset.columns.indexOf(columnName);
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
		set((state) => {
			if (!dataset.xAxisColumn) {
				const potentialX =
					dataset.columns.find(
						(c) =>
							c.toLowerCase().includes("time") ||
							c.toLowerCase().includes("date"),
					) || dataset.columns[0];
				dataset.xAxisColumn = potentialX;
			}

			if (!dataset.xAxisId) {
				const usedXAxisIds = state.datasets.reduce(
					(acc, d) => (d.xAxisId ? acc.add(d.xAxisId) : acc),
					new Set<string>(),
				);
				const unusedAxis =
					state.xAxes.find((a) => !usedXAxisIds.has(a.id)) || state.xAxes[0];
				dataset.xAxisId = unusedAxis.id;
			}

			const xColIdx = getColumnIndex(dataset, dataset.xAxisColumn);
			const col = dataset.data[xColIdx];
			const bounds = col?.bounds || { min: 0, max: 100 };

			let xMode: "date" | "numeric" | "categorical" = "numeric";
			if (col?.categoryLabels) {
				xMode = "categorical";
			} else if (col?.isFloat64) {
				xMode = "date";
			}

			const nextXAxes = state.xAxes.map((a) =>
				a.id === dataset.xAxisId
					? {
							...a,
							min: bounds.min,
							max: bounds.max,
							xMode,
						}
					: a,
			);

			persistence.saveDataset(dataset);

			return {
				datasets: [...state.datasets, dataset],
				xAxes: nextXAxes,
			};
		});
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

					let xMode: "date" | "numeric" | "categorical" = "numeric";
					if (col.categoryLabels) {
						xMode = "categorical";
					} else if (col.isFloat64) {
						xMode = "date";
					}

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
				return {
					datasets: [],
					series: [],
					xAxes: createInitialXAxes(),
					yAxes: createInitialYAxes(),
					axisTitles: { x: "X-Axis", y: "Y-Axis" },
					views: [],
				};
			}
			return { datasets: newDatasets, series: newSeries };
		});
		if (get().isLoaded) debouncedSaveState();
	},

	moveDataset: (id, delta) => {
		set((state) => {
			const idx = state.datasets.findIndex((d) => d.id === id);
			if (idx === -1) return state;
			const targetIdx = idx + delta;
			if (targetIdx < 0 || targetIdx >= state.datasets.length) return state;
			const newDatasets = [...state.datasets];
			const temp = newDatasets[idx];
			newDatasets[idx] = newDatasets[targetIdx];
			newDatasets[targetIdx] = temp;
			return { datasets: newDatasets };
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
				return {
					datasets: [],
					series: [],
					xAxes: createInitialXAxes(),
					yAxes: createInitialYAxes(),
					axisTitles: { x: "X-Axis", y: "Y-Axis" },
					views: [],
				};
			}
			return { series: newSeries };
		});
		if (get().isLoaded) debouncedSaveConfig();
	},

	setHighlightedSeries: (id) => {
		set({ highlightedSeriesId: id });
	},

	bulkHideAllSeries: () => {
		set((state) => ({
			series: state.series.map((s) => ({ ...s, hidden: true })),
		}));
		if (get().isLoaded) debouncedSaveConfig();
	},

	bulkShowAllSeries: () => {
		set((state) => ({
			series: state.series.map((s) => ({ ...s, hidden: false })),
		}));
		if (get().isLoaded) debouncedSaveConfig();
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
			const EPSILON = 1e-10;
			const nextX = state.xAxes.map((a) => {
				const upd = xUpdates[a.id];
				if (
					upd &&
					(Math.abs(upd.min - a.min) > EPSILON ||
						Math.abs(upd.max - a.max) > EPSILON)
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
					(Math.abs(upd.min - a.min) > EPSILON ||
						Math.abs(upd.max - a.max) > EPSILON)
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

	setAxisTitles: (x, y) => {
		set({ axisTitles: { x, y } });
		if (get().isLoaded) debouncedSaveConfig();
	},

	moveSeries: (id, delta) => {
		set((state) => {
			const idx = state.series.findIndex((s) => s.id === id);
			if (idx === -1) return state;
			const targetIdx = idx + delta;
			if (targetIdx < 0 || targetIdx >= state.series.length) return state;
			const newSeries = [...state.series];
			const temp = newSeries[idx];
			newSeries[idx] = newSeries[targetIdx];
			newSeries[targetIdx] = temp;
			return { series: newSeries };
		});
		if (get().isLoaded) debouncedSaveConfig();
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

		// Import demo via normal flow: addDataset (sets xAxis from bounds),
		// then upsert configured yAxes, add series, set titles.
		get().addDataset(demoDataset);

		set((state) => {
			const nextY = state.yAxes.map((a) => {
				const override = demoState.yAxes.find((c) => c.id === a.id);
				return override ? { ...a, ...override } : a;
			});
			return {
				yAxes: nextY,
				series: [...state.series, ...demoState.series],
				axisTitles: demoState.axisTitles,
				isLoaded: true,
			};
		});

		debouncedSaveState();
	},
}));

let viewportTimer: ReturnType<typeof setTimeout> | null = null;
let configTimer: ReturnType<typeof setTimeout> | null = null;

function debouncedSaveViewport() {
	if (viewportTimer) clearTimeout(viewportTimer);
	viewportTimer = setTimeout(() => {
		viewportTimer = null;
		const s = useGraphStore.getState();
		if (!s.isLoaded) return;
		persistence.saveViewport({ xAxes: s.xAxes, yAxes: s.yAxes });
	}, 250);
}

function debouncedSaveConfig() {
	if (configTimer) clearTimeout(configTimer);
	configTimer = setTimeout(() => {
		configTimer = null;
		const s = useGraphStore.getState();
		if (!s.isLoaded) return;
		persistence.saveConfig({
			series: s.series,
			axisTitles: s.axisTitles,
			legendVisible: s.legendVisible,
			crosshairVisible: s.crosshairVisible,
		});
	}, 150);
}

function debouncedSaveState() {
	debouncedSaveViewport();
	debouncedSaveConfig();
}
