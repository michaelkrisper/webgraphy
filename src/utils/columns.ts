import { type Dataset } from '../services/persistence';

const columnCache = new WeakMap<Dataset, Map<string, number>>();

/**
 * ⚡ Bolt Optimization:
 * O(1) cached lookup for dataset column indices, replacing O(N) inline find/indexOf
 * operations with string comparisons (`endsWith`) in hot paths (render/interaction loops).
 */
export function getColumnIndex(ds: Dataset, columnName: string): number {
  let cache = columnCache.get(ds);
  if (!cache) {
    cache = new Map<string, number>();
    columnCache.set(ds, cache);
  }

  const cachedValue = cache.get(columnName);
  if (cachedValue !== undefined) {
    return cachedValue;
  }

  const idx = ds.columns.indexOf(columnName);
  if (idx !== -1) {
    cache.set(columnName, idx);
    return idx;
  }

  const suffixIdx = ds.columns.findIndex(c => c.endsWith(`: ${columnName}`) || c === columnName);
  cache.set(columnName, suffixIdx);
  return suffixIdx;
}
