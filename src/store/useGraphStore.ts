import { create } from 'zustand';
import { type Dataset, type SeriesConfig, persistence, type AppState, type YAxisConfig } from '../services/persistence';

interface GraphState {
  datasets: Dataset[];
  series: SeriesConfig[];
  yAxes: YAxisConfig[];
  axisTitles: { x: string; y: string };
  viewportX: { min: number; max: number };
  
  // Actions
  addDataset: (dataset: Dataset) => void;
  removeDataset: (id: string) => void;
  
  addSeries: (series: SeriesConfig) => void;
  updateSeries: (id: string, updates: Partial<SeriesConfig>) => void;
  removeSeries: (id: string) => void;
  
  addYAxis: (axis: YAxisConfig) => void;
  updateYAxis: (id: string, updates: Partial<YAxisConfig>) => void;
  removeYAxis: (id: string) => void;

  setAxisTitles: (x: string, y: string) => void;
  setViewportX: (v: { min: number; max: number }) => void;
  loadPersistedState: () => Promise<void>;
}

const DEFAULT_Y_AXIS: YAxisConfig = {
  id: 'default-y',
  name: 'Default Y',
  min: 0,
  max: 100,
  position: 'left',
  color: '#333',
  showGrid: true
};

export const useGraphStore = create<GraphState>((set, get) => ({
  datasets: [],
  series: [],
  yAxes: [DEFAULT_Y_AXIS],
  axisTitles: { x: 'X-Axis', y: 'Y-Axis' },
  viewportX: { min: 0, max: 100 },

  addDataset: (dataset) => {
    set((state) => ({ datasets: [...state.datasets, dataset] }));
    saveState(get());
  },

  removeDataset: (id) => {
    set((state) => ({
      datasets: state.datasets.filter(d => d.id !== id),
      series: state.series.filter(s => s.sourceId !== id)
    }));
    saveState(get());
  },

  addSeries: (series) => {
    set((state) => ({ series: [...state.series, series] }));
    saveState(get());
  },

  updateSeries: (id, updates) => {
    set((state) => ({
      series: state.series.map(s => s.id === id ? { ...s, ...updates } : s)
    }));
    saveState(get());
  },

  removeSeries: (id) => {
    set((state) => ({
      series: state.series.filter(s => s.id !== id)
    }));
    saveState(get());
  },

  addYAxis: (axis) => {
    set((state) => ({ yAxes: [...state.yAxes, axis] }));
    saveState(get());
  },

  updateYAxis: (id, updates) => {
    set((state) => ({
      yAxes: state.yAxes.map(a => a.id === id ? { ...a, ...updates } : a)
    }));
    saveState(get());
  },

  removeYAxis: (id) => {
    set((state) => ({
      yAxes: state.yAxes.filter(a => a.id !== id),
      series: state.series.map(s => s.yAxisId === id ? { ...s, yAxisId: 'default-y' } : s)
    }));
    saveState(get());
  },

  setAxisTitles: (x, y) => {
    set({ axisTitles: { x, y } });
    saveState(get());
  },

  setViewportX: (v) => {
    set({ viewportX: v });
    saveState(get());
  },

  loadPersistedState: async () => {
    const savedState = persistence.loadAppState();
    const allDatasets = await persistence.getAllDatasets();
    if (savedState) {
      set({ ...savedState, datasets: allDatasets });
    } else {
      set({ datasets: allDatasets });
    }
  }
}));

function saveState(state: GraphState) {
  const appState: AppState = {
    viewportX: state.viewportX,
    yAxes: state.yAxes,
    series: state.series,
    axisTitles: state.axisTitles,
  };
  persistence.saveAppState(appState);
}
