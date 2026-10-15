import type { ExcelWorkerRequest, ExcelWorkerResponse } from "./excel.worker";
import { WorkerClient } from "./WorkerClient";

type ExcelResult = Omit<ExcelWorkerResponse, "id" | "type" | "error">;

const client = new WorkerClient<
	ExcelWorkerRequest,
	ExcelWorkerResponse,
	ExcelResult
>(
	() =>
		new Worker(new URL("./excel.worker.ts", import.meta.url), { type: "module" }),
	(data, resolve, reject) => {
		const { id, type, error, ...rest } = data;
		void id;
		if (type === "success") resolve(rest);
		else reject(new Error(error ?? "Excel worker error"));
	},
);

/** Parses the workbook in the worker, which keeps it until `closeWorkbookInWorker`. */
export function openWorkbookInWorker(file: File): Promise<ExcelResult> {
	return client.request((id) => ({ id, action: "open", file }));
}

export function previewSheetInWorker(
	bookId: number,
	sheetName: string,
): Promise<ExcelResult> {
	return client.request((id) => ({ id, action: "preview", bookId, sheetName }));
}

export async function sheetCsvInWorker(
	bookId: number,
	sheetName: string,
): Promise<Blob> {
	const { csv } = await client.request((id) => ({
		id,
		action: "csv",
		bookId,
		sheetName,
	}));
	if (!csv) throw new Error("Excel worker returned no CSV");
	return csv;
}

export async function closeWorkbookInWorker(bookId: number): Promise<void> {
	await client.request((id) => ({ id, action: "close", bookId }));
}
