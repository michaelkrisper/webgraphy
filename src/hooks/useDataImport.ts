import { useCallback, useState } from "react";
import { type Dataset, persistence } from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import type { ImportSettings } from "../types/import";
import { buildSeriesConfig } from "../utils/series";
import { parseData } from "../utils/data-parser";

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
		type: "csv" | "json" | "excel";
		sheets?: string[];
		selectedSheet?: string;
		workbook?: any;
	} | null>(null);
	const { addDataset, addSeries } = useGraphStore();

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
					const preview = XLSX.utils.sheet_to_csv(workbook.Sheets[selectedSheet]);
					
					setPendingFile({
						file,
						preview,
						type: "excel",
						sheets,
						selectedSheet,
						workbook,
					});
				} catch (err) {
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
			const preview = XLSX.utils.sheet_to_csv(prev.workbook.Sheets[sheetName]);
			return { ...prev, selectedSheet: sheetName, preview };
		});
	}, []);

	const confirmImport = useCallback(
		async (settings: ImportSettings) => {
			if (!pendingFile) return;
			setIsImporting(true);
			setError(null);

			const { file, type, preview } = pendingFile;
			let workerFile = file;
			let workerType = type;

			if (type === "excel") {
				workerFile = new File([preview], file.name + ".csv", { type: "text/csv" });
				workerType = "csv";
			}

			try {
				// To keep UI responsive during parsing of large files, we use a small timeout to allow
				// the "isImporting" state to render before blocking the main thread.
				await new Promise(resolve => setTimeout(resolve, 10));
				
				const datasets = await parseData(workerFile, workerType, settings);
				const incoming = (datasets as Dataset[]) || [];
				const isSplitImport = incoming.length > 1;
				
				for (const raw of incoming) {
					const currentState = useGraphStore.getState();
					const ds = processImportedDataset(
						raw,
						currentState.datasets.length,
					);

					await persistence.saveDataset(ds);
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
			} catch (err: any) {
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
