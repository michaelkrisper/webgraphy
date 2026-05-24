import type {
	FormulaEvaluationResult,
	FormulaWorkerParams,
} from "../utils/formula";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
	number,
	{
		resolve: (value: FormulaEvaluationResult) => void;
		reject: (reason: unknown) => void;
	}
>();

function ensureWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("./formula.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = (ev: MessageEvent<FormulaEvaluationResult>) => {
		const { id } = ev.data;
		if (id === undefined) return;
		const entry = pending.get(id);
		if (!entry) return;
		pending.delete(id);
		entry.resolve(ev.data);
	};
	worker.onerror = (ev) => {
		const err =
			ev instanceof Error ? ev : new Error(ev.message ?? "Worker error");
		for (const entry of pending.values()) entry.reject(err);
		pending.clear();
	};
	return worker;
}

export function evaluateFormulaInWorker(
	params: FormulaWorkerParams,
): Promise<FormulaEvaluationResult> {
	const id = nextId++;
	const w = ensureWorker();
	return new Promise<FormulaEvaluationResult>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		w.postMessage({ ...params, id });
	});
}
