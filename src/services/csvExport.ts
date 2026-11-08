import type {
	dismissNotification,
	notify,
} from "../store/useNotificationStore";
import {
	type CsvTable,
	csvChunks,
	csvFileName,
	csvRowCount,
	datasetCsvTable,
	visibleCsvTables,
} from "../utils/csv-export";
import {
	chooseSaveTarget,
	downloadTarget,
	type FileTypeFilter,
} from "../utils/fileAccess";
import type { Dataset, SeriesConfig, XAxisConfig } from "./persistence";

/** Main-thread budget per slice before yielding to input and paint. */
const SLICE_MS = 12;
const ROWS_PER_CHUNK = 1000;
/** Exports above this many rows show a progress toast while they build. */
const PROGRESS_TOAST_ROWS = 200_000;

/**
 * Toast functions, passed in by the caller. Importing the store here would
 * make this lazy chunk depend on zustand/React from the entry, and the
 * bundler answers that by splitting React out of the entry chunk.
 */
export interface ExportFeedback {
	notify: typeof notify;
	dismiss: typeof dismissNotification;
}

const yieldToMain = () => new Promise<void>((r) => setTimeout(r, 0));

/**
 * Builds the CSV as Blob parts in time slices. The columns are read straight
 * from the store's typed arrays, so a worker would first need a full copy of
 * them (transferring would detach the store's buffers); slicing keeps the UI
 * responsive without that copy, and the Blob never holds one giant string.
 */
export async function buildCsvBlob(table: CsvTable): Promise<Blob> {
	const parts: string[] = [];
	let deadline = performance.now() + SLICE_MS;
	for (const chunk of csvChunks(table, { rowsPerChunk: ROWS_PER_CHUNK })) {
		parts.push(chunk);
		if (performance.now() >= deadline) {
			await yieldToMain();
			deadline = performance.now() + SLICE_MS;
		}
	}
	return new Blob(parts, { type: "text/csv;charset=utf-8" });
}

export const CSV_FILE_TYPE: FileTypeFilter = {
	description: "CSV file",
	accept: { "text/csv": [".csv"] },
};

/**
 * Saves one table where the user picks (`ask`) or as a download. Cancelling
 * the picker is silent.
 */
async function exportTable(
	table: CsvTable,
	fileName: string,
	{ notify, dismiss }: ExportFeedback,
	ask = true,
): Promise<void> {
	const rows = csvRowCount(table);
	let progress: string | null = null;
	try {
		// Asked before building, which can outlast the click's user activation.
		const target = ask
			? await chooseSaveTarget(fileName, CSV_FILE_TYPE)
			: downloadTarget(fileName);
		if (!target) return;
		if (rows >= PROGRESS_TOAST_ROWS) {
			progress = notify({
				kind: "info",
				message: `Exporting ${rows.toLocaleString()} rows to ${target.name}…`,
				durationMs: 0,
			});
		}
		await target.write(await buildCsvBlob(table));
		notify({
			kind: "success",
			message: `Exported ${rows.toLocaleString()} rows to ${target.name}`,
		});
	} catch (err) {
		notify({
			kind: "error",
			message: `CSV export failed: ${err instanceof Error ? err.message : String(err)}`,
		});
	} finally {
		if (progress) dismiss(progress);
	}
}

/** The whole dataset, calculated columns included. */
export function exportDatasetCsv(
	ds: Dataset,
	feedback: ExportFeedback,
): Promise<void> {
	return exportTable(datasetCsvTable(ds), csvFileName(ds.name), feedback);
}

/**
 * The plotted columns of every dataset with a visible series, restricted to
 * its x-axis's current range. One file per dataset: they have different x
 * columns and row sets, so a single rectangular CSV cannot hold them. Only a
 * single file goes through the save picker: a second picker would no longer
 * have the click's user activation, so several files download instead.
 */
export async function exportVisibleCsv(
	input: {
		series: readonly SeriesConfig[];
		datasets: readonly Dataset[];
		xAxes: readonly XAxisConfig[];
	},
	feedback: ExportFeedback,
): Promise<void> {
	const tables = visibleCsvTables(input).filter((t) => csvRowCount(t.table) > 0);
	if (tables.length === 0) {
		feedback.notify({
			kind: "info",
			message: "No plotted data in the visible range",
		});
		return;
	}
	const ask = tables.length === 1;
	for (const { dataset, table } of tables) {
		await exportTable(
			table,
			csvFileName(dataset.name, "-visible"),
			feedback,
			ask,
		);
	}
}
