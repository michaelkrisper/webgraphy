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
    if (get().isLoaded) saveState(get());
  },

  removeDataset: (id) => {
    set((state) => ({
      datasets: state.datasets.filter(d => d.id !== id),
      series: state.series.filter(s => s.sourceId !== id)
    }));
    if (get().isLoaded) saveState(get());
  },

  addSeries: (series) => {
    set((state) => ({ series: [...state.series, series] }));
    if (get().isLoaded) saveState(get());
  },

  updateSeries: (id, updates) => {
    set((state) => ({
      series: state.series.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
    if (get().isLoaded) saveState(get());
  },

  removeSeries: (id) => {
    set((state) => ({
      series: state.series.filter(s => s.id !== id)
    }));
    if (get().isLoaded) saveState(get());
  },

  updateYAxis: (id, updates) => {
    set((state) => ({
      yAxes: state.yAxes.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
    if (get().isLoaded) saveState(get());
  },

  setAxisTitles: (x, y) => {
    set({ axisTitles: { x, y } });
    if (get().isLoaded) saveState(get());
  },

  setViewportX: (v) => {
    set({ viewportX: v });
    if (get().isLoaded) saveState(get());
  },

  setGlobalXColumn: (col) => {
    set((state) => ({
      globalXColumn: col,
      series: state.series.map(s => ({ ...s, xColumn: col }))
    }));
    if (get().isLoaded) saveState(get());
  },

  setXMode: (mode) => {
    set({ xMode: mode });
    if (get().isLoaded) saveState(get());
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
