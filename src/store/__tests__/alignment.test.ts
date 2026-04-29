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
    loadAppState: vi.fn().mockResolvedValue(null),
    clearAppState: vi.fn().mockResolvedValue(undefined),
  },
}));

describe('useGraphStore Alignment', () => {
  beforeEach(() => {
    // Reset store state before each test
    const store = useGraphStore.getState();
    useGraphStore.setState({
      datasets: [],
      series: [],
      xAxes: Array.from({ length: 9 }, (_, i) => ({
        id: `axis-${i + 1}`,
        name: `X-Axis ${i + 1}`,
        min: 0,
        max: 100,
        showGrid: i === 0,
        xMode: 'numeric'
      })),
      yAxes: Array.from({ length: 9 }, (_, i) => ({
        id: `axis-${i + 1}`,
        name: `Axis ${i + 1}`,
        min: 0,
        max: 100,
        position: i % 2 === 0 ? 'left' : 'right',
        color: '#475569',
        showGrid: i === 0
      })),
      views: [],
      isLoaded: true,
    });
  });

  it('should allow multiple datasets to share the same xAxisId and update bounds accordingly', () => {
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
        { isFloat64: false, refPoint: 0, bounds: { min: 100, max: 200 }, data: new Float32Array([100, 200]) },
        { isFloat64: false, refPoint: 0, bounds: { min: 0, max: 50 }, data: new Float32Array([0, 50]) },
      ],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    };

    useGraphStore.getState().addDataset(ds1); // Should get axis-1, min: 10, max: 20, xMode: date
    useGraphStore.getState().addDataset(ds2); // Should get axis-2, min: 100, max: 200, xMode: numeric

    const state1 = useGraphStore.getState();
    expect(state1.datasets[0].xAxisId).toBe('axis-1');
    expect(state1.datasets[1].xAxisId).toBe('axis-2');
    expect(state1.xAxes[0].min).toBe(10);
    expect(state1.xAxes[0].xMode).toBe('date');
    expect(state1.xAxes[1].min).toBe(100);
    expect(state1.xAxes[1].xMode).toBe('numeric');

    // Now re-assign ds2 to axis-1
    useGraphStore.getState().updateDataset('ds-2', { xAxisId: 'axis-1' });

    const state2 = useGraphStore.getState();
    expect(state2.datasets[1].xAxisId).toBe('axis-1');
    // axis-1 should now be updated to ds2's bounds and mode because it was the last one assigned/updated
    expect(state2.xAxes[0].min).toBe(100);
    expect(state2.xAxes[0].max).toBe(200);
    expect(state2.xAxes[0].xMode).toBe('numeric');
  });

  it('should update axis when xAxisColumn changes', () => {
    const ds1: Dataset = {
      id: 'ds-1',
      name: 'Dataset 1',
      columns: ['Time', 'NumericCol'],
      data: [
        { isFloat64: true, refPoint: 0, bounds: { min: 10, max: 20 }, data: new Float32Array([10, 20]) },
        { isFloat64: false, refPoint: 0, bounds: { min: 50, max: 60 }, data: new Float32Array([50, 60]) },
      ],
      rowCount: 2,
      xAxisColumn: 'Time',
      xAxisId: '',
    };

    useGraphStore.getState().addDataset(ds1); // axis-1, min: 10, max: 20, xMode: date

    const state1 = useGraphStore.getState();
    expect(state1.xAxes[0].min).toBe(10);
    expect(state1.xAxes[0].xMode).toBe('date');

    // Change X-Axis Column to NumericCol
    useGraphStore.getState().updateDataset('ds-1', { xAxisColumn: 'NumericCol' });

    const state2 = useGraphStore.getState();
    expect(state2.xAxes[0].min).toBe(50);
    expect(state2.xAxes[0].max).toBe(60);
    expect(state2.xAxes[0].xMode).toBe('numeric');
  });
});
