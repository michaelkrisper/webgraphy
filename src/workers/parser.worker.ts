/// <reference lib="webworker" />

import type { Dataset } from "../services/persistence";
import { type ParseSettings, parseData } from "../utils/data-parser";

export interface ParserRequest {
	id: number;
	file: File;
	type: string;
	settings?: ParseSettings;
}

export interface ParserResponse {
	id: number;
	type: "success" | "error";
	datasets?: Dataset[];
	error?: string;
}

function collectTransferables(datasets: Dataset[]): ArrayBuffer[] {
	const buffers: ArrayBuffer[] = [];
	for (const ds of datasets) {
		for (const col of ds.data) {
			buffers.push(col.data.buffer as ArrayBuffer);
		}
	}
	return buffers;
}

self.onmessage = async (ev: MessageEvent<ParserRequest>) => {
	const { id, file, type, settings } = ev.data;
	try {
		const datasets = (await parseData(file, type, settings)) as Dataset[];
		const transferables = collectTransferables(datasets);
		const response: ParserResponse = { id, type: "success", datasets };
		(self as DedicatedWorkerGlobalScope).postMessage(response, transferables);
	} catch (err) {
		const response: ParserResponse = {
			id,
			type: "error",
			error: err instanceof Error ? err.message : String(err),
		};
		(self as DedicatedWorkerGlobalScope).postMessage(response);
	}
};
