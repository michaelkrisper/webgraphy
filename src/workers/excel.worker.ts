/// <reference lib="webworker" />

import { type ExcelWorkerRequest, handleExcelRequest } from "./excelHandler";

export type { ExcelWorkerRequest, ExcelWorkerResponse } from "./excelHandler";

self.onmessage = async (ev: MessageEvent<ExcelWorkerRequest>) => {
	(self as DedicatedWorkerGlobalScope).postMessage(
		await handleExcelRequest(ev.data),
	);
};
