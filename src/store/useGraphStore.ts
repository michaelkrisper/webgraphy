import { create } from 'zustand';
import { type Dataset, type SeriesConfig, persistence, type AppState, type YAxisConfig, type XAxisConfig, type ViewSnapshot } from '../services/persistence';
import { generateDemoDataset, getDemoAppState } from '../services/demoData';
import { getColumnIndex } from '../utils/columns';
import { findInterestingSpots } from '../utils/interesting-spots';
import { compileFormula } from '../utils/formula';

interface GraphState {
  datasets: Dataset[];
  series: SeriesConfig[];
  xAxes: XAxisConfig[];
  yAxes: YAxisConfig[];
  axisTitles: { x: string; y: string };
  views: ViewSnapshot[];
  isLoaded: boolean;
  highlightedSeriesId: string | null;
  legendVisible: boolean;
  setLegendVisible: (visible: boolean) => void;

  // Actions
  addDataset: (dataset: Dataset) => void;
  addCalculatedColumn: (datasetId: string, name: string, formula: string) => Promise<{ success: boolean, error?: string }>;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
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
  batchUpdateAxes: (xUpdates: Record<string, { min: number, max: number }>, yUpdates: Record<string, { min: number, max: number }>) => void;

  setAxisTitles: (x: string, y: string) => void;
  
  moveSeries: (id: string, delta: -1 | 1) => void;
  saveView: (name: string) => void;
  applyView: (id: string) => void;
  lastAppliedViewId: { id: string, timestamp: number } | null;
  deleteView: (id: string) => void;
  updateViewName: (id: string, name: string) => void;

  autoDetectViews: () => void;
  loadPersistedState: () => Promise<void>;
  loadDemoData: () => Promise<void>;
}

const createInitialXAxes = (): XAxisConfig[] => {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `X-Axis ${i + 1}`,
    min: 0,
    max: 100,
    showGrid: i === 0,
    xMode: 'date'
  }));
};

const createInitialYAxes = (): YAxisConfig[] => {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `Axis ${i + 1}`,
    min: 0,
    max: 100,
    position: i % 2 === 0 ? 'left' : 'right',
    color: '#475569',
    showGrid: i === 0
  }));
};

export const useGraphStore = create<GraphState>((set, get) => ({
  datasets: [],
  series: [],
  xAxes: createInitialXAxes(),
  yAxes: createInitialYAxes(),
  axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
  views: [],
  isLoaded: false,
  highlightedSeriesId: null,
  legendVisible: typeof localStorage !== 'undefined' ? localStorage.getItem('legendVisible') === 'true' : true,
  setLegendVisible: (visible) => {
    if (typeof localStorage !== 'undefined') localStorage.setItem('legendVisible', String(visible));
    set({ legendVisible: visible });
  },

  addCalculatedColumn: async (datasetId, name, formula) => {
    const state = get();
    const dataset = state.datasets.find(d => d.id === datasetId);
    if (!dataset) return { success: false, error: 'Dataset not found' };

    const trimmedName = name.trim();
    if (!trimmedName) return { success: false, error: 'Column name cannot be empty' };
    if (dataset.columns.includes(trimmedName)) {
      return { success: false, error: `Column "${trimmedName}" already exists` };
    }

    // Check if this is a regression formula (needs special column handling)
    const regressionMatch = formula.trim().match(/^(?:linreg|polyreg|expreg|logreg|kde)\(\[([^\]]+)\]/i);
    let columnData: { data: Float32Array; refPoint: number }[];

    if (regressionMatch) {
      const yColName = regressionMatch[1];
      const xColIdx = getColumnIndex(dataset, dataset.xAxisColumn);
      let yColIdx = dataset.columns.indexOf(yColName);
      if (yColIdx === -1) yColIdx = dataset.columns.findIndex(c => c.endsWith(`: ${yColName}`) || c === yColName);
      if (xColIdx === -1 || yColIdx === -1) return { success: false, error: `Column not found: ${yColName}` };

      columnData = [
        { data: dataset.data[xColIdx].data, refPoint: dataset.data[xColIdx].refPoint },
        { data: dataset.data[yColIdx].data, refPoint: dataset.data[yColIdx].refPoint },
      ];
    } else {
      const { usedColumnIndices, error } = compileFormula(formula, dataset.columns);
      if (error) return { success: false, error };
      columnData = usedColumnIndices.map(idx => ({
        data: dataset.data[idx].data,
        refPoint: dataset.data[idx].refPoint
      }));
    }

    return new Promise((resolve) => {
      const worker = new Worker(new URL('../workers/formula.worker.ts', import.meta.url), { type: 'module' });

      worker.onmessage = (event) => {
        const { type, newColumn, error: workerError } = event.data;
        if (type === 'success') {
          const updatedDataset = {
            ...dataset,
            columns: [...dataset.columns, trimmedName],
            data: [...dataset.data, newColumn]
          };

          set((state) => ({
            datasets: state.datasets.map(d => d.id === datasetId ? updatedDataset : d)
          }));

          persistence.saveDataset(updatedDataset);
          if (get().isLoaded) debouncedSaveState();

          resolve({ success: true });
        } else {
          resolve({ success: false, error: workerError || 'Worker calculation failed' });
        }
        worker.terminate();
      };

      worker.onerror = (err) => {
        resolve({ success: false, error: err.message });
        worker.terminate();
      };

      worker.postMessage({
        datasetId,
        name: trimmedName,
        formula,
        columns: dataset.columns,
        rowCount: dataset.rowCount,
        columnData,
        xColumnIndex: getColumnIndex(dataset, dataset.xAxisColumn)
      });
    });
  },

  addDataset: (dataset) => {
    set((state) => {
      if (!dataset.xAxisColumn) {
        const potentialX = dataset.columns.find(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('date')) || dataset.columns[0];
        dataset.xAxisColumn = potentialX;
      }

      if (!dataset.xAxisId) {
        const usedXAxisIds = state.datasets.reduce((acc, d) => d.xAxisId ? acc.add(d.xAxisId) : acc, new Set<string>());
        const unusedAxis = state.xAxes.find(a => !usedXAxisIds.has(a.id)) || state.xAxes[0];
        dataset.xAxisId = unusedAxis.id;
      }

      const xColIdx = getColumnIndex(dataset, dataset.xAxisColumn);
      const col = dataset.data[xColIdx];
      const bounds = col?.bounds || { min: 0, max: 100 };
      const isDate = col?.isFloat64 || false;

      const nextXAxes = state.xAxes.map(a =>
        a.id === dataset.xAxisId
          ? { ...a, min: bounds.min, max: bounds.max, xMode: (isDate ? 'date' : 'numeric') as 'date' | 'numeric' }
          : a
      );

      return {
        datasets: [...state.datasets, dataset],
        xAxes: nextXAxes
      };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  updateDataset: (id, updates) => {
    set((state) => {
      const dataset = state.datasets.find(d => d.id === id);
      if (!dataset) return state;

      const updatedDataset = { ...dataset, ...updates };
      const nextDatasets = state.datasets.map(d => d.id === id ? updatedDataset : d);

      let nextXAxes = state.xAxes;
      if (updates.xAxisId !== undefined || updates.xAxisColumn !== undefined) {
        const xColIdx = getColumnIndex(updatedDataset, updatedDataset.xAxisColumn);
        const col = updatedDataset.data[xColIdx];
        if (col) {
          const bounds = col.bounds || { min: 0, max: 100 };
          const isDate = col.isFloat64 || false;

          nextXAxes = state.xAxes.map(a =>
            a.id === updatedDataset.xAxisId
              ? { ...a, min: bounds.min, max: bounds.max, xMode: (isDate ? 'date' : 'numeric') as 'date' | 'numeric' }
              : a
          );
        }
      }

      return {
        datasets: nextDatasets,
        xAxes: nextXAxes
      };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  removeDataset: (id) => {
    persistence.deleteDataset(id);
    set((state) => {
      const newDatasets = state.datasets.filter(d => d.id !== id);
      const newSeries = state.series.filter(s => s.sourceId !== id);
      if (newDatasets.length === 0 && newSeries.length === 0) {
        persistence.clearAppState();
        return {
          datasets: [],
          series: [],
          xAxes: createInitialXAxes(),
          yAxes: createInitialYAxes(),
          axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
          views: []
        };
      }
      return { datasets: newDatasets, series: newSeries };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  moveDataset: (id, delta) => {
    set((state) => {
      const idx = state.datasets.findIndex(d => d.id === id);
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
    if (get().isLoaded) debouncedSaveState();
  },

  updateSeries: (id, updates) => {
    set((state) => ({
      series: state.series.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  updateSeriesVisibility: (id, hidden) => {
    set((state) => ({
      series: state.series.map(s => s.id === id ? { ...s, hidden } : s)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  removeSeries: (id) => {
    set((state) => {
      const newSeries = state.series.filter(s => s.id !== id);
      if (newSeries.length === 0 && state.datasets.length === 0) {
        persistence.clearAppState();
        return {
          datasets: [],
          series: [],
          xAxes: createInitialXAxes(),
          yAxes: createInitialYAxes(),
          axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
          views: []
        };
      }
      return { series: newSeries };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  setHighlightedSeries: (id) => {
    set({ highlightedSeriesId: id });
  },

  bulkHideAllSeries: () => {
    set((state) => ({
      series: state.series.map(s => ({ ...s, hidden: true }))
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  bulkShowAllSeries: () => {
    set((state) => ({
      series: state.series.map(s => ({ ...s, hidden: false }))
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  updateXAxis: (id, updates) => {
    set((state) => ({
      xAxes: state.xAxes.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  updateYAxis: (id, updates) => {
    set((state) => ({
      yAxes: state.yAxes.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  batchUpdateAxes: (xUpdates, yUpdates) => {
    set((state) => ({
      xAxes: state.xAxes.map(a => xUpdates[a.id] ? { ...a, ...xUpdates[a.id] } : a),
      yAxes: state.yAxes.map(a => yUpdates[a.id] ? { ...a, ...yUpdates[a.id] } : a)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  setAxisTitles: (x, y) => {
    set({ axisTitles: { x, y } });
    if (get().isLoaded) debouncedSaveState();
  },

  moveSeries: (id, delta) => {
    set((state) => {
      const idx = state.series.findIndex(s => s.id === id);
      if (idx === -1) return state;
      const targetIdx = idx + delta;
      if (targetIdx < 0 || targetIdx >= state.series.length) return state;
      const newSeries = [...state.series];
      const temp = newSeries[idx];
      newSeries[idx] = newSeries[targetIdx];
      newSeries[targetIdx] = temp;
      return { series: newSeries };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  saveView: (name) => {
    set((state) => {
      let finalName = name.trim().slice(0, 100);
      if (!finalName) {
        const userViews = state.views.filter(v => v.id !== 'default-view');
        finalName = `View ${userViews.length + 1}`;
      }
      const newView: ViewSnapshot = {
        id: crypto.randomUUID(),
        name: finalName,
        xAxes: state.xAxes.map(a => ({ id: a.id, min: a.min, max: a.max })),
        yAxes: state.yAxes.map(a => ({ id: a.id, min: a.min, max: a.max }))
      };
      return { views: [...state.views, newView] };
    });
    if (get().isLoaded) debouncedSaveState();
  },

  applyView: (id) => {
    set({ lastAppliedViewId: { id, timestamp: Date.now() } });
  },

  lastAppliedViewId: null,

  deleteView: (id) => {
    set((state) => ({ views: state.views.filter(v => v.id !== id) }));
    if (get().isLoaded) debouncedSaveState();
  },

  updateViewName: (id, name) => {
    const finalName = name.trim().slice(0, 100);
    set((state) => ({
      views: state.views.map(v => v.id === id ? { ...v, name: finalName } : v)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  autoDetectViews: () => {
    const state = get();
    const newViews = findInterestingSpots(state.datasets, state.series, state.xAxes);
    if (newViews.length === 0) return;
    set((s) => ({ views: [...s.views, ...newViews] }));
    if (get().isLoaded) debouncedSaveState();
  },

  loadPersistedState: async () => {
    const savedState = await persistence.loadAppState();
    const allDatasets = await persistence.getAllDatasets();

    if (savedState) {
      if (savedState.series) {
        savedState.series = savedState.series.map(s => ({
          ...s,
          hidden: s.hidden ?? false,
        }));
      }
      set({ ...savedState, datasets: allDatasets, isLoaded: true });
      debouncedSaveState();
    } else if (allDatasets.length > 0) {
      set({ datasets: allDatasets, isLoaded: true });
    } else if (localStorage.getItem('webgraphy-cleared')) {
      localStorage.removeItem('webgraphy-cleared');
      set({ isLoaded: true });
    } else {
      const { loadDemoData } = get();
      await loadDemoData();
    }
  },

  loadDemoData: async () => {
    const demoDataset = generateDemoDataset();
    const demoState = getDemoAppState(demoDataset);

    await persistence.saveDataset(demoDataset);
    await persistence.saveAppState(demoState);

    set({
      ...demoState,
      datasets: [demoDataset],
      isLoaded: true
    });
  }
}));

let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSaveState() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const curState = useGraphStore.getState();
    if (curState.isLoaded) saveState(curState);
    saveTimeout = null;
  }, 1000);
}

function saveState(state: GraphState) {
  const appState: AppState = {
    xAxes: state.xAxes,
    yAxes: state.yAxes,
    series: state.series,
    axisTitles: state.axisTitles,
    views: state.views
  };
  persistence.saveAppState(appState);
}
