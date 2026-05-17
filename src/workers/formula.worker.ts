/// <reference lib="webworker" />

import {
	evaluateFormulaSync,
	type FormulaEvaluationResult,
	type FormulaWorkerParams,
} from "../utils/formula";

self.onmessage = (ev: MessageEvent<FormulaWorkerParams>) => {
	const params = ev.data;
	try {
		const result = evaluateFormulaSync(params);
		const transferables: ArrayBuffer[] = [];
		if (result.newColumn) transferables.push(result.newColumn.data.buffer as ArrayBuffer);
		if (result.sparseXColumn)
			transferables.push(result.sparseXColumn.data.buffer as ArrayBuffer);
		(self as DedicatedWorkerGlobalScope).postMessage(result, transferables);
	} catch (err) {
		const response: FormulaEvaluationResult = {
			type: "error",
			error: err instanceof Error ? err.message : String(err),
		};
		(self as DedicatedWorkerGlobalScope).postMessage(response);
	}
};
