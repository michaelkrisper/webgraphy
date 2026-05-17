import type {
	FormulaEvaluationResult,
	FormulaWorkerParams,
} from "../utils/formula";

let worker: Worker | null = null;
let currentResolver:
	| {
			resolve: (value: FormulaEvaluationResult) => void;
			reject: (reason: unknown) => void;
	  }
	| null = null;

function ensureWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("./formula.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = (ev: MessageEvent<FormulaEvaluationResult>) => {
		const r = currentResolver;
		currentResolver = null;
		r?.resolve(ev.data);
	};
	worker.onerror = (ev) => {
		const r = currentResolver;
		currentResolver = null;
		const err = ev instanceof Error ? ev : new Error(ev.message ?? "Worker error");
		r?.reject(err);
	};
	return worker;
}

export function evaluateFormulaInWorker(
	params: FormulaWorkerParams,
): Promise<FormulaEvaluationResult> {
	const w = ensureWorker();
	return new Promise<FormulaEvaluationResult>((resolve, reject) => {
		// Single-flight semantics — the store awaits each formula before issuing
		// the next one, so a queue isn't necessary. Reject any in-flight call if
		// a new one arrives concurrently to surface programmer error early.
		if (currentResolver) {
			currentResolver.reject(new Error("Formula worker preempted"));
		}
		currentResolver = { resolve, reject };
		w.postMessage(params);
	});
}
