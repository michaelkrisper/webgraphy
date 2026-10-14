export type ImportFileType = "csv" | "json" | "excel";

const TYPE_BY_EXTENSION: Record<string, ImportFileType> = {
	csv: "csv",
	tsv: "csv",
	txt: "csv",
	dat: "csv",
	json: "json",
	xlsx: "excel",
	xls: "excel",
	ods: "excel",
};

/** Value for the file input's `accept` attribute. */
export const IMPORT_ACCEPT = Object.keys(TYPE_BY_EXTENSION)
	.map((ext) => `.${ext}`)
	.join(",");

/** Enough lines for delimiter/type detection and the preview table. */
export const PREVIEW_HEAD_BYTES = 256 * 1024;

function extensionOf(name: string): string {
	const dot = name.lastIndexOf(".");
	return dot < 0 ? "" : name.slice(dot + 1).toLowerCase();
}

/** Routes by lower-cased extension; `null` for anything we cannot parse. */
export function importFileType(name: string): ImportFileType | null {
	return TYPE_BY_EXTENSION[extensionOf(name)] ?? null;
}

export function defaultDelimiterFor(name: string): string | undefined {
	return extensionOf(name) === "tsv" ? "\t" : undefined;
}

/**
 * Reads at most `maxBytes` from the start of `file`, cut back to the last
 * complete line when the file is larger, so the preview never shows a partial
 * row (or a code point split by the byte slice).
 */
export async function readTextHead(
	file: Blob,
	maxBytes = PREVIEW_HEAD_BYTES,
): Promise<{ text: string; truncated: boolean }> {
	if (file.size <= maxBytes)
		return { text: await file.text(), truncated: false };
	const head = await file.slice(0, maxBytes).text();
	const cut = head.lastIndexOf("\n");
	return { text: cut > 0 ? head.slice(0, cut) : head, truncated: true };
}
