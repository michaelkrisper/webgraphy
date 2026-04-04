import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataImport } from '../useDataImport';
import { useGraphStore } from '../../store/useGraphStore';
import { persistence } from '../../services/persistence';
import type { ImportSettings } from '../../types/import';

// Mock the graph store
vi.mock('../../store/useGraphStore', () => ({
  useGraphStore: Object.assign(
    vi.fn(() => ({
      addDataset: vi.fn(),
    })),
    {
      getState: vi.fn(() => ({
        datasets: [],
      })),
    }
  ),
}));

// Mock persistence
vi.mock('../../services/persistence', () => ({
  persistence: {
    saveDataset: vi.fn().mockResolvedValue(undefined),
  },
}));

// Mock URL.createObjectURL since JSDOM might not have it
if (typeof URL.createObjectURL === 'undefined') {
  URL.createObjectURL = vi.fn(() => 'blob:test-url');
}

interface MockWorkerInstance {
  postMessage: ReturnType<typeof vi.fn>;
  terminate: ReturnType<typeof vi.fn>;
  onmessage?: (event: MessageEvent) => void;
}

type MockWorkerConstructor = ReturnType<typeof vi.fn> & { mock: { instances: MockWorkerInstance[] } };

describe('useDataImport hook', () => {
  let originalWorker: typeof Worker;
  const mockAddDataset = vi.fn();
  let MockWorkerCtor: MockWorkerConstructor;

  const getMockWorker = () => MockWorkerCtor.mock.instances[MockWorkerCtor.mock.instances.length - 1] as MockWorkerInstance;

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup store mock
    vi.mocked(useGraphStore).mockImplementation(() => ({
      addDataset: mockAddDataset,
    }));
    vi.mocked(useGraphStore.getState).mockReturnValue({
      datasets: [],
    } as ReturnType<typeof useGraphStore.getState>);

    // Mock Worker
    originalWorker = global.Worker;
    MockWorkerCtor = vi.fn().mockImplementation(function(this: MockWorkerInstance) {
      this.postMessage = vi.fn();
      this.terminate = vi.fn();
    }) as MockWorkerConstructor;
    global.Worker = MockWorkerCtor as unknown as typeof Worker;
  });

  afterEach(() => {
    global.Worker = originalWorker;
  });

  it('should initialize correctly', () => {
    const { result } = renderHook(() => useDataImport());
    expect(result.current.isImporting).toBe(false);
    expect(result.current.error).toBe(null);
    expect(result.current.pendingFile).toBe(null);
  });

  it('should set pending file on initiateImport for json', async () => {
    const { result } = renderHook(() => useDataImport());

    const fileContent = '{"data": [1, 2]}';
    const file = new File([fileContent], 'test.json', { type: 'application/json' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        setTimeout(() => {
          this.onload?.({ target: { result: 'preview data json' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 20));
    });

    expect(result.current.pendingFile).not.toBeNull();
    expect(result.current.pendingFile?.file).toBe(file);
    expect(result.current.pendingFile?.type).toBe('json');
    expect(result.current.pendingFile?.preview).toBe('preview data json');

    global.FileReader = originalFileReader;
  });


  it('should set pending file on initiateImport', async () => {
    const { result } = renderHook(() => useDataImport());

    const fileContent = 'A,B\n1,2';
    const file = new File([fileContent], 'test.csv', { type: 'text/csv' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        setTimeout(() => {
          this.onload?.({ target: { result: 'preview data' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 20));
    });

    expect(result.current.pendingFile).not.toBeNull();
    expect(result.current.pendingFile?.file).toBe(file);
    expect(result.current.pendingFile?.type).toBe('csv');
    expect(result.current.pendingFile?.preview).toBe('preview data');

    global.FileReader = originalFileReader;
  });

  it('should cancel import correctly', () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([''], 'test.csv', { type: 'text/csv' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        this.onload?.({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    expect(result.current.pendingFile).not.toBeNull();

    act(() => {
      result.current.cancelImport();
    });

    expect(result.current.pendingFile).toBeNull();
    global.FileReader = originalFileReader;
  });

  it('should do nothing on confirmImport if no pending file', async () => {
      const { result } = renderHook(() => useDataImport());
      const emptySettings: ImportSettings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [], xAxisColumn: '' };

      act(() => {
          result.current.confirmImport(emptySettings);
      });

      expect(result.current.isImporting).toBe(false);
  });

  it('should process import with worker successfully', async () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([''], 'test.csv', { type: 'text/csv' });
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        this.onload?.({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    expect(result.current.pendingFile).not.toBeNull();

    const settings: ImportSettings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [] };

    act(() => {
      result.current.confirmImport(settings);
    });

    expect(result.current.isImporting).toBe(true);
    expect(global.Worker).toHaveBeenCalled();
    expect(getMockWorker().postMessage).toHaveBeenCalledWith({ file, type: 'csv', settings });

    const mockDataset = {
      id: 'ds-1',
      name: 'test.csv',
      columns: ['Col1'],
      rowCount: 10,
      data: [],
      xAxisColumn: 'Col1',
      xAxisId: 'axis-1'
    };

    await act(async () => {
      await getMockWorker().onmessage?.({
        data: { type: 'success', dataset: mockDataset }
      } as MessageEvent);
    });

    expect(persistence.saveDataset).toHaveBeenCalled();
    expect(mockAddDataset).toHaveBeenCalled();
    expect(mockAddDataset.mock.calls[0][0].name).toBe('A - test.csv');
    expect(mockAddDataset.mock.calls[0][0].columns[0]).toBe('A: Col1');
    expect(result.current.isImporting).toBe(false);
    expect(result.current.pendingFile).toBeNull();
    expect(getMockWorker().terminate).toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it('should handle worker errors', async () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([''], 'test.json', { type: 'application/json' });
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        this.onload?.({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    const settings: ImportSettings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [] };

    act(() => {
      result.current.confirmImport(settings);
    });

    expect(result.current.isImporting).toBe(true);
    expect(result.current.error).toBeNull();

    const errorMessage = 'Failed to parse JSON';

    await act(async () => {
      await getMockWorker().onmessage?.({
        data: { type: 'error', error: errorMessage }
      } as MessageEvent);
    });

    expect(result.current.isImporting).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    expect(getMockWorker().terminate).toHaveBeenCalled();
    expect(persistence.saveDataset).not.toHaveBeenCalled();
    expect(mockAddDataset).not.toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it('should handle non-csv files correctly', async () => {
    const { result } = renderHook(() => useDataImport());

    const fileContent = '{"data": [1, 2]}';
    const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: string } }) => void) | null = null;
      readAsText() {
        setTimeout(() => {
          this.onload?.({ target: { result: 'preview data txt' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    act(() => {
      result.current.importFile(file);
    });

    await act(async () => {
      await new Promise(r => setTimeout(r, 20));
    });

    expect(result.current.pendingFile).not.toBeNull();
    expect(result.current.pendingFile?.file).toBe(file);
    expect(result.current.pendingFile?.type).toBe('json'); // Default fallback
    expect(result.current.pendingFile?.preview).toBe('preview data txt');

    global.FileReader = originalFileReader;
  });
});
