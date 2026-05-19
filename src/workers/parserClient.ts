import type { Dataset } from "../services/persistence";
import type { ParseSettings } from "../utils/data-parser";
import type { ParserRequest, ParserResponse } from "./parser.worker";

let worker: Worker | null = null;
let nextId = 1;
const pending = new Map<
	number,
	{ resolve: (value: Dataset[]) => void; reject: (reason: unknown) => void }
>();

function ensureWorker(): Worker {
	if (worker) return worker;
	worker = new Worker(new URL("./parser.worker.ts", import.meta.url), {
		type: "module",
	});
	worker.onmessage = (ev: MessageEvent<ParserResponse>) => {
		const { id, type, datasets, error } = ev.data;
		const entry = pending.get(id);
		if (!entry) return;
		pending.delete(id);
		if (type === "success" && datasets) entry.resolve(datasets);
		else entry.reject(new Error(error ?? "Parser worker error"));
	};
	worker.onerror = (ev) => {
		const err =
			ev instanceof Error ? ev : new Error(ev.message ?? "Worker error");
		for (const entry of pending.values()) entry.reject(err);
		pending.clear();
	};
	return worker;
}

export function parseDataInWorker(
	file: File,
	type: string,
	settings?: ParseSettings,
): Promise<Dataset[]> {
	const id = nextId++;
	const w = ensureWorker();
	return new Promise<Dataset[]>((resolve, reject) => {
		pending.set(id, { resolve, reject });
		const req: ParserRequest = { id, file, type, settings };
		w.postMessage(req);
	});
}
