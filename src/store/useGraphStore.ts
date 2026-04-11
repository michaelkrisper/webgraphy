import { create } from 'zustand';
import { type Dataset, type SeriesConfig, persistence, type AppState, type YAxisConfig, type XAxisConfig, type ViewSnapshot } from '../services/persistence';
import { generateDemoDataset, getDemoAppState } from '../services/demoData';
import { getColumnIndex } from '../utils/columns';

interface GraphState {
  datasets: Dataset[];
  series: SeriesConfig[];
  xAxes: XAxisConfig[];
  yAxes: YAxisConfig[];
  axisTitles: { x: string; y: string };
  views: ViewSnapshot[];
  isLoaded: boolean;
  
  // Actions
  addDataset: (dataset: Dataset) => void;
  updateDataset: (id: string, updates: Partial<Dataset>) => void;
  removeDataset: (id: string) => void;
  moveDataset: (id: string, delta: -1 | 1) => void;

  addSeries: (series: SeriesConfig) => void;
  updateSeries: (id: string, updates: Partial<SeriesConfig>) => void;
  removeSeries: (id: string) => void;
  
  updateXAxis: (id: string, updates: Partial<XAxisConfig>) => void;
  updateYAxis: (id: string, updates: Partial<YAxisConfig>) => void;

  setAxisTitles: (x: string, y: string) => void;
  
  moveSeries: (id: string, delta: -1 | 1) => void;
  saveView: (name: string) => void;
  applyView: (id: string) => void;
  lastAppliedViewId: { id: string, timestamp: number } | null;
  deleteView: (id: string) => void;
  updateViewName: (id: string, name: string) => void;

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

  addDataset: (dataset) => {
    set((state) => {
      if (!dataset.xAxisColumn) {
        const potentialX = dataset.columns.find(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('date')) || dataset.columns[0];
        dataset.xAxisColumn = potentialX;
      }

      // Automatically assign first unused X-axis
      if (!dataset.xAxisId) {
        const usedXAxisIds = new Set(state.datasets.map(d => d.xAxisId));
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
    set((state) => ({
      datasets: state.datasets.map(d => d.id === id ? { ...d, ...updates } : d)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  removeDataset: (id) => {
    set((state) => {
      const newDatasets = state.datasets.filter(d => d.id !== id);
      const newSeries = state.series.filter(s => s.sourceId !== id);
      if (newDatasets.length === 0 && newSeries.length === 0) {
        localStorage.removeItem('webgraphy-state');
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

  removeSeries: (id) => {
    set((state) => {
      const newSeries = state.series.filter(s => s.id !== id);
      if (newSeries.length === 0 && state.datasets.length === 0) {
        localStorage.removeItem('webgraphy-state');
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
      // SECURITY ENHANCEMENT: Input length limit to prevent DoS via large strings
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
    // SECURITY ENHANCEMENT: Input length limit to prevent DoS via large strings
    const finalName = name.trim().slice(0, 100);
    set((state) => ({
      views: state.views.map(v => v.id === id ? { ...v, name: finalName } : v)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  loadPersistedState: async () => {
    const savedState = persistence.loadAppState();
    const allDatasets = await persistence.getAllDatasets();

    if (savedState) {
      if (savedState.series) {
        savedState.series = savedState.series.map(s => ({
          ...s,
          lineWidth: s.lineWidth ?? 1.5
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
      // First time open: Load demo data
      const { loadDemoData } = get();
      await loadDemoData();
    }
  },

  loadDemoData: async () => {
    const demoDataset = generateDemoDataset();
    const demoState = getDemoAppState(demoDataset);

    await persistence.saveDataset(demoDataset);
    // Force immediate save to avoid race conditions with window.location.reload()
    persistence.saveAppState(demoState);

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
