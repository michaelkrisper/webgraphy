import type { ParsedDataset } from "../services/persistence";
import type { ParseSettings } from "../utils/data-parser";
import type { ParserRequest, ParserResponse } from "./parser.worker";
import { WorkerClient } from "./WorkerClient";

const client = new WorkerClient<ParserRequest, ParserResponse, ParserResponse>(
	() =>
		new Worker(new URL("./parser.worker.ts", import.meta.url), {
			type: "module",
		}),
	(data, resolve, reject) => {
		if (data.type === "success") resolve(data);
		else reject(new Error(data.error ?? "Parser worker error"));
	},
);

export async function parseDataInWorker(
	file: File,
	type: string,
	settings?: ParseSettings,
): Promise<ParsedDataset[]> {
	const { datasets } = await client.request((id) => ({
		id,
		file,
		type,
		settings,
	}));
	if (!datasets) throw new Error("Parser worker error");
	return datasets;
}

/** Parses a JSON file in the worker and returns its first `maxRows` records. */
export async function previewJsonInWorker(
	file: File,
	maxRows: number,
): Promise<{ preview: string; previewTruncated: boolean }> {
	const res = await client.request((id) => ({
		id,
		file,
		type: "json",
		previewRows: maxRows,
	}));
	return {
		preview: res.preview ?? "",
		previewTruncated: !!res.previewTruncated,
	};
}
