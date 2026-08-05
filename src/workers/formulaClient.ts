import type {
	FormulaEvaluationResult,
	FormulaWorkerParams,
} from "../utils/formula";
import { WorkerClient } from "./WorkerClient";

const client = new WorkerClient<
	FormulaWorkerParams & { id: number },
	FormulaEvaluationResult,
	FormulaEvaluationResult
>(
	() =>
		new Worker(new URL("./formula.worker.ts", import.meta.url), {
			type: "module",
		}),
	(data, resolve) => {
		resolve(data);
	},
);

export function evaluateFormulaInWorker(
	params: FormulaWorkerParams,
): Promise<FormulaEvaluationResult> {
	return client.request((id) => ({ ...params, id }));
}
