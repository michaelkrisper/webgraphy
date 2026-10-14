/**
 * Session files (`.webgraphy`): the whole workspace in one file.
 *
 * Layout, gzip-compressed as a whole (CompressionStream, no dependency):
 *
 *   8 B   magic "WEBGRAPH"
 *   u32   format version (little-endian)
 *   u32   header length N in bytes
 *   N B   UTF-8 JSON header: app state + dataset/column metadata
 *   0-3 B zero padding to a 4-byte boundary
 *   ...   column data: raw little-endian Float32 values, each column at the
 *         `offset` its header entry names (relative to this section)
 *
 * Loaded lazily — only the menu actions and `.webgraphy` imports pull it in.
 */
import * as z from "zod/mini";
import {
	type GraphSnapshot,
	latestHistoryId,
	undoIfLatest,
	useGraphStore,
} from "../store/useGraphStore";
import { notify } from "../store/useNotificationStore";
import { confirmReplaceWorkspace } from "../store/useSessionPrompt";
import { SESSION_EXTENSION } from "../utils/importFile";
import { logger } from "../utils/logger";
import {
	ConfigSchema,
	type DataColumn,
	type Dataset,
	parseViewport,
} from "./persistence";

export const SESSION_FORMAT_VERSION = 1;
const MAGIC = "WEBGRAPH";
const PREAMBLE_BYTES = MAGIC.length + 8;

export class SessionError extends Error {}

// Numbers JSON cannot carry exactly (the ±Infinity bounds of an all-NaN
// column) travel as their `String()` form, which also round-trips every double.
// The schemas stick to the zod/mini parts the entry chunk already uses, since
// zod lives in the chunk shared with it.
const encodeNumber = (n: number): string => String(n);
const decodeNumber = Number;

const ColumnSchema = z.object({
	name: z.string(),
	isFloat64: z.boolean(),
	refPoint: z.string(),
	bounds: z.object({ min: z.string(), max: z.string() }),
	formula: z.optional(z.string()),
	categoryLabels: z.optional(z.array(z.string())),
	/** Byte offset into the column data section. */
	offset: z.number(),
	/** Number of Float32 values. */
	length: z.number(),
});

const DatasetSchema = z.object({
	id: z.string(),
	name: z.string(),
	rowCount: z.number(),
	xAxisColumn: z.string(),
	xAxisId: z.string(),
	columns: z.array(ColumnSchema),
});

const HeaderSchema = z.object({
	app: z.string(),
	createdAt: z.string(),
	config: ConfigSchema,
	datasets: z.array(DatasetSchema),
});

/** The viewport is parsed by persistence's repairing parser, not the schema. */
type SessionHeader = z.infer<typeof HeaderSchema> & { viewport: unknown };

export type SessionContent = Omit<GraphSnapshot, "datasets"> & {
	datasets: Dataset[];
};

function streamOf(chunks: Uint8Array[]): ReadableStream<BufferSource> {
	return new ReadableStream({
		start(controller) {
			for (const c of chunks) controller.enqueue(c as BufferSource);
			controller.close();
		},
	});
}

async function transform(
	chunks: Uint8Array[],
	stream: CompressionStream | DecompressionStream,
): Promise<ArrayBuffer> {
	return new Response(streamOf(chunks).pipeThrough(stream)).arrayBuffer();
}

/** Serialises a workspace into the gzip-compressed session format. */
export async function encodeSession(
	content: SessionContent,
	createdAt = new Date(),
): Promise<Uint8Array> {
	const columnBytes: Uint8Array[] = [];
	let offset = 0;
	const datasets: SessionHeader["datasets"] = content.datasets.map((ds) => ({
		id: ds.id,
		name: ds.name,
		rowCount: ds.rowCount,
		xAxisColumn: ds.xAxisColumn,
		xAxisId: ds.xAxisId,
		columns: ds.data.map((col, i) => {
			const bytes = new Uint8Array(
				col.data.buffer,
				col.data.byteOffset,
				col.data.byteLength,
			);
			columnBytes.push(bytes);
			const entry = {
				name: ds.columns[i] ?? `Column ${i + 1}`,
				isFloat64: col.isFloat64,
				refPoint: encodeNumber(col.refPoint),
				bounds: {
					min: encodeNumber(col.bounds.min),
					max: encodeNumber(col.bounds.max),
				},
				...(col.formula !== undefined && { formula: col.formula }),
				...(col.categoryLabels && { categoryLabels: col.categoryLabels }),
				offset,
				length: col.data.length,
			};
			offset += bytes.byteLength;
			return entry;
		}),
	}));
	const header: SessionHeader = {
		app: __APP_VERSION__,
		createdAt: createdAt.toISOString(),
		viewport: { xAxes: content.xAxes, yAxes: content.yAxes },
		config: {
			series: content.series,
			legendVisible: content.legendVisible,
			crosshairVisible: content.crosshairVisible,
		},
		datasets,
	};
	const json = new TextEncoder().encode(JSON.stringify(header));
	const padding = (4 - ((PREAMBLE_BYTES + json.length) % 4)) % 4;
	const preamble = new Uint8Array(PREAMBLE_BYTES + json.length + padding);
	preamble.set(new TextEncoder().encode(MAGIC));
	const view = new DataView(preamble.buffer);
	view.setUint32(MAGIC.length, SESSION_FORMAT_VERSION, true);
	view.setUint32(MAGIC.length + 4, json.length, true);
	preamble.set(json, PREAMBLE_BYTES);
	return new Uint8Array(
		await transform([preamble, ...columnBytes], new CompressionStream("gzip")),
	);
}

const NOT_A_SESSION = "this is not a WebGraphy session file";
const CORRUPT = "the session file is damaged or incomplete";

/** Parses and validates a session file; throws {@link SessionError} with a user-facing reason. */
export async function decodeSession(
	input: ArrayBuffer,
): Promise<SessionContent> {
	let bytes = new Uint8Array(input);
	if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
		try {
			bytes = new Uint8Array(
				await transform([bytes], new DecompressionStream("gzip")),
			);
		} catch {
			throw new SessionError(CORRUPT);
		}
	}
	if (
		bytes.length < PREAMBLE_BYTES ||
		new TextDecoder().decode(bytes.subarray(0, MAGIC.length)) !== MAGIC
	) {
		throw new SessionError(NOT_A_SESSION);
	}
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	const version = view.getUint32(MAGIC.length, true);
	if (version > SESSION_FORMAT_VERSION) {
		throw new SessionError(
			`it was saved by a newer version of WebGraphy (format ${version}) — reload to update the app`,
		);
	}
	if (version < 1) throw new SessionError(CORRUPT);
	const jsonLength = view.getUint32(MAGIC.length + 4, true);
	const jsonEnd = PREAMBLE_BYTES + jsonLength;
	if (jsonEnd > bytes.length) throw new SessionError(CORRUPT);

	let raw: unknown;
	try {
		raw = JSON.parse(
			new TextDecoder("utf-8", { fatal: true }).decode(
				bytes.subarray(PREAMBLE_BYTES, jsonEnd),
			),
		);
	} catch {
		throw new SessionError(CORRUPT);
	}
	const parsed = HeaderSchema.safeParse(raw);
	if (!parsed.success) {
		logger.error("Invalid session header", { error: parsed.error });
		throw new SessionError(CORRUPT);
	}
	const header = parsed.data;

	const dataStart = jsonEnd + ((4 - (jsonEnd % 4)) % 4);
	const dataBytes = bytes.length - dataStart;
	const ids = new Set<string>();
	const datasets = header.datasets.map((ds): Dataset => {
		if (ids.has(ds.id)) throw new SessionError(CORRUPT);
		ids.add(ds.id);
		if (
			!Number.isInteger(ds.rowCount) ||
			ds.rowCount < 0 ||
			!ds.columns.some((c) => c.name === ds.xAxisColumn)
		)
			throw new SessionError(CORRUPT);
		return {
			id: ds.id,
			name: ds.name,
			rowCount: ds.rowCount,
			xAxisColumn: ds.xAxisColumn,
			xAxisId: ds.xAxisId,
			columns: ds.columns.map((c) => c.name),
			data: ds.columns.map((c): DataColumn => {
				const end = c.offset + c.length * 4;
				if (
					!Number.isInteger(c.offset) ||
					!Number.isInteger(c.length) ||
					c.offset < 0 ||
					c.length < 0 ||
					c.offset % 4 ||
					end > dataBytes
				)
					throw new SessionError(CORRUPT);
				// A copy per column: workers may transfer a column's buffer, which
				// must not detach its neighbours.
				const start = bytes.byteOffset + dataStart + c.offset;
				const col: DataColumn = {
					isFloat64: c.isFloat64,
					refPoint: decodeNumber(c.refPoint),
					bounds: {
						min: decodeNumber(c.bounds.min),
						max: decodeNumber(c.bounds.max),
					},
					data: new Float32Array(
						bytes.buffer.slice(start, start + c.length * 4) as ArrayBuffer,
					),
				};
				if (c.formula !== undefined) col.formula = c.formula;
				if (c.categoryLabels) col.categoryLabels = c.categoryLabels;
				return col;
			}),
		};
	});
	return {
		...parseViewport((raw as { viewport?: unknown }).viewport),
		...header.config,
		datasets,
	};
}

const count = (n: number, one: string, many: string) =>
	`${n.toLocaleString()} ${n === 1 ? one : many}`;

function summarize(content: Pick<SessionContent, "datasets" | "series">) {
	return `${count(content.datasets.length, "dataset", "datasets")}, ${count(content.series.length, "series", "series")}`;
}

const errorMessage = (err: unknown) =>
	err instanceof Error ? err.message : String(err);

function download(bytes: Uint8Array, fileName: string): void {
	const url = URL.createObjectURL(
		new Blob([bytes as Uint8Array<ArrayBuffer>], {
			type: "application/octet-stream",
		}),
	);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// Revoking right away can cancel the download in some browsers.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function sessionFileName(now = new Date()): string {
	const pad = (n: number) => String(n).padStart(2, "0");
	const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
	return `webgraphy-${stamp}.${SESSION_EXTENSION}`;
}

/** "Save session…": downloads the current workspace as a `.webgraphy` file. */
export async function saveSession(): Promise<void> {
	const s = useGraphStore.getState();
	if (s.datasets.length === 0) {
		notify({
			kind: "info",
			message: "Nothing to save — import some data first.",
		});
		return;
	}
	try {
		const bytes = await encodeSession(s);
		const name = sessionFileName();
		download(bytes, name);
		notify({
			kind: "success",
			message: `Saved session "${name}" (${summarize(s)})`,
		});
	} catch (err) {
		logger.error("Failed to save session", { error: err });
		notify({
			kind: "error",
			message: `Could not save the session: ${errorMessage(err)}`,
		});
	}
}

/**
 * Opens a `.webgraphy` file: validates it, asks before replacing a non-empty
 * workspace, and swaps it in as one undoable step. Resolves whether it loaded.
 */
export async function openSession(file: File): Promise<boolean> {
	let content: SessionContent;
	try {
		content = await decodeSession(await file.arrayBuffer());
	} catch (err) {
		notify({
			kind: "error",
			message: `Could not open session "${file.name}": ${errorMessage(err)}`,
		});
		return false;
	}
	const current = useGraphStore.getState();
	if (
		(current.datasets.length > 0 || current.series.length > 0) &&
		!(await confirmReplaceWorkspace(file.name, summarize(content)))
	) {
		return false;
	}
	const before = latestHistoryId();
	useGraphStore
		.getState()
		.replaceWorkspace(content, `open session '${file.name}'`);
	const id = latestHistoryId();
	notify({
		kind: "success",
		message: `Opened session "${file.name}" (${summarize(content)})`,
		...(id !== undefined &&
			id !== before && {
				action: { label: "Undo", onAction: () => undoIfLatest(id) },
			}),
	});
	return true;
}
