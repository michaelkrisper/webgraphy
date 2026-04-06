import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useGraphStore } from '../useGraphStore';
import { Dataset } from '../../services/persistence';

// Mock persistence to avoid IndexedDB and LocalStorage issues during tests
vi.mock('../../services/persistence', () => ({
  persistence: {
    saveDataset: vi.fn(),
    loadDataset: vi.fn(),
    getAllDatasets: vi.fn().mockResolvedValue([]),
    deleteDataset: vi.fn(),
    saveAppState: vi.fn(),
    loadAppState: vi.fn().mockReturnValue(null),
  },
}));

describe('useGraphStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useGraphStore.getState();
    useGraphStore.setState({
      datasets: [],
      series: [],
      xAxes: store.xAxes.map((a, i) => ({ ...a, min: 0, max: 100, showGrid: i === 0 })),
      yAxes: store.yAxes.map((a, i) => ({ ...a, min: 0, max: 100, showGrid: i === 0 })),
      views: [],
      isLoaded: true, // Set to true to avoid loading demo data
    });
  });

  it('should assign unique X-axis IDs to new datasets automatically', () => {
    const ds1: Dataset = {
      id: 'ds-1',
      name: 'Dataset 1',
      columns: ['Time', 'Value'],
      data: [
        { isFloat64: true, refPoint: 0, bounds: { min: 10, max: 20 }, data: new Float32Array([10, 20]) },
        { isFloat64: false, refPoint: 0, bounds: { min: 0, max: 5 }, data: new Float32Array([0, 5]) },
      ],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    };

    const ds2: Dataset = {
      id: 'ds-2',
      name: 'Dataset 2',
      columns: ['Time', 'Value'],
      data: [
        { isFloat64: true, refPoint: 0, bounds: { min: 100, max: 200 }, data: new Float32Array([100, 200]) },
        { isFloat64: false, refPoint: 0, bounds: { min: 0, max: 50 }, data: new Float32Array([0, 50]) },
      ],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    };

    useGraphStore.getState().addDataset(ds1);
    useGraphStore.getState().addDataset(ds2);

    const state = useGraphStore.getState();
    expect(state.datasets[0].xAxisId).toBe('axis-1');
    expect(state.datasets[1].xAxisId).toBe('axis-2');

    // Verify bounds and xMode were updated correctly
    const xAxis1 = state.xAxes.find(a => a.id === 'axis-1');
    const xAxis2 = state.xAxes.find(a => a.id === 'axis-2');

    expect(xAxis1?.min).toBe(10);
    expect(xAxis1?.max).toBe(20);
    expect(xAxis1?.xMode).toBe('date');

    expect(xAxis2?.min).toBe(100);
    expect(xAxis2?.max).toBe(200);
    expect(xAxis2?.xMode).toBe('date');
  });

  it('should fallback to axis-1 if all 9 axes are used', () => {
    const store = useGraphStore.getState();
    const datasets: Dataset[] = Array.from({ length: 9 }, (_, i) => ({
      id: `ds-${i + 1}`,
      name: `Dataset ${i + 1}`,
      columns: ['Time'],
      data: [{ isFloat64: false, refPoint: 0, bounds: { min: 0, max: 100 }, data: new Float32Array([0, 100]) }],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    }));

    datasets.forEach(ds => store.addDataset(ds));

    const ds10: Dataset = {
      id: 'ds-10',
      name: 'Dataset 10',
      columns: ['Time'],
      data: [{ isFloat64: false, refPoint: 0, bounds: { min: 0, max: 100 }, data: new Float32Array([0, 100]) }],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    };
    store.addDataset(ds10);

    const state = useGraphStore.getState();
    expect(state.datasets[9].xAxisId).toBe('axis-1');
  });
});
