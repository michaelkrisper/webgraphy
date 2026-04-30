# LOD Mipmap Downsampling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pre-compute LTTB at multiple zoom levels (mipmaps) during data import so the renderer picks the right level at runtime — no per-frame downsampling, no jumping points, full detail when zoomed in.

**Architecture:** Each `DataColumn` stores a `lodLevels` array of `{x, y}` Float32Array pairs, pre-computed by the data-parser worker at halving point counts (N/2, N/4, …, down to ~256). The renderer binary-searches the column's X data to find `startIdx`/`endIdx`, computes `numPoints`, then selects the coarsest LOD level where `levelPoints >= lttbThreshold` — clip that level's output to the viewport using a binary search on the level's X array. When zoomed in enough that raw data fits under threshold, use raw data directly.

**Tech Stack:** TypeScript, Float32Array, Web Worker (data-parser.worker.ts), WebGL (WebGLRenderer.tsx), existing `lttbFloat32` logic inlined into worker.

---

## File Map

| File | Change |
|------|--------|
| `src/services/persistence.ts` | Add `LodLevel` interface, add `lodLevels?: LodLevel[]` to `DataColumn` |
| `src/workers/data-parser.worker.ts` | Compute LOD levels per column after parsing; add to transfer list |
| `src/services/demoData.ts` | Compute LOD levels in `processColumns` |
| `src/components/Plot/WebGLRenderer.tsx` | Replace snap-LTTB block with LOD level selection + viewport clip |
| `src/utils/lttb.ts` | No change (algorithm stays, just moved/inlined into worker) |
| `src/services/session.ts` | No change (LOD levels not serialized; recomputed on load) |

---

## Task 1: Add `LodLevel` type and `lodLevels` field to `DataColumn`

**Files:**
- Modify: `src/services/persistence.ts:9-17`

- [ ] **Step 1: Add the interface and field**

In `src/services/persistence.ts`, replace the `DataColumn` interface:

```typescript
export interface LodLevel {
  x: Float32Array;
  y: Float32Array; // placeholder — renderer uses per-series y; see Task 3
}

export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: Float32Array;
  chunkMin?: Float32Array;
  chunkMax?: Float32Array;
  lodLevels?: Float32Array[]; // Each entry is a downsampled x (index) array; levels[0] is coarsest
}
```

Wait — LOD for a chart needs both X and Y downsampled together because LTTB picks points by triangle area across both dimensions. We can't store LOD per-column independently; we need per-series (xCol, yCol) pairs. That's the fundamental constraint.

**Revised approach:** Store LOD index arrays per column-pair. But column pairs are series-defined, not dataset-defined. Recomputing per series on import is expensive and speculative (series may not exist yet).

**Simpler correct approach:** Store LOD as **index arrays** — each level stores the raw data indices selected by LTTB for the X column downsampled alone (using X as both dimensions, treating index as Y). No — that loses Y information.

**Correct approach:** LOD levels stored on `DataColumn` pairs identified in the worker. Since the worker knows which column is X (xAxisColumn), compute LOD levels for every Y column paired with the X column. Store on each Y `DataColumn` as `lodX: Float32Array[]` and `lodY: Float32Array[]` (parallel arrays per level).

Revised `DataColumn`:

```typescript
export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: Float32Array;
  chunkMin?: Float32Array;
  chunkMax?: Float32Array;
  /** Pre-computed LTTB levels paired with the dataset's X column.
   *  lod[0] = coarsest, lod[lod.length-1] = finest (still downsampled).
   *  Each entry: interleaved [x0, y0, x1, y1, ...] Float32Array of length 2*pointCount.
   *  Absent on the X column itself and on columns with < MIN_LOD_POINTS raw points.
   */
  lod?: Float32Array[];
}
```

Interleaved XY avoids two array lookups per point and simplifies binary search.

- [ ] **Step 2: Apply the edit**

In `src/services/persistence.ts`, replace lines 9–16:

```typescript
export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: Float32Array;
  chunkMin?: Float32Array;
  chunkMax?: Float32Array;
  /**
   * Pre-computed LTTB mipmap levels paired against the dataset X column.
   * lod[0] = coarsest (~256 pts), lod[last] = finest level still downsampled.
   * Each entry is interleaved Float32Array: [x0, y0, x1, y1, ...] (relative coords).
   * Absent on the X column and on columns too small to downsample.
   */
  lod?: Float32Array[];
}
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/persistence.ts
git commit -m "feat: add lod field to DataColumn for mipmap downsampling"
```

---

## Task 2: Add LOD computation utility (worker-safe, no imports)

**Files:**
- Create: `src/utils/lod.ts`

This file contains the LTTB-based LOD builder. It's a pure function with no imports so it can be copied verbatim into the worker if needed, but we import it directly since the worker uses the same module graph.

- [ ] **Step 1: Write failing test**

Create `src/utils/__tests__/lod.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { buildLodLevels, MIN_LOD_POINTS, selectLodLevel } from '../lod';

describe('buildLodLevels', () => {
  it('returns empty array when points below MIN_LOD_POINTS', () => {
    const n = MIN_LOD_POINTS - 1;
    const x = new Float32Array(n).map((_, i) => i);
    const y = new Float32Array(n).map((_, i) => Math.sin(i));
    expect(buildLodLevels(x, y).length).toBe(0);
  });

  it('produces levels in descending point count, coarsest first', () => {
    const n = 10000;
    const x = new Float32Array(n).map((_, i) => i);
    const y = new Float32Array(n).map((_, i) => Math.sin(i * 0.01));
    const levels = buildLodLevels(x, y);
    expect(levels.length).toBeGreaterThan(0);
    // Each level has fewer points than the next finer one
    for (let i = 0; i < levels.length - 1; i++) {
      expect(levels[i].length).toBeLessThan(levels[i + 1].length);
    }
    // Coarsest level has ~256 points (512 values in interleaved array)
    expect(levels[0].length).toBeLessThanOrEqual(512 + 2); // 256 pts * 2 + possible rounding
  });

  it('interleaves x and y correctly', () => {
    const x = new Float32Array([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15,
      16, 17, 18, 19, 20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30]);
    const y = new Float32Array(x.length).map((_, i) => i * 2);
    const levels = buildLodLevels(x, y);
    if (levels.length === 0) return; // too small
    const level = levels[levels.length - 1]; // finest level
    // Check interleaving: every even index is x, odd is y
    for (let i = 0; i < level.length - 1; i += 2) {
      const lx = level[i];
      const ly = level[i + 1];
      // y should be 2*x (since our y = i*2 and data is sequential)
      expect(ly).toBeCloseTo(lx * 2, 3);
    }
  });

  it('first and last points of each level match input first/last', () => {
    const n = 5000;
    const x = new Float32Array(n).map((_, i) => i * 0.1);
    const y = new Float32Array(n).map((_, i) => Math.cos(i * 0.01));
    const levels = buildLodLevels(x, y);
    for (const level of levels) {
      expect(level[0]).toBeCloseTo(x[0], 4);
      expect(level[1]).toBeCloseTo(y[0], 4);
      expect(level[level.length - 2]).toBeCloseTo(x[n - 1], 4);
      expect(level[level.length - 1]).toBeCloseTo(y[n - 1], 4);
    }
  });
});

describe('selectLodLevel', () => {
  it('returns null when no lod levels', () => {
    expect(selectLodLevel(undefined, 100, 0, 99)).toBeNull();
    expect(selectLodLevel([], 100, 0, 99)).toBeNull();
  });

  it('returns finest level with enough points for threshold', () => {
    // Build synthetic levels: coarse=256pts, medium=512pts, fine=1024pts
    const makeLevel = (n: number) => new Float32Array(n * 2);
    const levels = [makeLevel(256), makeLevel(512), makeLevel(1024)];
    // threshold=300 → want finest level with >= 300 pts → medium (512)
    const result = selectLodLevel(levels, 300, 0, 0);
    expect(result).toBe(levels[1]);
  });

  it('returns coarsest level when threshold > all level sizes', () => {
    const makeLevel = (n: number) => new Float32Array(n * 2);
    const levels = [makeLevel(256), makeLevel(512)];
    const result = selectLodLevel(levels, 10000, 0, 0);
    expect(result).toBe(levels[0]);
  });
});
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run src/utils/__tests__/lod.test.ts
```

Expected: `Cannot find module '../lod'`

- [ ] **Step 3: Implement `src/utils/lod.ts`**

```typescript
export const MIN_LOD_POINTS = 512;
const COARSEST_POINTS = 256;

/**
 * Build LTTB mipmap levels for a Y column paired with its X column.
 * Returns levels coarsest-first. Each level is an interleaved Float32Array
 * [x0,y0, x1,y1, ...] of length 2*pointCount.
 * Returns [] when rawX.length < MIN_LOD_POINTS (no downsampling needed).
 */
export function buildLodLevels(rawX: Float32Array, rawY: Float32Array): Float32Array[] {
  const n = rawX.length;
  if (n < MIN_LOD_POINTS) return [];

  const levels: Float32Array[] = [];
  let targetPoints = COARSEST_POINTS;

  // Build from coarsest upward, stopping when target >= n/2
  // (finer than n/2 wouldn't save much vs raw)
  const targets: number[] = [];
  while (targetPoints < n / 2) {
    targets.push(targetPoints);
    targetPoints *= 2;
  }

  for (const target of targets) {
    levels.push(lttbInterleaved(rawX, rawY, 0, n - 1, target));
  }

  return levels; // coarsest first
}

/**
 * Select the finest LOD level that still has >= threshold points,
 * or the coarsest level if all levels are below threshold.
 * Returns null if levels is empty or undefined.
 */
export function selectLodLevel(
  levels: Float32Array[] | undefined,
  threshold: number,
  _startIdx: number,
  _endIdx: number
): Float32Array | null {
  if (!levels || levels.length === 0) return null;

  // levels[0]=coarsest, levels[last]=finest
  // Find finest level with pointCount >= threshold
  // pointCount = level.length / 2
  let best = levels[0]; // fallback: coarsest
  for (let i = levels.length - 1; i >= 0; i--) {
    const pts = levels[i].length / 2;
    if (pts >= threshold) {
      best = levels[i];
      break;
    }
  }
  return best;
}

function lttbInterleaved(
  xData: Float32Array,
  yData: Float32Array,
  startIdx: number,
  endIdx: number,
  threshold: number
): Float32Array {
  const numPoints = endIdx - startIdx + 1;
  const out = new Float32Array(threshold * 2);

  out[0] = xData[startIdx];
  out[1] = yData[startIdx];

  if (threshold <= 2 || threshold >= numPoints) {
    // Just first + last
    out[(threshold - 1) * 2] = xData[endIdx];
    out[(threshold - 1) * 2 + 1] = yData[endIdx];
    return out;
  }

  const bucketSize = (numPoints - 2) / (threshold - 2);
  let a = startIdx;

  for (let i = 0; i < threshold - 2; i++) {
    const nextBucketStart = Math.floor((i + 1) * bucketSize) + 1 + startIdx;
    const nextBucketEnd = Math.min(Math.floor((i + 2) * bucketSize) + 1 + startIdx, endIdx + 1);
    let avgX = 0, avgY = 0;
    for (let j = nextBucketStart; j < nextBucketEnd; j++) {
      avgX += xData[j];
      avgY += yData[j];
    }
    const avgLen = nextBucketEnd - nextBucketStart;
    avgX /= avgLen;
    avgY /= avgLen;

    const bucketStart = Math.floor(i * bucketSize) + 1 + startIdx;
    const bucketEnd = Math.min(Math.floor((i + 1) * bucketSize) + 1 + startIdx, endIdx + 1);
    const ax = xData[a], ay = yData[a];
    let maxArea = -1, maxIdx = bucketStart;
    for (let j = bucketStart; j < bucketEnd; j++) {
      const area = Math.abs((ax - avgX) * (yData[j] - ay) - (ax - xData[j]) * (avgY - ay)) * 0.5;
      if (area > maxArea) { maxArea = area; maxIdx = j; }
    }
    out[(i + 1) * 2] = xData[maxIdx];
    out[(i + 1) * 2 + 1] = yData[maxIdx];
    a = maxIdx;
  }

  out[(threshold - 1) * 2] = xData[endIdx];
  out[(threshold - 1) * 2 + 1] = yData[endIdx];
  return out;
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run src/utils/__tests__/lod.test.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/utils/lod.ts src/utils/__tests__/lod.test.ts
git commit -m "feat: add LOD mipmap builder and level selector"
```

---

## Task 3: Compute LOD levels in the data-parser worker

**Files:**
- Modify: `src/workers/data-parser.worker.ts`

The worker already knows which column is X (`xAxisColumn` / first column). After building `relativeData`, compute LOD for each non-X column.

- [ ] **Step 1: Read the worker's column-building section**

```bash
# Read lines 1-95 of data-parser.worker.ts to see imports and dataset shape
```

Open `src/workers/data-parser.worker.ts` and note:
- Line ~10: imports at top
- Lines ~61-81: `dataset` object with `data` array
- Lines ~83-90: `transferList` construction + `postMessage`

- [ ] **Step 2: Add the import**

At the top of `src/workers/data-parser.worker.ts`, after existing imports, add:

```typescript
import { buildLodLevels } from '../utils/lod';
```

- [ ] **Step 3: Find the X column index**

In the worker, after `const dataset = { ... }` is built (after line ~81), add:

```typescript
// Build LOD mipmap levels for each Y column paired with the X column
const xColIdx = dataset.columns.indexOf(dataset.xAxisColumn ?? dataset.columns[0]);
const xColData = dataset.data[xColIdx];
if (xColData) {
  dataset.data.forEach((col, idx) => {
    if (idx === xColIdx) return; // skip X column itself
    col.lod = buildLodLevels(xColData.data, col.data);
  });
}
```

- [ ] **Step 4: Add LOD buffers to the transfer list**

After existing `transferList` construction (lines ~83-88), add:

```typescript
dataset.data.forEach(col => {
  if (col.lod) {
    col.lod.forEach(level => transferList.push(level.buffer as ArrayBuffer));
  }
});
```

- [ ] **Step 5: Verify build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 6: Commit**

```bash
git add src/workers/data-parser.worker.ts
git commit -m "feat: compute LOD mipmap levels in data-parser worker"
```

---

## Task 4: Compute LOD levels in demoData

**Files:**
- Modify: `src/services/demoData.ts:72-120`

`processColumns` builds `DataColumn[]` for the demo weather dataset. It needs to attach LOD levels too, but it doesn't have a designated X column reference here — the X column is `columns[0]` (Timestamp).

- [ ] **Step 1: Add import**

At top of `src/services/demoData.ts`:

```typescript
import { buildLodLevels } from '../utils/lod';
```

- [ ] **Step 2: Attach LOD after column construction**

Replace the `return` at line ~110:

```typescript
  const result = columns.map((colName, colIdx) => {
    const col = relativeData[colIdx];
    return {
      isFloat64: colName === 'Timestamp',
      refPoint: col.refPoint,
      bounds: colBounds[colIdx],
      data: col.data,
      chunkMin: col.chunkMin,
      chunkMax: col.chunkMax
    } as DataColumn;
  });

  // X column is index 0 (Timestamp); compute LOD for all Y columns
  const xData = relativeData[0].data;
  result.forEach((col, idx) => {
    if (idx === 0) return;
    col.lod = buildLodLevels(xData, col.data);
  });

  return result;
```

- [ ] **Step 3: Verify build**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/services/demoData.ts
git commit -m "feat: compute LOD levels for demo dataset columns"
```

---

## Task 5: Use LOD levels in WebGLRenderer

**Files:**
- Modify: `src/components/Plot/WebGLRenderer.tsx:408-436`

Replace the snap-LTTB block with LOD level selection. When a LOD level is selected, binary-search its interleaved X values to find the visible range, then pass that slice to the GPU.

- [ ] **Step 1: Add import**

At the top of `src/components/Plot/WebGLRenderer.tsx`, add:

```typescript
import { selectLodLevel } from '../../utils/lod';
```

- [ ] **Step 2: Remove the old LTTB cache and hash infrastructure**

Remove (or keep for fallback — keep it for now, we'll gate on LOD presence):
- `lttbCacheRef` — keep as fallback for columns without LOD
- `lttbCacheHash` function — keep
- `lttbFloat32` function — keep as fallback

- [ ] **Step 3: Replace the LTTB dispatch block**

Find the block starting at `const numPoints = endIdx - startIdx + 1;` (around line 408) and replace the entire `if (numPoints > lttbThreshold) { ... } else { ... }` with:

```typescript
      const numPoints = endIdx - startIdx + 1;
      const lttbThreshold = Math.max(2, Math.floor(chartWidth * LTTB_THRESHOLD_PER_PX));

      let drawX: Float32Array;
      let drawY: Float32Array;
      let drawCount: number;

      const lodLevel = selectLodLevel(colY.lod, lttbThreshold, startIdx, endIdx);

      if (lodLevel !== null && numPoints > lttbThreshold) {
        // Binary-search the LOD level's interleaved X values for the visible range
        const lodPoints = lodLevel.length / 2;
        const xRelMin = xAxis.min - colX.refPoint;
        const xRelMax = xAxis.max - colX.refPoint;

        let lodStart = 0;
        let lo = 0, hi = lodPoints - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (lodLevel[mid * 2] <= xRelMin) { lodStart = mid; lo = mid + 1; }
          else hi = mid - 1;
        }

        let lodEnd = lodPoints - 1;
        lo = 0; hi = lodPoints - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >>> 1;
          if (lodLevel[mid * 2] >= xRelMax) { lodEnd = mid; hi = mid - 1; }
          else lo = mid + 1;
        }

        // Deinterleave the visible slice into separate X/Y arrays using shared buffer
        const visibleLodPoints = lodEnd - lodStart + 1;
        const buf = getSharedBuffer(visibleLodPoints * 2);
        const sliceX = buf.subarray(0, visibleLodPoints);
        const sliceY = buf.subarray(visibleLodPoints, visibleLodPoints * 2);
        for (let k = 0; k < visibleLodPoints; k++) {
          sliceX[k] = lodLevel[(lodStart + k) * 2];
          sliceY[k] = lodLevel[(lodStart + k) * 2 + 1];
        }

        drawX = sliceX;
        drawY = sliceY;
        drawCount = visibleLodPoints;
      } else if (numPoints > lttbThreshold) {
        // Fallback: snap-based LTTB for columns without LOD (e.g. formula columns)
        const totalPoints = xData.length;
        const snap = Math.max(1, Math.floor(lttbThreshold / 2));
        const snapStart = Math.max(0, Math.floor(startIdx / snap) * snap);
        const snapEnd = Math.min(totalPoints - 1, Math.ceil(endIdx / snap) * snap);
        const dsHash = dsIdHashRef.current.get(ds.id) ?? stringHash(ds.id);
        const cacheKey = lttbCacheHash(dsHash, xIdx, yIdx, snapStart, snapEnd, lttbThreshold);
        let cached = lttbCacheRef.current.get(cacheKey);
        if (!cached || cached.key !== cacheKey) {
          const result = lttbFloat32(xData, yData, snapStart, snapEnd, lttbThreshold);
          cached = { xOut: result.x, yOut: result.y, key: cacheKey };
          if (lttbCacheRef.current.size >= 200) {
            const keys = lttbCacheRef.current.keys();
            for (let i = 0; i < 100; i++) lttbCacheRef.current.delete(keys.next().value!);
          }
          lttbCacheRef.current.set(cacheKey, cached);
        }
        drawX = cached.xOut;
        drawY = cached.yOut;
        drawCount = lttbThreshold;
      } else {
        drawX = xData.subarray(startIdx, endIdx + 1);
        drawY = yData.subarray(startIdx, endIdx + 1);
        drawCount = numPoints;
      }
```

- [ ] **Step 4: Build**

```bash
npm run build
```

Expected: no TypeScript errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/Plot/WebGLRenderer.tsx
git commit -m "feat: use LOD mipmap levels in WebGLRenderer for stable downsampling"
```

---

## Task 6: Run full test suite

- [ ] **Step 1: Run all tests**

```bash
npm run test
```

Expected: all pass. If any test fails related to `DataColumn` shape (e.g. snapshot tests expecting no `lod` field), update the snapshot or add `lod: undefined` to the test fixture.

- [ ] **Step 2: Commit fix if needed**

```bash
git add <changed test files>
git commit -m "test: update fixtures for lod field on DataColumn"
```

---

## Self-Review

**Spec coverage:**
- ✅ Pre-compute LTTB at multiple zoom levels — Task 2 + 3 + 4
- ✅ Pick right level at render time — Task 5
- ✅ No per-frame downsampling — LOD levels cached on column, selectLodLevel is O(levels) = O(log₂(N/256)) ≈ O(6)
- ✅ No jumping points — each level computed on full dataset, stable
- ✅ Full detail when zoomed in — raw data path when `numPoints <= lttbThreshold`
- ✅ Fallback for formula columns (no LOD) — snap-LTTB kept

**Placeholder scan:** No TBDs. All code complete.

**Type consistency:**
- `DataColumn.lod: Float32Array[]` defined in Task 1, used in Task 3 (`col.lod = ...`), Task 4 (`col.lod = ...`), Task 5 (`colY.lod`)
- `selectLodLevel(levels, threshold, startIdx, endIdx)` defined in Task 2, called in Task 5 with `(colY.lod, lttbThreshold, startIdx, endIdx)`
- `buildLodLevels(xData, yData)` defined in Task 2, called in Task 3 and 4 with `(xColData.data, col.data)`
- `getSharedBuffer` already exists in `WebGLRenderer.tsx` — used in Task 5 ✅

**Edge cases covered:**
- Column shorter than `MIN_LOD_POINTS` (512): `buildLodLevels` returns `[]`, `selectLodLevel` returns `null`, falls through to snap-LTTB or raw
- X column has no LOD (skipped in worker) — renderer uses X's `data` directly for binary search as before
- Demo data: LOD computed in `demoData.ts` ✅
- Session import: LOD not serialized — columns loaded without LOD, fallback to snap-LTTB works correctly
