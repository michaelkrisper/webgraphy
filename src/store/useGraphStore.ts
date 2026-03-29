import { create } from 'zustand';
import { type Dataset, type SeriesConfig, persistence, type AppState, type YAxisConfig } from '../services/persistence';

interface GraphState {
  datasets: Dataset[];
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  axisTitles: { x: string; y: string };
  viewportX: { min: number; max: number };
  globalXColumn: string;
  xMode: 'date' | 'numeric';
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
  isLoaded: false,

  addDataset: (dataset) => {
    set((state) => ({ datasets: [...state.datasets, dataset] }));
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
          xMode: 'date'
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
          xMode: 'date'
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
      series: state.series.map(s => ({ ...s, xColumn: col }))
    }));
    if (get().isLoaded) debouncedSaveState(get());
  },

  setXMode: (mode) => {
    set({ xMode: mode });
    if (get().isLoaded) debouncedSaveState(get());
  },

  loadPersistedState: async () => {
    const savedState = persistence.loadAppState();
    const allDatasets = await persistence.getAllDatasets();
    if (savedState) {
      // Merge saved yAxes or fallback to 9 defaults if not matching
      const yAxes = (savedState.yAxes && savedState.yAxes.length === 9) 
        ? savedState.yAxes 
        : createInitialYAxes();
      set({ ...savedState, yAxes, datasets: allDatasets, isLoaded: true });
    } else {
      set({ datasets: allDatasets, isLoaded: true, xMode: 'date' });
    }
  }
}));

let saveTimeout: any = null;
function debouncedSaveState(state: GraphState) {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    saveState(state);
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
    xMode: state.xMode
  };
  persistence.saveAppState(appState);
}
