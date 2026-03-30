import { create } from 'zustand';
import { type Dataset, type SeriesConfig, persistence, type AppState, type YAxisConfig, type ViewSnapshot } from '../services/persistence';

interface GraphState {
  datasets: Dataset[];
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  axisTitles: { x: string; y: string };
  viewportX: { min: number; max: number };
  globalXColumn: string;
  xMode: 'date' | 'numeric';
  views: ViewSnapshot[];
  isLoaded: boolean;
  
  // Actions
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  
  addSeries: (series: SeriesConfig) => void;
  updateSeries: (id: string, updates: Partial<SeriesConfig>) => void;
  removeSeries: (id: string) => void;
  
  updateYAxis: (id: string, updates: Partial<YAxisConfig>) => void;

  setAxisTitles: (x: string, y: string) => void;
  setViewportX: (v: { min: number; max: number }) => void;
  setGlobalXColumn: (col: string) => void;
  setXMode: (mode: 'date' | 'numeric') => void;
  
  moveSeries: (id: string, delta: -1 | 1) => void;
  saveView: (name: string) => void;
  applyView: (id: string) => void;
  lastAppliedViewId: { id: string, timestamp: number } | null;
  deleteView: (id: string) => void;
  updateViewName: (id: string, name: string) => void;
  updateDefaultView: () => void;

  loadPersistedState: () => Promise<void>;
}

const createInitialYAxes = (): YAxisConfig[] => {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `Axis ${i + 1}`,
    min: 0,
    max: 100,
    position: i % 2 === 0 ? 'left' : 'right',
    color: '#333',
    showGrid: i === 0
  }));
};

export const useGraphStore = create<GraphState>((set, get) => ({
  datasets: [],
  series: [],
  yAxes: createInitialYAxes(),
  axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
  viewportX: { min: 0, max: 100 },
  globalXColumn: 'Timestamp',
  xMode: 'date',
  views: [],
  isLoaded: false,

  addDataset: (dataset) => {
    set((state) => {
      const newDatasets = [...state.datasets, dataset];
      let newGlobalX = state.globalXColumn;
      const currentXInNew = dataset.columns.find(c => c === newGlobalX || c.endsWith(`: ${newGlobalX}`));
      if (!currentXInNew) {
        const potentialX = dataset.columns.find(c => c.toLowerCase().includes('time') || c.toLowerCase().includes('date')) || dataset.columns[0];
        if (potentialX) newGlobalX = potentialX;
      }
      const isFirst = state.datasets.length === 0;
      return { 
        datasets: newDatasets, 
        globalXColumn: newGlobalX,
        axisTitles: isFirst || newGlobalX !== state.globalXColumn ? { ...state.axisTitles, x: newGlobalX } : state.axisTitles
      };
    });
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
          yAxes: createInitialYAxes(),
          axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
          viewportX: { min: 0, max: 100 },
          globalXColumn: 'Timestamp',
          xMode: 'date',
          views: []
        };
      }
      return { datasets: newDatasets, series: newSeries };
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
          series: [],
          yAxes: createInitialYAxes(),
          axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
          viewportX: { min: 0, max: 100 },
          globalXColumn: 'Timestamp',
          xMode: 'date',
          views: []
        };
      }
      return { series: newSeries };
    });
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

  setViewportX: (v) => {
    set({ viewportX: v });
    if (get().isLoaded) debouncedSaveState();
  },

  setGlobalXColumn: (col) => {
    set((state) => ({
      globalXColumn: col,
      series: state.series.map(s => ({ ...s, xColumn: col })),
      axisTitles: { ...state.axisTitles, x: col }
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  setXMode: (mode) => {
    set({ xMode: mode });
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
      let finalName = name.trim();
      if (!finalName) {
        const userViews = state.views.filter(v => v.id !== 'default-view');
        finalName = `View ${userViews.length + 1}`;
      }
      const newView: ViewSnapshot = {
        id: crypto.randomUUID(),
        name: finalName,
        viewportX: state.viewportX,
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
    set((state) => ({
      views: state.views.map(v => v.id === id ? { ...v, name } : v)
    }));
    if (get().isLoaded) debouncedSaveState();
  },

  updateDefaultView: () => {
    let changed = false;
    set((state) => {
      let newViews = [...state.views];
      const idx = newViews.findIndex(v => v.name === 'Default View');
      const isSame = idx >= 0 && 
        JSON.stringify(newViews[idx].viewportX) === JSON.stringify(state.viewportX) &&
        JSON.stringify(newViews[idx].yAxes) === JSON.stringify(state.yAxes);
      if (isSame) return state;
      changed = true;
      const updatedView = {
        id: idx >= 0 ? newViews[idx].id : 'default-view',
        name: 'Default View',
        viewportX: state.viewportX,
        yAxes: state.yAxes.map(a => ({ id: a.id, min: a.min, max: a.max }))
      };
      if (idx >= 0) newViews[idx] = updatedView;
      else newViews.push(updatedView);
      return { views: newViews };
    });
    if (changed) saveState(useGraphStore.getState());
  },

  loadPersistedState: async () => {
    const savedState = persistence.loadAppState();
    const allDatasets = await persistence.getAllDatasets();
    if (savedState) {
      const views = savedState.views || [];
      const defaultView = views.find(v => v.name === 'Default View');
      if (defaultView) {
        const loadedYAxes = createInitialYAxes().map(axis => {
          const viewAxis = defaultView!.yAxes.find(va => va.id === axis.id);
          return viewAxis ? { ...axis, min: viewAxis.min, max: viewAxis.max } : axis;
        });
        set({
          viewportX: defaultView.viewportX,
          yAxes: loadedYAxes,
          series: savedState.series || [],
          axisTitles: savedState.axisTitles || { x: 'X-Axis', y: 'Y-Axis' },
          globalXColumn: savedState.globalXColumn || 'Timestamp',
          views: views,
          isLoaded: true,
          xMode: savedState.xMode || 'date',
          datasets: allDatasets
        });
      } else {
        set({ ...savedState, datasets: allDatasets, isLoaded: true });
      }
      debouncedSaveState();
    } else {
      set({ datasets: allDatasets, isLoaded: true, xMode: 'date' });
    }
  }
}));

let saveTimeout: any = null;
function debouncedSaveState() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const curState = useGraphStore.getState();
    if (curState.isLoaded) {
      if (curState.updateDefaultView) curState.updateDefaultView();
      saveState(curState);
    }
    saveTimeout = null;
  }, 1000);
}

function saveState(state: any) {
  const appState: AppState = {
    viewportX: state.viewportX,
    yAxes: state.yAxes,
    series: state.series,
    axisTitles: state.axisTitles,
    globalXColumn: state.globalXColumn,
    xMode: state.xMode,
    views: state.views
  };
  persistence.saveAppState(appState);
}
