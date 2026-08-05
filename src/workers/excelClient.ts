import type { ExcelWorkerRequest, ExcelWorkerResponse } from "./excel.worker";
import { WorkerClient } from "./WorkerClient";

const client = new WorkerClient<
	ExcelWorkerRequest,
	ExcelWorkerResponse,
	Omit<ExcelWorkerResponse, "id" | "type">
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

export function readExcelFileInWorker(
	file: File,
): Promise<Omit<ExcelWorkerResponse, "id" | "type">> {
	return client.request((id) => ({ id, action: "read", file }));
}

export function changeSheetInWorker(
	workbookData: ArrayBuffer,
	sheetName: string,
): Promise<Omit<ExcelWorkerResponse, "id" | "type">> {
	return client.request(
		(id) => ({ id, action: "changeSheet", workbookData, sheetName }),
		[workbookData],
	);
}
