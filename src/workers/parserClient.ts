import type { ParsedDataset } from "../services/persistence";
import type { ParseSettings } from "../utils/data-parser";
import type { ParserRequest, ParserResponse } from "./parser.worker";
import { WorkerClient } from "./WorkerClient";

const client = new WorkerClient<ParserRequest, ParserResponse, ParsedDataset[]>(
	() =>
		new Worker(new URL("./parser.worker.ts", import.meta.url), {
			type: "module",
		}),
	(data, resolve, reject) => {
		const { type, datasets, error } = data;
		if (type === "success" && datasets) resolve(datasets);
		else reject(new Error(error ?? "Parser worker error"));
	},
);

export function parseDataInWorker(
	file: File,
	type: string,
	settings?: ParseSettings,
): Promise<ParsedDataset[]> {
	return client.request((id) => ({ id, file, type, settings }));
}
