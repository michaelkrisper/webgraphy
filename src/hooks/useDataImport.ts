import { useCallback, useRef, useState } from "react";
import type { ParsedDataset, SeriesConfig } from "../services/persistence";
import { useGraphStore, withHistory } from "../store/useGraphStore";
import { notify } from "../store/useNotificationStore";
import type { ImportSettings } from "../types/import";
import {
	defaultDelimiterFor,
	IMPORT_ACCEPT,
	type ImportFileType,
	importFileType,
	readTextHead,
} from "../utils/importFile";
import { buildSeriesForColumns } from "../utils/series";
import {
	parseDataInWorker,
	previewJsonInWorker,
} from "../workers/parserClient";
import {
	closeWorkbookInWorker,
	openWorkbookInWorker,
	previewSheetInWorker,
	sheetCsvInWorker,
} from "../workers/excelClient";

const AUTO_ADD_COLUMN_THRESHOLD = 5;
/** Matches the head + tail rows the import dialog's preview table shows. */
const JSON_PREVIEW_ROWS = 50;

export type PendingFile = {
	/** Distinct per opened file, so the dialog remounts with fresh settings. */
	id: number;
	file: File;
	preview: string;
	/** `preview` holds only the start of the data. */
	previewTruncated: boolean;
	type: Exclude<ImportFileType, "session">;
	defaultDelimiter?: string;
	sheets?: string[];
	selectedSheet?: string;
	/** Workbook handle held by the excel worker until confirm/cancel. */
	bookId?: number;
};

let nextPendingId = 1;

function openSessionFile(file: File): void {
	import("../services/session")
		.then((m) => m.openSession(file))
		.catch((err) => {
			notify({
				kind: "error",
				message: `Could not open session "${file.name}": ${errorMessage(err)}`,
			});
		});
}

const errorMessage = (err: unknown) =>
	err instanceof Error ? err.message : String(err);

async function openFile(
	file: File,
	type: ImportFileType | null,
): Promise<PendingFile> {
	if (!type || type === "session") {
		throw new Error(
			`unsupported file type. Supported: ${IMPORT_ACCEPT.split(",").join(", ")}`,
		);
	}
	const id = nextPendingId++;
	if (type === "excel") {
		const res = await openWorkbookInWorker(file);
		return {
			id,
			file,
			type,
			preview: res.preview ?? "",
			previewTruncated: !!res.previewTruncated,
			sheets: res.sheets,
			selectedSheet: res.selectedSheet,
			bookId: res.bookId,
		};
	}
	if (type === "json") {
		const res = await previewJsonInWorker(file, JSON_PREVIEW_ROWS);
		return { id, file, type, ...res };
	}
	const { text, truncated } = await readTextHead(file);
	return {
		id,
		file,
		type,
		preview: text,
		previewTruncated: truncated,
		defaultDelimiter: defaultDelimiterFor(file.name),
	};
}

function importSummary(fileName: string, datasets: ParsedDataset[]): string {
	if (datasets.length === 1) {
		const { rowCount, columns } = datasets[0];
		return `Imported "${fileName}": ${rowCount.toLocaleString()} rows, ${columns.length} columns`;
	}
	const rows = datasets.reduce((n, ds) => n + ds.rowCount, 0);
	return `Imported "${fileName}" as ${datasets.length} datasets (${rows.toLocaleString()} rows)`;
}

const processImportedDatasets = (
	incoming: ParsedDataset[],
	addDataset: (ds: ParsedDataset) => void,
	addSeries: (series: SeriesConfig) => void,
) => {
	const isSplitImport = incoming.length > 1;

	for (const ds of incoming) {
		addDataset(ds);

		if (!isSplitImport && ds.columns.length <= AUTO_ADD_COLUMN_THRESHOLD) {
			const { series, yAxes } = useGraphStore.getState();
			const nonXColumns = ds.columns
				.filter((c) => c !== ds.xAxisColumn)
				.slice(0, 4);
			for (const s of buildSeriesForColumns(ds, nonXColumns, series, yAxes)) {
				addSeries(s);
			}
		}
	}
};

/**
 * Drives the import flow: files are queued and opened one at a time into
 * `pendingFile` (shown by the import dialog), parsed by the worker on confirm,
 * and every failure or success is reported as a toast.
 */
export const useDataImport = () => {
	const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
	const [isImporting, setIsImporting] = useState(false);
	const addDataset = useGraphStore((s) => s.addDataset);
	const addSeries = useGraphStore((s) => s.addSeries);

	const queueRef = useRef<File[]>([]);
	// Set while a file is opening or its dialog is open, so further files
	// wait in the queue instead of replacing the dialog.
	const busyRef = useRef(false);
	// Guards against a second confirm before `isImporting` has re-rendered.
	const importingRef = useRef(false);

	const openNext = useCallback(async () => {
		for (;;) {
			const file = queueRef.current.shift();
			if (!file) {
				busyRef.current = false;
				return;
			}
			const type = importFileType(file.name);
			if (type === "session") {
				// Sessions replace the workspace instead of adding to it, with
				// their own confirmation; the queue moves on meanwhile.
				openSessionFile(file);
				continue;
			}
			busyRef.current = true;
			try {
				setPendingFile(await openFile(file, type));
				return;
			} catch (err) {
				notify({
					kind: "error",
					message: `Could not open "${file.name}": ${errorMessage(err)}`,
				});
			}
		}
	}, []);

	const importFiles = useCallback(
		(files: ArrayLike<File>): Promise<void> => {
			const list = Array.from(files);
			if (list.length === 0) return Promise.resolve();
			queueRef.current.push(...list);
			if (list.length > 1) {
				notify({
					kind: "info",
					message: `${list.length} files will be imported one after another`,
				});
			}
			return busyRef.current ? Promise.resolve() : openNext();
		},
		[openNext],
	);

	const finish = useCallback(
		(done: PendingFile) => {
			if (done.bookId !== undefined) {
				closeWorkbookInWorker(done.bookId).catch(() => {});
			}
			setPendingFile(null);
			return openNext();
		},
		[openNext],
	);

	const changeSheet = useCallback(
		async (sheetName: string) => {
			const current = pendingFile;
			if (current?.type !== "excel" || current.bookId === undefined) return;
			try {
				const res = await previewSheetInWorker(current.bookId, sheetName);
				setPendingFile((prev) =>
					prev?.id === current.id
						? {
								...prev,
								selectedSheet: sheetName,
								preview: res.preview ?? "",
								previewTruncated: !!res.previewTruncated,
							}
						: prev,
				);
			} catch (err) {
				notify({
					kind: "error",
					message: `Could not load sheet "${sheetName}" of "${current.file.name}": ${errorMessage(err)}`,
				});
			}
		},
		[pendingFile],
	);

	const confirmImport = useCallback(
		async (settings: ImportSettings) => {
			const current = pendingFile;
			if (!current || importingRef.current) return;
			importingRef.current = true;
			setIsImporting(true);

			try {
				let workerFile = current.file;
				let workerType: string = current.type;
				if (current.type === "excel") {
					if (current.bookId === undefined || !current.selectedSheet) {
						throw new Error("the workbook is not loaded");
					}
					const csv = await sheetCsvInWorker(current.bookId, current.selectedSheet);
					workerFile = new File([csv], `${current.file.name}.csv`, {
						type: "text/csv",
					});
					workerType = "csv";
				}

				const datasets = await parseDataInWorker(workerFile, workerType, settings);
				if (datasets.length === 0) throw new Error("no data found");
				withHistory(`import '${current.file.name}'`, () =>
					processImportedDatasets(datasets, addDataset, addSeries),
				);
				notify({
					kind: "success",
					message: importSummary(current.file.name, datasets),
				});
			} catch (err) {
				// The dialog stays open so the settings can be adjusted and retried.
				notify({
					kind: "error",
					message: `Could not import "${current.file.name}": ${errorMessage(err)}`,
				});
				return;
			} finally {
				importingRef.current = false;
				setIsImporting(false);
			}
			await finish(current);
		},
		[pendingFile, addDataset, addSeries, finish],
	);

	const cancelImport = useCallback(() => {
		if (!pendingFile || importingRef.current) return;
		void finish(pendingFile);
	}, [pendingFile, finish]);

	return {
		importFiles,
		confirmImport,
		cancelImport,
		changeSheet,
		pendingFile,
		isImporting,
	};
};
