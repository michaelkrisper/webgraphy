import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Dataset } from '../persistence';

vi.mock('idb', () => ({
  openDB: vi.fn(),
}));

describe('persistence error handling', () => {
  let persistence: typeof import('../persistence').persistence;
  let openDBMock: any;

  beforeEach(async () => {
    vi.resetModules();
    vi.clearAllMocks();

    // Dynamically import idb mock and persistence module
    const idbMock = await import('idb');
    openDBMock = vi.mocked(idbMock.openDB);

    const persistenceModule = await import('../persistence');
    persistence = persistenceModule.persistence;
  });

  it('should propagate error when openDB fails', async () => {
    openDBMock.mockRejectedValueOnce(new Error('Failed to open IndexedDB'));

    const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0 };

    await expect(persistence.saveDataset(dataset)).rejects.toThrow('Failed to open IndexedDB');
  });

  it('should propagate error when quota exceeded', async () => {
    const mockDb = {
      put: vi.fn().mockRejectedValueOnce(new DOMException('QuotaExceededError')),
    };
    openDBMock.mockResolvedValueOnce(mockDb);

    const dataset: Dataset = { id: '1', name: 'test', columns: [], data: [], rowCount: 0 };

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
