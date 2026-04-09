import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dataset, AppState } from '../persistence';

vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

describe('persistence', () => {
  let persistence: typeof import('../persistence').persistence;
  let openDBMock: ReturnType<typeof vi.fn>;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Dynamically import idb mock and persistence module
    const idbMock = await import('idb');
    openDBMock = vi.mocked(idbMock.openDB);

    const persistenceModule = await import('../persistence');
    persistence = persistenceModule.persistence;
  });

  describe('success path', () => {
    it('should initialize and upgrade db correctly', async () => {
        const mockDb = {
            objectStoreNames: {
                contains: vi.fn().mockReturnValue(false)
            },
            createObjectStore: vi.fn(),
            getAll: vi.fn().mockResolvedValue([])
        };

        openDBMock.mockImplementationOnce((name: string, version: number, options: { upgrade: (db: unknown) => void }) => {
            options.upgrade(mockDb);
            return Promise.resolve(mockDb);
        });

        // Trigger getDB
        await persistence.getAllDatasets();

        expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith('datasets');
        expect(mockDb.createObjectStore).toHaveBeenCalledWith('datasets', { keyPath: 'id' });
    });

    it('should not upgrade db if store exists', async () => {
        const mockDb = {
            objectStoreNames: {
                contains: vi.fn().mockReturnValue(true)
            },
            createObjectStore: vi.fn(),
            getAll: vi.fn().mockResolvedValue([])
        };

        openDBMock.mockImplementationOnce((name: string, version: number, options: { upgrade: (db: unknown) => void }) => {
            options.upgrade(mockDb);
            return Promise.resolve(mockDb);
        });

        // Trigger getDB
        await persistence.getAllDatasets();

        expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith('datasets');
        expect(mockDb.createObjectStore).not.toHaveBeenCalled();
    });

    it('should save a dataset', async () => {
      const mockDb = {
        put: vi.fn().mockResolvedValueOnce(undefined),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' };
      await persistence.saveDataset(dataset);

      expect(mockDb.put).toHaveBeenCalledWith('datasets', dataset);
    });

    it('should load a dataset and fix types', async () => {
      const storedDataset = {
        id: '1',
        name: 'test',
        columns: ['Time', 'Value'],
        data: [
            { levels: [{ 0: 1, 1: 2, 2: 3 }] }, // missing bounds, level is object
            { levels: [new Float32Array([1, 2, 3])], bounds: {min: 0, max: 1}, refPoint: 5 }, // valid level
            { levels: ['invalid'] } // invalid level
        ],
        rowCount: 0
      };

      const mockDb = {
        get: vi.fn().mockResolvedValueOnce(storedDataset),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset = await persistence.loadDataset('1');

      expect(mockDb.get).toHaveBeenCalledWith('datasets', '1');
      expect(dataset).toBeDefined();
      expect(dataset!.data[0].bounds).toEqual({min: 0, max: 0});
      expect(dataset!.data[0].data).toBeInstanceOf(Float32Array);
      expect(dataset!.data[0].data.length).toBe(3);
      expect(dataset!.data[0].refPoint).toBe(0);

      expect(dataset!.data[1].bounds).toEqual({min: 0, max: 1});
      expect(dataset!.data[1].data).toBeInstanceOf(Float32Array);
      expect(dataset!.data[1].refPoint).toBe(5);

      expect(dataset!.data[2].data).toBeInstanceOf(Float32Array);
      expect(dataset!.data[2].data.length).toBe(0);

      expect(dataset!.xAxisColumn).toBe('Time');
      expect(dataset!.xAxisId).toBe('axis-1');
    });

    it('should load a dataset that has no data or is not an array', async () => {
      const storedDataset = {
        id: '1',
        name: 'test',
        columns: [],
        data: null,
        rowCount: 0
      };

      const mockDb = {
        get: vi.fn().mockResolvedValueOnce(storedDataset),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset = await persistence.loadDataset('1');

      expect(dataset).toEqual(storedDataset);
    });

    it('should return undefined if dataset not found', async () => {
      const mockDb = {
        get: vi.fn().mockResolvedValueOnce(undefined),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset = await persistence.loadDataset('1');
      expect(dataset).toBeUndefined();
    });

    it('should get all datasets', async () => {
      const storedDatasets = [
        { id: '1', name: 'test1', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' },
        { id: '2', name: 'test2', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' }
      ];

      const mockDb = {
        getAll: vi.fn().mockResolvedValueOnce(storedDatasets),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const datasets = await persistence.getAllDatasets();

      expect(mockDb.getAll).toHaveBeenCalledWith('datasets');
      expect(datasets.length).toBe(2);
    });

    it('should delete a dataset', async () => {
      const mockDb = {
        delete: vi.fn().mockResolvedValueOnce(undefined),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      await persistence.deleteDataset('1');

      expect(mockDb.delete).toHaveBeenCalledWith('datasets', '1');
    });

    it('should load a dataset and handle existing refPoint', async () => {
      const storedDataset = {
        id: '1',
        name: 'test',
        columns: [],
        data: [
            { levels: [new Float32Array([1, 2, 3])], bounds: {min: 0, max: 1}, refPoint: 10 }
        ],
        rowCount: 0
      };

      const mockDb = {
        get: vi.fn().mockResolvedValueOnce(storedDataset),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset = await persistence.loadDataset('1');

      expect(mockDb.get).toHaveBeenCalledWith('datasets', '1');
      expect(dataset).toBeDefined();
      expect(dataset!.data[0].refPoint).toBe(10);
    });
  });

  describe('AppState persistence', () => {
    let originalLocalStorage: Storage;

    beforeEach(() => {
        originalLocalStorage = window.localStorage;
        Object.defineProperty(window, 'localStorage', {
            value: {
                getItem: vi.fn(),
                setItem: vi.fn(),
                removeItem: vi.fn(),
                clear: vi.fn(),
                length: 0,
                key: vi.fn()
            },
            writable: true
        });
    });

    afterEach(() => {
        Object.defineProperty(window, 'localStorage', {
            value: originalLocalStorage,
            writable: true
        });
    });

    it('should save app state to local storage', () => {
        const state: AppState = {
            xAxes: [{ id: 'axis-1', name: 'X', min: 0, max: 100, showGrid: true, xMode: 'numeric' }],
            yAxes: [],
            series: [],
            axisTitles: { x: '', y: '' }
        };
        persistence.saveAppState(state);
        expect(localStorage.setItem).toHaveBeenCalledWith('webgraphy-state', JSON.stringify(state));
    });

    it('should load app state from local storage', () => {
        const state: AppState = {
            xAxes: [{ id: 'axis-1', name: 'X', min: 0, max: 100, showGrid: true, xMode: 'numeric' }],
            yAxes: [],
            series: [],
            axisTitles: { x: '', y: '' }
        };
        vi.mocked(localStorage.getItem).mockReturnValueOnce(JSON.stringify(state));

        const loadedState = persistence.loadAppState();
        expect(localStorage.getItem).toHaveBeenCalledWith('webgraphy-state');
        expect(loadedState).toEqual(state);
    });

    it('should return null if no app state in local storage', () => {
        vi.mocked(localStorage.getItem).mockReturnValueOnce(null);

        const loadedState = persistence.loadAppState();
        expect(loadedState).toBeNull();
    });

    it('should return null if loaded state is invalid', () => {
        const invalidState = { xAxes: [{ id: 'axis-1', min: 'invalid' }] };
        vi.mocked(localStorage.getItem).mockReturnValueOnce(JSON.stringify(invalidState));
        const loadedState = persistence.loadAppState();
        expect(loadedState).toBeNull();
    });
  });

  describe('persistence error handling', () => {
    it('should propagate error when openDB fails', async () => {
      openDBMock.mockRejectedValueOnce(new Error('Failed to open IndexedDB'));

      const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' };

      await expect(persistence.saveDataset(dataset)).rejects.toThrow('Failed to open IndexedDB');
    });

    it('should propagate error when quota exceeded', async () => {
      const mockDb = {
        put: vi.fn().mockRejectedValueOnce(new DOMException('QuotaExceededError')),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' };

      await expect(persistence.saveDataset(dataset)).rejects.toThrow('QuotaExceededError');
    });

    it('should propagate errors if db.get fails', async () => {
      const mockDb = {
        get: vi.fn().mockRejectedValueOnce(new Error('Read failed')),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      await expect(persistence.loadDataset('1')).rejects.toThrow('Read failed');
    });

    it('should propagate errors if db.getAll fails', async () => {
      const mockDb = {
        getAll: vi.fn().mockRejectedValueOnce(new Error('Read all failed')),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      await expect(persistence.getAllDatasets()).rejects.toThrow('Read all failed');
    });

    it('should propagate errors if db.delete fails', async () => {
      const mockDb = {
        delete: vi.fn().mockRejectedValueOnce(new Error('Delete failed')),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      await expect(persistence.deleteDataset('1')).rejects.toThrow('Delete failed');
    });
  });
});
