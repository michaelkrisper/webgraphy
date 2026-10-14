import type { WorkBook, WorkSheet } from "xlsx";

export type ExcelWorkerRequest =
	| { id: number; action: "open"; file: File }
	| { id: number; action: "preview"; bookId: number; sheetName: string }
	| { id: number; action: "csv"; bookId: number; sheetName: string }
	| { id: number; action: "close"; bookId: number };

export interface ExcelWorkerResponse {
	id: number;
	type: "success" | "error";
	/** Handle of the workbook kept parsed in the worker until `close`. */
	bookId?: number;
	sheets?: string[];
	selectedSheet?: string;
	preview?: string;
	previewTruncated?: boolean;
	csv?: Blob;
	error?: string;
}

/**
 * Spreadsheets are zip archives that SheetJS inflates fully into JS objects,
 * so memory use is a large multiple of the file size; refuse early instead of
 * letting the worker run the tab out of memory.
 */
export const MAX_WORKBOOK_BYTES = 100 * 1024 * 1024;
export const PREVIEW_ROWS = 500;

type XLSXModule = typeof import("xlsx");

let xlsx: Promise<XLSXModule> | null = null;
const loadXLSX = () => {
	xlsx ??= import("xlsx");
	return xlsx;
};

// Parsed once per pending import and reused for every sheet switch and the
// final CSV export, instead of shipping and re-parsing the raw bytes each time.
const books = new Map<number, WorkBook>();
let nextBookId = 1;

function getSheet(bookId: number, sheetName: string): WorkSheet {
	const book = books.get(bookId);
	if (!book) {
		throw new Error(
			"The workbook is no longer loaded. Please import the file again.",
		);
	}
	const sheet = sheetName ? book.Sheets[sheetName] : undefined;
	if (!sheet) throw new Error(`Sheet "${sheetName}" not found in the workbook.`);
	return sheet;
}

function sheetPreview(
	XLSX: XLSXModule,
	sheet: WorkSheet,
): { preview: string; previewTruncated: boolean } {
	const ref = sheet["!ref"];
	if (!ref) return { preview: "", previewTruncated: false };
	const range = XLSX.utils.decode_range(ref);
	if (range.e.r - range.s.r < PREVIEW_ROWS) {
		return { preview: XLSX.utils.sheet_to_csv(sheet), previewTruncated: false };
	}
	// sheet_to_csv has no row limit, so narrow the sheet's range temporarily.
	sheet["!ref"] = XLSX.utils.encode_range({
		s: range.s,
		e: { r: range.s.r + PREVIEW_ROWS - 1, c: range.e.c },
	});
	try {
		return { preview: XLSX.utils.sheet_to_csv(sheet), previewTruncated: true };
	} finally {
		sheet["!ref"] = ref;
	}
}

async function handle(
	req: ExcelWorkerRequest,
): Promise<Omit<ExcelWorkerResponse, "id" | "type">> {
	switch (req.action) {
		case "open": {
			const { file } = req;
			if (file.size > MAX_WORKBOOK_BYTES) {
				const mb = (n: number) => Math.round(n / (1024 * 1024));
				throw new Error(
					`The file is too large (${mb(file.size)} MB); spreadsheets up to ${mb(MAX_WORKBOOK_BYTES)} MB are supported. Save the sheet as CSV and import that instead.`,
				);
			}
			const XLSX = await loadXLSX();
			const book = XLSX.read(new Uint8Array(await file.arrayBuffer()), {
				type: "array",
				dense: true,
				cellStyles: false,
				cellHTML: false,
				cellFormula: false,
			});
			const sheets = book.SheetNames;
			if (sheets.length === 0) throw new Error("The workbook has no sheets.");
			const bookId = nextBookId++;
			books.set(bookId, book);
			const selectedSheet = sheets[0];
			return {
				bookId,
				sheets,
				selectedSheet,
				...sheetPreview(XLSX, getSheet(bookId, selectedSheet)),
			};
		}
		case "preview": {
			const sheet = getSheet(req.bookId, req.sheetName);
			const XLSX = await loadXLSX();
			return { selectedSheet: req.sheetName, ...sheetPreview(XLSX, sheet) };
		}
		case "csv": {
			const sheet = getSheet(req.bookId, req.sheetName);
			const XLSX = await loadXLSX();
			// A Blob crosses to the main thread (and on to the parser worker) by
			// reference instead of as a copied string.
			const csv = new Blob([XLSX.utils.sheet_to_csv(sheet)], {
				type: "text/csv",
			});
			return { csv };
		}
		case "close":
			books.delete(req.bookId);
			return {};
		default:
			throw new Error(
				`Unknown excel worker action: ${(req as { action?: unknown }).action}`,
			);
	}
}

/** Always resolves with a reply, so no request is ever left pending. */
export async function handleExcelRequest(
	req: ExcelWorkerRequest,
): Promise<ExcelWorkerResponse> {
	try {
		return { id: req.id, type: "success", ...(await handle(req)) };
	} catch (err) {
		return {
			id: req.id,
			type: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
