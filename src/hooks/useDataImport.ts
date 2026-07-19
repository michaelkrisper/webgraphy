import { useCallback, useState } from "react";
import type { ParsedDataset, SeriesConfig } from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import type { ImportSettings } from "../types/import";
import { buildSeriesConfig } from "../utils/series";
import { parseDataInWorker } from "../workers/parserClient";
import { readExcelFileInWorker, changeSheetInWorker } from "../workers/excelClient";

const AUTO_ADD_COLUMN_THRESHOLD = 5;

export type PendingFile = {
	file: File;
	preview: string;
	fullCsv?: string; // full CSV for Excel import (preview is truncated)
	type: "csv" | "json" | "excel";
	sheets?: string[];
	selectedSheet?: string;
	workbookData?: ArrayBuffer;
};

const readTextFile = (
	file: File,
	type: "csv" | "json",
): Promise<PendingFile> => {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = (e) => {
			const preview = e.target?.result as string;
			resolve({ file, preview, type });
		};
		reader.onerror = () => reject(new Error("Failed to read file."));
		reader.readAsText(file);
	});
};

const processImportedDatasets = (
	incoming: ParsedDataset[],
	addDataset: (ds: ParsedDataset) => void,
	addSeries: (series: SeriesConfig) => void,
) => {
	const isSplitImport = incoming.length > 1;

	for (const ds of incoming) {
		addDataset(ds);

		if (!isSplitImport && ds.columns.length <= AUTO_ADD_COLUMN_THRESHOLD) {
			const seriesBeforeAdd = useGraphStore.getState().series;
			const nonXColumns = ds.columns
				.filter((c) => c !== ds.xAxisColumn)
				.slice(0, 4);
			nonXColumns.forEach((col, i) => {
				const colIdx = ds.columns.indexOf(col);
				const isCategorical = colIdx >= 0 && !!ds.data[colIdx]?.categoryLabels;
				addSeries(
					buildSeriesConfig(
						col,
						ds.id,
						seriesBeforeAdd.length + i,
						isCategorical,
					),
				);
			});
		}
	}
};

/**
 * Hook to manage data import logic without workers.
 */
export const useDataImport = () => {
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
	const addDataset = useGraphStore((s) => s.addDataset);
	const addSeries = useGraphStore((s) => s.addSeries);

	const initiateImport = useCallback(async (file: File) => {
		setError(null);

		try {
			if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
				const res = await readExcelFileInWorker(file);
				setPendingFile({
					file,
					preview: res.preview || "",
					fullCsv: res.fullCsv,
					type: "excel",
					sheets: res.sheets,
					selectedSheet: res.selectedSheet,
					workbookData: res.workbookData,
				});
			} else {
				const type = file.name.endsWith(".csv") ? "csv" : "json";
				const pendingFile = await readTextFile(file, type);
				setPendingFile(pendingFile);
			}
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, []);

	const changeSheet = useCallback(async (sheetName: string) => {
		if (!pendingFile || pendingFile.type !== "excel" || !pendingFile.workbookData) return;
		try {
			const res = await changeSheetInWorker(pendingFile.workbookData, sheetName);
			setPendingFile((prev) => {
				if (!prev) return prev;
				return {
					...prev,
					selectedSheet: sheetName,
					preview: res.preview || "",
					fullCsv: res.fullCsv,
					workbookData: res.workbookData,
				};
			});
		} catch (err: unknown) {
			setError(err instanceof Error ? err.message : String(err));
		}
	}, [pendingFile]);

	const confirmImport = useCallback(
		async (settings: ImportSettings) => {
			if (!pendingFile) return;
			setIsImporting(true);
			setError(null);

			const { file, type, preview, fullCsv } = pendingFile;
			let workerFile = file;
			let workerType = type;

			if (type === "excel") {
				workerFile = new File([fullCsv ?? preview], `${file.name}.csv`, {
					type: "text/csv",
				});
				workerType = "csv";
			}

			try {
				const datasets = await parseDataInWorker(
					workerFile,
					workerType,
					settings,
				);
				const incoming = datasets ?? [];

				processImportedDatasets(incoming, addDataset, addSeries);

				setIsImporting(false);
				setPendingFile(null);
			} catch (err: unknown) {
				setError(err instanceof Error ? err.message : String(err));
				setIsImporting(false);
			}
		},
		[pendingFile, addDataset, addSeries],
	);

	const cancelImport = useCallback(() => {
		setPendingFile(null);
	}, []);

	return {
		importFile: initiateImport,
		confirmImport,
		cancelImport,
		changeSheet,
		pendingFile,
		isImporting,
		error,
	};
};
