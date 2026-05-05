import { useCallback, useState } from "react";
import { type Dataset, persistence } from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import type { ImportSettings } from "../types/import";
import { buildSeriesConfig } from "../utils/series";

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
 * Hook to manage data import logic and worker communication.
 */
export const useDataImport = () => {
	const [isImporting, setIsImporting] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [pendingFile, setPendingFile] = useState<{
		file: File;
		preview: string;
		type: "csv" | "json";
	} | null>(null);
	const { addDataset, addSeries } = useGraphStore();

	const initiateImport = useCallback(async (file: File) => {
		setError(null);
		const type = file.name.endsWith(".csv") ? "csv" : "json";

		// Read preview (first 10KB)
		const reader = new FileReader();
		reader.onload = (e) => {
			const preview = e.target?.result as string;
			setPendingFile({ file, preview, type });
		};
		reader.readAsText(file.slice(0, 25600));
	}, []);

	const confirmImport = useCallback(
		async (settings: ImportSettings) => {
			if (!pendingFile) return;
			setIsImporting(true);
			setError(null);

			const { file, type } = pendingFile;
			const worker = new Worker(
				new URL("../workers/data-parser.worker.ts", import.meta.url),
				{
					type: "module",
				},
			);

			worker.onmessage = async (event) => {
				const { type: msgType, datasets, error: msgError } = event.data;

				if (msgType === "success") {
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
					worker.terminate();
				} else if (msgType === "error") {
					setError(msgError);
					setIsImporting(false);
					worker.terminate();
				}
			};

			worker.postMessage({ file, type, settings });
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
		pendingFile,
		isImporting,
		error,
	};
};
