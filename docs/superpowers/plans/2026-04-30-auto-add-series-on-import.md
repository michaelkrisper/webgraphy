# Auto-Add Series on Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When a dataset with ≤5 total columns is imported, automatically add the non-x columns (up to 4) as series on the graph.

**Architecture:** Extract the series-creation logic from `Sidebar.tsx` into a pure utility function `buildSeriesConfig` in `src/utils/series.ts`. `useDataImport.ts` calls `addSeries` for each auto-detected column after `addDataset`. `Sidebar.tsx` uses the same utility for its manual column-click path.

**Tech Stack:** TypeScript, Zustand, Vitest

---

## File Map

- **Create:** `src/utils/series.ts` — pure `buildSeriesConfig(columnName, sourceId, existingSeriesCount): SeriesConfig`
- **Modify:** `src/hooks/useDataImport.ts` — call `addSeries` after `addDataset` when `ds.columns.length <= 5`
- **Modify:** `src/components/Layout/Sidebar.tsx` — replace inline series-build logic with `buildSeriesConfig`
- **Create:** `src/utils/__tests__/series.test.ts` — unit tests for `buildSeriesConfig`
- **Modify:** `src/hooks/__tests__/useDataImport.test.tsx` — tests for auto-add behavior

---

### Task 1: Extract `buildSeriesConfig` utility

**Files:**
- Create: `src/utils/series.ts`
- Create: `src/utils/__tests__/series.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// src/utils/__tests__/series.test.ts
import { describe, it, expect } from 'vitest';
import { buildSeriesConfig } from '../series';

describe('buildSeriesConfig', () => {
  it('returns a SeriesConfig with correct fields', () => {
    const s = buildSeriesConfig('A: Temperature', 'ds-1', 0);
    expect(s.sourceId).toBe('ds-1');
    expect(s.yColumn).toBe('A: Temperature');
    expect(s.name).toBe('A: Temperature');
    expect(s.yAxisId).toBe('axis-1');
    expect(s.lineColor).toBe('#2563eb');
    expect(s.pointColor).toBe('#2563eb');
    expect(s.lineStyle).toBe('solid');
    expect(s.pointStyle).toBe('circle');
    expect(s.hidden).toBe(false);
    expect(typeof s.id).toBe('string');
    expect(s.id.length).toBeGreaterThan(0);
  });

  it('cycles color palette by existingSeriesCount', () => {
    const s0 = buildSeriesConfig('Col', 'ds-1', 0);
    const s1 = buildSeriesConfig('Col', 'ds-1', 1);
    expect(s0.lineColor).toBe('#2563eb');
    expect(s1.lineColor).toBe('#e11d48');
  });

  it('assigns axis-1 for count 0, axis-2 for count 1', () => {
    const s0 = buildSeriesConfig('Col', 'ds-1', 0);
    const s1 = buildSeriesConfig('Col', 'ds-1', 1);
    expect(s0.yAxisId).toBe('axis-1');
    expect(s1.yAxisId).toBe('axis-2');
  });

  it('wraps axis assignment at 9', () => {
    const s9 = buildSeriesConfig('Col', 'ds-1', 9);
    expect(s9.yAxisId).toBe('axis-1');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/utils/__tests__/series.test.ts
```

Expected: FAIL — `Cannot find module '../series'`

- [ ] **Step 3: Implement `buildSeriesConfig`**

```typescript
// src/utils/series.ts
import { COLOR_PALETTE } from '../themes';
import type { SeriesConfig } from '../services/persistence';

export const buildSeriesConfig = (
  columnName: string,
  sourceId: string,
  existingSeriesCount: number
): SeriesConfig => {
  const color = COLOR_PALETTE[existingSeriesCount % COLOR_PALETTE.length];
  const axisNum = (existingSeriesCount % 9) + 1;
  return {
    id: crypto.randomUUID(),
    sourceId,
    name: columnName,
    yColumn: columnName,
    yAxisId: `axis-${axisNum}`,
    pointStyle: 'circle',
    pointColor: color,
    lineStyle: 'solid',
    lineColor: color,
    hidden: false,
  };
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run src/utils/__tests__/series.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/series.ts src/utils/__tests__/series.test.ts
git commit -m "feat: add buildSeriesConfig utility"
```

---

### Task 2: Use `buildSeriesConfig` in `Sidebar.tsx`

**Files:**
- Modify: `src/components/Layout/Sidebar.tsx` (around line 180–214)

- [ ] **Step 1: Replace inline logic with utility call**

In `src/components/Layout/Sidebar.tsx`, replace the `createSeries` function body:

Old:
```typescript
const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    const { addSeries } = useGraphStore.getState();

    const usedAxisIds = new Set(series.map(s => s.yAxisId));
    let nextAxisId = 'axis-1';
    for (let i = 1; i <= 9; i++) {
      const id = `axis-${i}`;
      if (!usedAxisIds.has(id)) {
        nextAxisId = id;
        break;
      }
    }

    if (usedAxisIds.size >= 9) {
      nextAxisId = `axis-${(series.length % 9) + 1}`;
    }

    const color = COLOR_PALETTE[series.length % COLOR_PALETTE.length];

    addSeries({
      id: crypto.randomUUID(),
      sourceId: datasetId,
      name: columnName,
      yColumn: columnName,
      yAxisId: nextAxisId,
      pointStyle: 'circle',
      pointColor: color,
      lineStyle: 'solid',
      lineColor: color,
      hidden: false
    });
  };
```

New:
```typescript
const createSeries = (datasetId: string, columnName: string) => {
    const dataset = datasets.find(d => d.id === datasetId);
    if (!dataset) return;

    const { addSeries } = useGraphStore.getState();
    addSeries(buildSeriesConfig(columnName, datasetId, series.length));
  };
```

- [ ] **Step 2: Add import for `buildSeriesConfig` at top of `Sidebar.tsx`**

Add after the existing imports:
```typescript
import { buildSeriesConfig } from '../../utils/series';
```

Remove the now-unused `COLOR_PALETTE` import from the themes import line if it's no longer used elsewhere in the file. Check first with a search for other `COLOR_PALETTE` usages.

- [ ] **Step 3: Run full test suite**

```bash
npm run test
```

Expected: all tests pass, no TypeScript errors

- [ ] **Step 4: Commit**

```bash
git add src/components/Layout/Sidebar.tsx
git commit -m "refactor: use buildSeriesConfig in Sidebar createSeries"
```

---

### Task 3: Auto-add series in `useDataImport` after successful import

**Files:**
- Modify: `src/hooks/useDataImport.ts`
- Modify: `src/hooks/__tests__/useDataImport.test.tsx`

- [ ] **Step 1: Write failing tests**

Add these two tests to `src/hooks/__tests__/useDataImport.test.tsx`, inside the existing `describe('useDataImport hook', ...)` block.

First update the mock at the top to also mock `addSeries`:

```typescript
// Change the store mock to include addSeries
const mockAddSeries = vi.fn();

// In beforeEach, update the useGraphStore mock:
vi.mocked(useGraphStore).mockImplementation(() => ({
  addDataset: mockAddDataset,
  addSeries: mockAddSeries,
}));
vi.mocked(useGraphStore.getState).mockReturnValue({
  datasets: [],
  series: [],
  addSeries: mockAddSeries,
} as ReturnType<typeof useGraphStore.getState>);
```

Then add the new test cases:

```typescript
it('should auto-add series for non-x columns when dataset has ≤5 columns', async () => {
  const { result } = renderHook(() => useDataImport());

  const file = new File([''], 'test.csv', { type: 'text/csv' });
  const originalFileReader = global.FileReader;
  class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    readAsText() { this.onload?.({ target: { result: 'data' } }); }
  }
  global.FileReader = MockFileReader as unknown as typeof FileReader;

  act(() => { result.current.importFile(file); });

  const settings: ImportSettings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [], xAxisColumn: '' };
  act(() => { result.current.confirmImport(settings); });

  const mockDataset = {
    id: 'ds-auto',
    name: 'test.csv',
    columns: ['A: Time', 'A: Temp', 'A: Humidity'],
    rowCount: 10,
    data: [],
    xAxisColumn: 'A: Time',
    xAxisId: 'axis-1',
  };

  await act(async () => {
    await getMockWorker().onmessage?.({
      data: { type: 'success', dataset: mockDataset }
    } as MessageEvent);
  });

  expect(mockAddSeries).toHaveBeenCalledTimes(2);
  expect(mockAddSeries.mock.calls[0][0].yColumn).toBe('A: Temp');
  expect(mockAddSeries.mock.calls[1][0].yColumn).toBe('A: Humidity');

  global.FileReader = originalFileReader;
});

it('should not auto-add series when dataset has >5 columns', async () => {
  const { result } = renderHook(() => useDataImport());

  const file = new File([''], 'wide.csv', { type: 'text/csv' });
  const originalFileReader = global.FileReader;
  class MockFileReader {
    onload: ((event: { target: { result: string } }) => void) | null = null;
    readAsText() { this.onload?.({ target: { result: 'data' } }); }
  }
  global.FileReader = MockFileReader as unknown as typeof FileReader;

  act(() => { result.current.importFile(file); });

  const settings: ImportSettings = { delimiter: ',', decimalPoint: '.', startRow: 1, columnConfigs: [], xAxisColumn: '' };
  act(() => { result.current.confirmImport(settings); });

  const mockDataset = {
    id: 'ds-wide',
    name: 'wide.csv',
    columns: ['A: T', 'A: C1', 'A: C2', 'A: C3', 'A: C4', 'A: C5'],
    rowCount: 10,
    data: [],
    xAxisColumn: 'A: T',
    xAxisId: 'axis-1',
  };

  await act(async () => {
    await getMockWorker().onmessage?.({
      data: { type: 'success', dataset: mockDataset }
    } as MessageEvent);
  });

  expect(mockAddSeries).not.toHaveBeenCalled();

  global.FileReader = originalFileReader;
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run src/hooks/__tests__/useDataImport.test.tsx
```

Expected: FAIL — `mockAddSeries` not called / called unexpectedly

- [ ] **Step 3: Implement auto-add in `useDataImport.ts`**

Update `src/hooks/useDataImport.ts`:

```typescript
import { useState, useCallback } from 'react';
import { persistence, type Dataset } from '../services/persistence';
import { useGraphStore } from '../store/useGraphStore';
import type { ImportSettings } from '../types/import';
import { buildSeriesConfig } from '../utils/series';

const AUTO_ADD_COLUMN_THRESHOLD = 5;

const processImportedDataset = (ds: Dataset, currentDatasetsLength: number) => {
  const letter = String.fromCharCode(65 + currentDatasetsLength);
  const prefix = `${letter}: `;
  ds.name = `${letter} - ${ds.name}`;
  ds.columns = ds.columns.map(c => `${prefix}${c}`);
  if (ds.xAxisColumn) {
    ds.xAxisColumn = `${prefix}${ds.xAxisColumn}`;
  }
  return ds;
};

export const useDataImport = () => {
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<{ file: File, preview: string, type: 'csv' | 'json' } | null>(null);
  const { addDataset, addSeries } = useGraphStore();

  const initiateImport = useCallback(async (file: File) => {
    setError(null);
    const type = file.name.endsWith('.csv') ? 'csv' : 'json';
    const reader = new FileReader();
    reader.onload = (e) => {
      const preview = e.target?.result as string;
      setPendingFile({ file, preview, type });
    };
    reader.readAsText(file.slice(0, 25600));
  }, []);

  const confirmImport = useCallback(async (settings: ImportSettings) => {
    if (!pendingFile) return;
    setIsImporting(true);
    setError(null);

    const { file, type } = pendingFile;
    const worker = new Worker(new URL('../workers/data-parser.worker.ts', import.meta.url), {
      type: 'module'
    });

    worker.onmessage = async (event) => {
      const { type: msgType, dataset, error: msgError } = event.data;

      if (msgType === 'success') {
        const currentState = useGraphStore.getState();
        const ds = processImportedDataset(dataset as Dataset, currentState.datasets.length);

        await persistence.saveDataset(ds);
        addDataset(ds);

        if (ds.columns.length <= AUTO_ADD_COLUMN_THRESHOLD) {
          const existingSeries = useGraphStore.getState().series;
          const nonXColumns = ds.columns.filter(c => c !== ds.xAxisColumn).slice(0, 4);
          nonXColumns.forEach((col, i) => {
            addSeries(buildSeriesConfig(col, ds.id, existingSeries.length + i));
          });
        }

        setIsImporting(false);
        setPendingFile(null);
        worker.terminate();
      } else if (msgType === 'error') {
        setError(msgError);
        setIsImporting(false);
        worker.terminate();
      }
    };

    worker.postMessage({ file, type, settings });
  }, [pendingFile, addDataset, addSeries]);

  const cancelImport = useCallback(() => {
    setPendingFile(null);
  }, []);

  return {
    importFile: initiateImport,
    confirmImport,
    cancelImport,
    pendingFile,
    isImporting,
    error
  };
};
```

- [ ] **Step 4: Run new tests to verify they pass**

```bash
npx vitest run src/hooks/__tests__/useDataImport.test.tsx
```

Expected: PASS (all tests including the two new ones)

- [ ] **Step 5: Run full test suite and type check**

```bash
npm run build
```

Expected: no TypeScript errors, build succeeds

- [ ] **Step 6: Commit**

```bash
git add src/hooks/useDataImport.ts src/hooks/__tests__/useDataImport.test.tsx
git commit -m "feat: auto-add series on import when dataset has ≤5 columns"
```
