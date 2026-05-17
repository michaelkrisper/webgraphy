import { useCallback, useState } from "react";
import type { WorkBook } from "xlsx";
import type { Dataset } from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import type { ImportSettings } from "../types/import";
import { buildSeriesConfig } from "../utils/series";
import { parseDataInWorker } from "../workers/parserClient";

const AUTO_ADD_COLUMN_THRESHOLD = 5;

const processImportedDataset = (ds: Dataset, currentDatasetsLength: number) => {
	const letter = String.fromCharCode(65 + currentDatasetsLength);
	const prefix = `${letter}: `;
	ds.name = `${letter} - ${ds.name}`;
	ds.columns = ds.columns.map((c) => `${prefix}${c}`);
	if (ds.xAxisColumn) {
		ds.xAxisColumn = `${prefix}${ds.xAxisColumn}`;
	}
	return ds;
};

/**
 * Hook to manage data import logic without workers.
 */
export const useDataImport = () => {
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<{
		file: File;
		preview: string;
		fullCsv?: string; // full CSV for Excel import (preview is truncated)
		type: "csv" | "json" | "excel";
		sheets?: string[];
		selectedSheet?: string;
		workbook?: WorkBook;
	} | null>(null);
	const addDataset = useGraphStore((s) => s.addDataset);
	const addSeries = useGraphStore((s) => s.addSeries);

	const initiateImport = useCallback(async (file: File) => {
		setError(null);

		if (file.name.endsWith(".xlsx") || file.name.endsWith(".xls")) {
			const XLSX = await import("xlsx");
			const reader = new FileReader();
			reader.onload = (e) => {
				try {
					const data = new Uint8Array(e.target?.result as ArrayBuffer);
					const workbook = XLSX.read(data, { type: "array" });
					const sheets = workbook.SheetNames;
					const selectedSheet = sheets[0];
					const fullCsv = XLSX.utils.sheet_to_csv(
						workbook.Sheets[selectedSheet],
					);
					const preview = fullCsv.split("\n").slice(0, 500).join("\n");

					setPendingFile({
						file,
						preview,
						fullCsv,
						type: "excel",
						sheets,
						selectedSheet,
						workbook,
					});
				} catch {
					setError("Failed to parse Excel file.");
				}
			};
			reader.onerror = () => setError("Failed to read file.");
			reader.readAsArrayBuffer(file);
			return;
		}

		const type = file.name.endsWith(".csv") ? "csv" : "json";

		// Read preview (first 10KB)
		const reader = new FileReader();
		reader.onload = (e) => {
			const preview = e.target?.result as string;
			setPendingFile({ file, preview, type });
		};
		reader.readAsText(file.slice(0, 25600));
	}, []);

	const changeSheet = useCallback(async (sheetName: string) => {
		const XLSX = await import("xlsx");
		setPendingFile((prev) => {
			if (!prev || prev.type !== "excel" || !prev.workbook) return prev;
			const fullCsv = XLSX.utils.sheet_to_csv(prev.workbook.Sheets[sheetName]);
			const preview = fullCsv.split("\n").slice(0, 500).join("\n");
			return { ...prev, selectedSheet: sheetName, preview, fullCsv };
		});
	}, []);

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
				const incoming = (datasets as Dataset[]) || [];
				const isSplitImport = incoming.length > 1;

				for (const raw of incoming) {
					const currentState = useGraphStore.getState();
					const ds = processImportedDataset(raw, currentState.datasets.length);

					addDataset(ds);

					if (
						!isSplitImport &&
						ds.columns.length <= AUTO_ADD_COLUMN_THRESHOLD
					) {
						const seriesBeforeAdd = useGraphStore.getState().series;
						const nonXColumns = ds.columns
							.filter((c) => c !== ds.xAxisColumn)
							.slice(0, 4);
						nonXColumns.forEach((col, i) => {
							const colIdx = ds.columns.indexOf(col);
							const isCategorical =
								colIdx >= 0 && !!ds.data[colIdx]?.categoryLabels;
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
