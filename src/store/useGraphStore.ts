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
      
      // If current globalX is default or not in the new dataset, try to find a better one
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
    if (get().isLoaded) debouncedSaveState(get());
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
    if (get().isLoaded && (get().datasets.length > 0 || get().series.length > 0)) debouncedSaveState(get());
  },

  addSeries: (series) => {
    set((state) => ({ series: [...state.series, series] }));
    if (get().isLoaded) debouncedSaveState(get());
  },

  updateSeries: (id, updates) => {
    set((state) => ({
      series: state.series.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
    if (get().isLoaded) debouncedSaveState(get());
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
    if (get().isLoaded && (get().datasets.length > 0 || get().series.length > 0)) debouncedSaveState(get());
  },

  updateYAxis: (id, updates) => {
    set((state) => ({
      yAxes: state.yAxes.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
    if (get().isLoaded) debouncedSaveState(get());
  },

  setAxisTitles: (x, y) => {
    set({ axisTitles: { x, y } });
    if (get().isLoaded) debouncedSaveState(get());
  },

  setViewportX: (v) => {
    set({ viewportX: v });
    if (get().isLoaded) debouncedSaveState(get());
  },

  setGlobalXColumn: (col) => {
    set((state) => ({
      globalXColumn: col,
      series: state.series.map(s => ({ ...s, xColumn: col })),
      axisTitles: { ...state.axisTitles, x: col }
    }));
    if (get().isLoaded) debouncedSaveState(get());
  },

  setXMode: (mode) => {
    set({ xMode: mode });
    if (get().isLoaded) debouncedSaveState(get());
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
    if (get().isLoaded) debouncedSaveState(get());
  },

  saveView: (name) => {
    set((state) => {
      const newView: ViewSnapshot = {
        id: crypto.randomUUID(),
        name,
        viewportX: state.viewportX,
        yAxes: state.yAxes.map(a => ({ id: a.id, min: a.min, max: a.max }))
      };
      return { views: [...state.views, newView] };
    });
    if (get().isLoaded) debouncedSaveState(get());
  },

  applyView: (id) => {
    set({ lastAppliedViewId: { id, timestamp: Date.now() } });
  },

  lastAppliedViewId: null,

  deleteView: (id) => {
    set((state) => ({ views: state.views.filter(v => v.id !== id) }));
    if (get().isLoaded) debouncedSaveState(get());
  },

  updateDefaultView: () => {
    let changed = false;
    set((state) => {
      let newViews = [...state.views];
      const idx = newViews.findIndex(v => v.name === 'Default View');
      
      const isSame = idx >= 0 && 
        JSON.stringify(newViews[idx].viewportX) === JSON.stringify(state.viewportX) &&
        JSON.stringify(newViews[idx].yAxes) === JSON.stringify(state.yAxes);
        
      if (isSame) return state; // no changes needed
      
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
      const yAxes = (savedState.yAxes && savedState.yAxes.length === 9) 
        ? savedState.yAxes 
        : createInitialYAxes();
        
      let views = savedState.views || [];
      let defaultView = views.find(v => v.name === 'Default View');
      
      if (!defaultView) {
        defaultView = {
          id: 'default-view',
          name: 'Default View',
          viewportX: savedState.viewportX,
          yAxes: yAxes
        };
        views = [...views, defaultView];
      }
      
      set({ 
        ...savedState, 
        yAxes: defaultView.yAxes, 
        viewportX: defaultView.viewportX,
        datasets: allDatasets, 
        views: views, 
        isLoaded: true 
      });
      debouncedSaveState(useGraphStore.getState());
    } else {
      set({ datasets: allDatasets, isLoaded: true, xMode: 'date' });
    }
  }
}));

let saveTimeout: any = null;
function debouncedSaveState(state: GraphState) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    const curState = useGraphStore.getState();
    if (curState.isLoaded) {
      if (curState.updateDefaultView) {
        curState.updateDefaultView();
      }
      saveState(curState);
    }
    saveTimeout = null;
  }, 1000);
}

function saveState(state: GraphState) {
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
