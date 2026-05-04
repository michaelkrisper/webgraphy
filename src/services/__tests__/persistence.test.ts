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
        expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith('app_state');
        expect(mockDb.createObjectStore).toHaveBeenCalledWith('app_state');
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
        expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith('app_state');
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
            { data: { 0: 1, 1: 2, 2: 3 } }, // missing bounds, data is object
            { data: new Float32Array([1, 2, 3]), bounds: {min: 0, max: 1}, refPoint: 5 }, // valid data
            { data: 'invalid' } // invalid data
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
            { data: new Float32Array([1, 2, 3]), bounds: {min: 0, max: 1}, refPoint: 10 }
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
    it('should save app state to IndexedDB', async () => {
        const mockDb = {
            put: vi.fn().mockResolvedValueOnce(undefined),
        };
        openDBMock.mockResolvedValueOnce(mockDb);

        const state: AppState = {
            xAxes: [{ id: 'axis-1', name: 'X', min: 0, max: 100, showGrid: true, xMode: 'numeric' }],
            yAxes: [],
            series: [],
            axisTitles: { x: '', y: '' }
        };
        await persistence.saveAppState(state);
        expect(mockDb.put).toHaveBeenCalledWith('app_state', state, 'webgraphy-state');
    });

    it('should load app state from IndexedDB', async () => {
        const state: AppState = {
            xAxes: [{ id: 'axis-1', name: 'X', min: 0, max: 100, showGrid: true, xMode: 'numeric' }],
            yAxes: [],
            series: [],
            axisTitles: { x: '', y: '' }
        };

        const mockDb = {
            get: vi.fn().mockResolvedValueOnce(state),
        };
        openDBMock.mockResolvedValueOnce(mockDb);

        const loadedState = await persistence.loadAppState();
        expect(mockDb.get).toHaveBeenCalledWith('app_state', 'webgraphy-state');
        expect(loadedState).toEqual(state);
    });

    it('should return null if no app state in IndexedDB', async () => {
        const mockDb = {
            get: vi.fn().mockResolvedValueOnce(undefined),
        };
        openDBMock.mockResolvedValueOnce(mockDb);

        const loadedState = await persistence.loadAppState();
        expect(loadedState).toBeNull();
    });

    it('should return null if loaded state is invalid', async () => {
        const invalidState = { xAxes: [{ id: 'axis-1', min: 'invalid' }] };
        const mockDb = {
            get: vi.fn().mockResolvedValueOnce(invalidState),
        };
        openDBMock.mockResolvedValueOnce(mockDb);

        const loadedState = await persistence.loadAppState();
        expect(loadedState).toBeNull();
    });

    it('should clear app state from IndexedDB', async () => {
        const mockDb = {
            delete: vi.fn().mockResolvedValueOnce(undefined),
        };
        openDBMock.mockResolvedValueOnce(mockDb);

        await persistence.clearAppState();
        expect(mockDb.delete).toHaveBeenCalledWith('app_state', 'webgraphy-state');
    });

    it('should catch error and log when saving invalid state', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

        try {
            const invalidState = { xAxes: [{ id: 'axis-1', min: 'invalid' }] } as unknown as AppState;

            await persistence.saveAppState(invalidState);

            expect(consoleSpy).toHaveBeenCalledWith(
              'Failed to save state to IndexedDB:',
              expect.any(Error)
            );
        } finally {
            consoleSpy.mockRestore();
        }
    });

    it('should catch error and log when db.put throws', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const mockDb = {
                objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
                put: vi.fn().mockRejectedValueOnce(new Error('Write failed')),
            };
            // Reset DB to ensure our mocked put gets called
            vi.resetModules();
            const idbMock = await import('idb');
            const openDBMockInner = vi.mocked(idbMock.openDB);
            openDBMockInner.mockResolvedValueOnce(mockDb);
            const persistenceModule = await import('../persistence');
            const localPersistence = persistenceModule.persistence;

            const state: AppState = {
                xAxes: [{ id: 'axis-1', name: 'X', min: 0, max: 100, showGrid: true, xMode: 'numeric' }],
                yAxes: [],
                series: [],
                axisTitles: { x: '', y: '' }
            };

            await localPersistence.saveAppState(state);

            expect(consoleSpy).toHaveBeenCalledWith(
              'Failed to save state to IndexedDB:',
              expect.any(Error)
            );
        } finally {
            consoleSpy.mockRestore();
        }
    });
  });

  describe('persistence error handling', () => {
    it('should propagate error when openDB fails', async () => {
        vi.resetModules();
        const idbMock = await import('idb');
        const openDBMockInner = vi.mocked(idbMock.openDB);
        openDBMockInner.mockRejectedValueOnce(new Error('Failed to open IndexedDB'));
        const persistenceModule = await import('../persistence');
        const localPersistence = persistenceModule.persistence;

        const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' };

        await expect(localPersistence.saveDataset(dataset)).rejects.toThrow('Failed to open IndexedDB');
    });

    it('should propagate error when quota exceeded', async () => {
        const mockDb = {
            objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
            put: vi.fn().mockRejectedValueOnce(new DOMException('QuotaExceededError')),
        };

        vi.resetModules();
        const idbMock = await import('idb');
        const openDBMockInner = vi.mocked(idbMock.openDB);
        openDBMockInner.mockResolvedValueOnce(mockDb);
        const persistenceModule = await import('../persistence');
        const localPersistence = persistenceModule.persistence;

        const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0, xAxisColumn: 'X', xAxisId: 'axis-1' };

        await expect(localPersistence.saveDataset(dataset)).rejects.toThrow('QuotaExceededError');
    });

    it('should propagate errors if db.get fails', async () => {
        const mockDb = {
            objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
            get: vi.fn().mockRejectedValueOnce(new Error('Read failed')),
        };

        vi.resetModules();
        const idbMock = await import('idb');
        const openDBMockInner = vi.mocked(idbMock.openDB);
        openDBMockInner.mockResolvedValueOnce(mockDb);
        const persistenceModule = await import('../persistence');
        const localPersistence = persistenceModule.persistence;

        await expect(localPersistence.loadDataset('1')).rejects.toThrow('Read failed');
    });

    it('should propagate errors if db.getAll fails', async () => {
        const mockDb = {
            objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
            getAll: vi.fn().mockRejectedValueOnce(new Error('Read all failed')),
        };

        vi.resetModules();
        const idbMock = await import('idb');
        const openDBMockInner = vi.mocked(idbMock.openDB);
        openDBMockInner.mockResolvedValueOnce(mockDb);
        const persistenceModule = await import('../persistence');
        const localPersistence = persistenceModule.persistence;

        await expect(localPersistence.getAllDatasets()).rejects.toThrow('Read all failed');
    });

    it('should propagate errors if db.delete fails', async () => {
        const mockDb = {
            objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
            delete: vi.fn().mockRejectedValueOnce(new Error('Delete failed')),
        };

        vi.resetModules();
        const idbMock = await import('idb');
        const openDBMockInner = vi.mocked(idbMock.openDB);
        openDBMockInner.mockResolvedValueOnce(mockDb);
        const persistenceModule = await import('../persistence');
        const localPersistence = persistenceModule.persistence;

        await expect(localPersistence.deleteDataset('1')).rejects.toThrow('Delete failed');
    });

    it('should catch error when clearAppState fails', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const error = new Error('Delete failed');
      const mockDb = {
        delete: vi.fn().mockRejectedValueOnce(error),
      };
      openDBMock.mockResolvedValueOnce(mockDb);

      await persistence.clearAppState();

      expect(consoleSpy).toHaveBeenCalledWith('Failed to clear state from IndexedDB:', error);
      consoleSpy.mockRestore();
    });
  });
});
