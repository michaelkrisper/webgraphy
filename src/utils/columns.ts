import type { DataColumn, Dataset, XAxisConfig } from "../services/persistence";

/**
 * Resolve a column name to its index in `ds.columns`. Prefers an exact match,
 * then falls back to a `"<prefix>: <columnName>"` suffix match. Returns -1 if
 * absent. Column counts are small (tens at most), so a direct scan is fine.
 */
export function getColumnIndex(
	ds: Pick<Dataset, "columns">,
	columnName: string,
): number {
	const idx = ds.columns.indexOf(columnName);
	if (idx !== -1) return idx;
	return ds.columns.findIndex((c) => c.endsWith(`: ${columnName}`));
}

/** How an x axis shows this column: categories, dates, or plain numbers. */
export const xModeFor = (col?: DataColumn): XAxisConfig["xMode"] =>
	col?.categoryLabels ? "categorical" : col?.isFloat64 ? "date" : "numeric";
