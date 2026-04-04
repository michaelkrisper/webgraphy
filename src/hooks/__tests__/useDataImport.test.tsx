import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDataImport } from '../useDataImport';
import { useGraphStore } from '../../store/useGraphStore';
import { persistence } from '../../services/persistence';

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

// Global variable to keep track of the mock worker instance
let mockWorkerInstance: any = null;

describe('useDataImport hook', () => {
  let originalWorker: typeof Worker;
  const mockAddDataset = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Setup store mock
    (useGraphStore as any).mockImplementation(() => ({
      addDataset: mockAddDataset,
    }));
    (useGraphStore.getState as any).mockReturnValue({
      datasets: [],
    });

    // Mock Worker
    originalWorker = global.Worker;
    const MockWorker = vi.fn().mockImplementation(function(this: any) {
      this.postMessage = vi.fn();
      this.terminate = vi.fn();
      mockWorkerInstance = this;
      return this;
    });
    global.Worker = MockWorker as any;
  });

  afterEach(() => {
    global.Worker = originalWorker;
    mockWorkerInstance = null;
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
      onload: any;
      readAsText(blob: Blob) {
        setTimeout(() => {
          this.onload({ target: { result: 'preview data json' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as any;

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

    // Create a mock file
    const fileContent = 'A,B\n1,2';
    const file = new File([fileContent], 'test.csv', { type: 'text/csv' });

    // Override readAsText directly since FileReader in JSDOM handles slices fine
    // but just to make it fast and synchronous in act
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText(blob: Blob) {
        setTimeout(() => {
          this.onload({ target: { result: 'preview data' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as any;

    act(() => {
      result.current.importFile(file);
    });

    // Wait for the mock reader to finish
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

    // Directly inject a pending file state using act by forcing a re-render or mocking initial state isn't easy here,
    // so let's call the actual hook method but mock the file reader synchronous
    const file = new File([''], 'test.csv', { type: 'text/csv' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText() {
        this.onload({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as any;

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

      act(() => {
          result.current.confirmImport({} as any);
      });

      expect(result.current.isImporting).toBe(false);
  });

  it('should process import with worker successfully', async () => {
    const { result } = renderHook(() => useDataImport());

    // Setup pending file
    const file = new File([''], 'test.csv', { type: 'text/csv' });
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText() {
        this.onload({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as any;

    act(() => {
      result.current.importFile(file);
    });

    expect(result.current.pendingFile).not.toBeNull();

    // Call confirmImport
    const settings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [] };

    act(() => {
      result.current.confirmImport(settings as any);
    });

    expect(result.current.isImporting).toBe(true);
    expect(global.Worker).toHaveBeenCalled();
    expect(mockWorkerInstance.postMessage).toHaveBeenCalledWith({
      file,
      type: 'csv',
      settings
    });

    // Simulate worker success message
    const mockDataset = {
      id: 'ds-1',
      name: 'test.csv',
      columns: ['Col1'],
      rowCount: 10,
      data: []
    };

    await act(async () => {
      await mockWorkerInstance.onmessage({
        data: {
          type: 'success',
          dataset: mockDataset
        }
      } as MessageEvent);
    });

    expect(persistence.saveDataset).toHaveBeenCalled();
    expect(mockAddDataset).toHaveBeenCalled();
    expect(mockAddDataset.mock.calls[0][0].name).toBe('A - test.csv');
    expect(mockAddDataset.mock.calls[0][0].columns[0]).toBe('A: Col1');
    expect(result.current.isImporting).toBe(false);
    expect(result.current.pendingFile).toBeNull();
    expect(mockWorkerInstance.terminate).toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });

  it('should handle worker errors', async () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([''], 'test.json', { type: 'application/json' });
    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText() {
        this.onload({ target: { result: 'data' } });
      }
    }
    global.FileReader = MockFileReader as any;

    act(() => {
      result.current.importFile(file);
    });

    const settings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [] };

    act(() => {
      result.current.confirmImport(settings as any);
    });

    expect(result.current.isImporting).toBe(true);
    expect(result.current.error).toBeNull();

    // Simulate worker error message
    const errorMessage = 'Failed to parse JSON';

    await act(async () => {
      await mockWorkerInstance.onmessage({
        data: {
          type: 'error',
          error: errorMessage
        }
      } as MessageEvent);
    });

    expect(result.current.isImporting).toBe(false);
    expect(result.current.error).toBe(errorMessage);
    expect(mockWorkerInstance.terminate).toHaveBeenCalled();
    expect(persistence.saveDataset).not.toHaveBeenCalled();
    expect(mockAddDataset).not.toHaveBeenCalled();

    global.FileReader = originalFileReader;
  });
});

  it('should handle non-csv files correctly', async () => {
    const { result } = renderHook(() => useDataImport());

    const fileContent = '{"data": [1, 2]}';
    const file = new File([fileContent], 'test.txt', { type: 'text/plain' });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: any;
      readAsText(blob: Blob) {
        setTimeout(() => {
          this.onload({ target: { result: 'preview data txt' } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as any;

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
