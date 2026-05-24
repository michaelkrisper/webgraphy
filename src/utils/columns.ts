import type { Dataset } from "../services/persistence";

/**
 * Resolve a column name to its index in `ds.columns`. Prefers an exact match,
 * then falls back to a `"<prefix>: <columnName>"` suffix match. Returns -1 if
 * absent. Column counts are small (tens at most), so a direct scan is fine.
 */
export function getColumnIndex(ds: Dataset, columnName: string): number {
	const idx = ds.columns.indexOf(columnName);
	if (idx !== -1) return idx;
	return ds.columns.findIndex((c) => c.endsWith(`: ${columnName}`));
}
