import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest';
import { importSession } from '../session';
import { persistence } from '../persistence';

vi.mock('../persistence', () => ({
  persistence: {
    getAllDatasets: vi.fn(),
    deleteDataset: vi.fn(),
    saveDataset: vi.fn(),
    saveAppState: vi.fn(),
  },
}));

describe('importSession', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (persistence.getAllDatasets as Mock).mockResolvedValue([]);
  });

  it('should import a valid session', async () => {
    const session = {
      version: 1,
      appState: {
        xAxes: [],
        yAxes: [],
        series: [],
        axisTitles: { x: 'X', y: 'Y' },
      },
      datasets: [],
    };

    const result = await importSession(JSON.stringify(session));
    expect(result.appState).toEqual(session.appState);
    expect(persistence.saveAppState).toHaveBeenCalledWith(session.appState);
  });

  it('should prevent prototype pollution', async () => {
    const sessionJson = JSON.stringify({
      version: 1,
      appState: {
        xAxes: [],
        yAxes: [],
        series: [],
        axisTitles: { x: 'X', y: 'Y' },
      },
      datasets: [],
      ['__proto__']: { polluted: 'true' },
    });

    const result = await importSession(sessionJson);
    expect((result as Record<string, unknown>).polluted).toBeUndefined();
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it('should throw error for unsupported version', async () => {
    const session = {
      version: 2,
      appState: {},
      datasets: [],
    };

    await expect(importSession(JSON.stringify(session))).rejects.toThrow('Unsupported session version: 2');
  });
});
