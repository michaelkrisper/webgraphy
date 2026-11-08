/**
 * Saving and opening files the way a desktop app does: the File System Access
 * pickers (Chromium) where they exist, else a download or a file input.
 *
 * The pickers need the click's user activation, so callers choose the target
 * first and only then build the content: rendering or encoding can take longer
 * than the activation lasts.
 */
import { IMPORT_ACCEPT } from "./importFile";
import { logger } from "./logger";

/** One entry of a picker's type list: MIME type → extensions. */
export interface FileTypeFilter {
	description: string;
	accept: Record<string, string[]>;
}

// Chromium only; not in lib.dom.
interface PickerWindow {
	showSaveFilePicker?: (options: {
		suggestedName?: string;
		types?: FileTypeFilter[];
		id?: string;
	}) => Promise<FileSystemFileHandle>;
	showOpenFilePicker?: (options: {
		types?: FileTypeFilter[];
		multiple?: boolean;
		id?: string;
	}) => Promise<FileSystemFileHandle[]>;
}

/** Picker ids: the browser remembers a last-used folder per id. */
export const WORKSPACE_PICKER_ID = "webgraphy-files";
export const EXPORT_PICKER_ID = "webgraphy-export";

/** Everything the import queue opens (`IMPORT_ACCEPT`), sessions included. */
export const IMPORT_FILE_TYPE: FileTypeFilter = {
	description: "Data files and WebGraphy sessions",
	accept: {
		"text/csv": [".csv"],
		"text/tab-separated-values": [".tsv"],
		"text/plain": [".txt", ".dat"],
		"application/json": [".json"],
		"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [
			".xlsx",
		],
		"application/vnd.ms-excel": [".xls"],
		"application/vnd.oasis.opendocument.spreadsheet": [".ods"],
		"application/x-webgraphy": [".webgraphy"],
	},
};

/**
 * The pickers throw a SecurityError in cross-origin frames; any frame takes
 * the fallback rather than relying on how the embedder set its permissions.
 */
function pickers(): PickerWindow {
	return window.self === window.top ? (window as PickerWindow) : {};
}

const isAbort = (err: unknown) =>
	(err as { name?: unknown } | null)?.name === "AbortError";

/** Triggers a browser download of `blob`. */
export function downloadBlob(blob: Blob, fileName: string): void {
	const url = URL.createObjectURL(blob);
	const a = document.createElement("a");
	a.href = url;
	a.download = fileName;
	document.body.appendChild(a);
	a.click();
	a.remove();
	// The download manager resolves the URL asynchronously after the click;
	// revoking right away can cancel it.
	setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SaveTarget {
	/** The file name: the user's choice in the picker, else the suggested one. */
	readonly name: string;
	write(blob: Blob): Promise<void>;
}

/** A target that downloads under `fileName`, without asking. */
export function downloadTarget(fileName: string): SaveTarget {
	return {
		name: fileName,
		write: async (blob) => downloadBlob(blob, fileName),
	};
}

async function writeHandle(
	handle: FileSystemFileHandle,
	blob: Blob,
): Promise<void> {
	const writable = await handle.createWritable();
	try {
		await writable.write(blob);
		await writable.close();
	} catch (err) {
		await writable.abort().catch(() => {});
		throw err;
	}
}

/**
 * Asks where to save through the save picker, or falls back to a download
 * where there is none. Resolves `null` when the user cancels the picker.
 */
export async function chooseSaveTarget(
	suggestedName: string,
	type: FileTypeFilter,
	id: string = EXPORT_PICKER_ID,
): Promise<SaveTarget | null> {
	const { showSaveFilePicker } = pickers();
	if (showSaveFilePicker) {
		try {
			const handle = await showSaveFilePicker.call(window, {
				suggestedName,
				types: [type],
				id,
			});
			return { name: handle.name, write: (blob) => writeHandle(handle, blob) };
		} catch (err) {
			if (isAbort(err)) return null;
			// E.g. a SecurityError once the click's activation has lapsed.
			logger.warn("Save picker failed; downloading instead", err);
		}
	}
	return downloadTarget(suggestedName);
}

function chooseWithInput(accept: string): Promise<File[] | null> {
	return new Promise((resolve) => {
		const input = document.createElement("input");
		input.type = "file";
		input.accept = accept;
		input.multiple = true;
		input.style.display = "none";
		const done = (files: File[] | null) => {
			input.remove();
			resolve(files);
		};
		input.addEventListener("change", () =>
			done(input.files?.length ? Array.from(input.files) : null),
		);
		input.addEventListener("cancel", () => done(null));
		document.body.appendChild(input);
		input.click();
	});
}

/**
 * Asks for data or session files through the open picker, or a file input
 * where there is none. Resolves `null` when the user cancels.
 */
export async function chooseImportFiles(): Promise<File[] | null> {
	const { showOpenFilePicker } = pickers();
	if (!showOpenFilePicker) return chooseWithInput(IMPORT_ACCEPT);
	let handles: FileSystemFileHandle[];
	try {
		handles = await showOpenFilePicker.call(window, {
			types: [IMPORT_FILE_TYPE],
			multiple: true,
			id: WORKSPACE_PICKER_ID,
		});
	} catch (err) {
		if (isAbort(err)) return null;
		logger.warn("Open picker failed; using a file input instead", err);
		return chooseWithInput(IMPORT_ACCEPT);
	}
	return Promise.all(handles.map((h) => h.getFile()));
}
