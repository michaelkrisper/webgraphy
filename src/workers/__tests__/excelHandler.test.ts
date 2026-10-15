import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import {
	type ExcelWorkerRequest,
	handleExcelRequest,
	MAX_WORKBOOK_BYTES,
	PREVIEW_ROWS,
} from "../excelHandler";

function workbookFile(
	sheets: Record<string, unknown[][]>,
	name = "book.xlsx",
): File {
	const book = XLSX.utils.book_new();
	for (const [sheetName, rows] of Object.entries(sheets)) {
		XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), sheetName);
	}
	const bytes = XLSX.write(book, { type: "array", bookType: "xlsx" });
	return new File([bytes], name);
}

let nextId = 1;
const send = (req: Omit<ExcelWorkerRequest, "id">) =>
	handleExcelRequest({ ...req, id: nextId++ } as ExcelWorkerRequest);

async function openBook(file: File) {
	const res = await send({ action: "open", file });
	expect(res.type).toBe("success");
	return res;
}

describe("handleExcelRequest", () => {
	const twoSheets = () =>
		workbookFile({
			First: [
				["A", "B"],
				[1, 2],
			],
			Second: [
				["C", "D"],
				[3, 4],
			],
		});

	it("opens a workbook, lists sheets and previews the first", async () => {
		const res = await openBook(twoSheets());
		expect(res).toMatchObject({
			sheets: ["First", "Second"],
			selectedSheet: "First",
			preview: "A,B\n1,2",
			previewTruncated: false,
		});
		expect(typeof res.bookId).toBe("number");
	});

	it("switches sheets any number of times without re-sending the file", async () => {
		const { bookId } = await openBook(twoSheets());
		for (const [sheetName, preview] of [
			["Second", "C,D\n3,4"],
			["First", "A,B\n1,2"],
			["Second", "C,D\n3,4"],
		]) {
			const res = await send({
				action: "preview",
				bookId: bookId as number,
				sheetName,
			});
			expect(res).toMatchObject({
				type: "success",
				selectedSheet: sheetName,
				preview,
			});
		}
	});

	it("limits the preview to the first rows but exports the whole sheet", async () => {
		const rows: unknown[][] = [["n"]];
		for (let i = 0; i < PREVIEW_ROWS + 20; i++) rows.push([i]);
		const { bookId, preview, previewTruncated } = await openBook(
			workbookFile({ Big: rows }),
		);
		expect(previewTruncated).toBe(true);
		expect(preview?.split("\n")).toHaveLength(PREVIEW_ROWS);

		const res = await send({
			action: "csv",
			bookId: bookId as number,
			sheetName: "Big",
		});
		expect(res.csv).toBeInstanceOf(Blob);
		const lines = (await (res.csv as Blob).text()).split("\n");
		expect(lines).toHaveLength(PREVIEW_ROWS + 21);
		expect(lines.at(-1)).toBe(String(PREVIEW_ROWS + 19));
	});

	it("replies with an error for an unknown sheet or an empty sheet name", async () => {
		const { bookId } = await openBook(twoSheets());
		for (const sheetName of ["Nope", ""]) {
			const res = await send({
				action: "preview",
				bookId: bookId as number,
				sheetName,
			});
			expect(res.type).toBe("error");
			expect(res.error).toContain("not found");
		}
	});

	it("frees the workbook on close", async () => {
		const { bookId } = await openBook(twoSheets());
		expect((await send({ action: "close", bookId: bookId as number })).type).toBe(
			"success",
		);
		const res = await send({
			action: "csv",
			bookId: bookId as number,
			sheetName: "First",
		});
		expect(res.type).toBe("error");
		expect(res.error).toContain("no longer loaded");
	});

	it("refuses files above the size limit before reading them", async () => {
		const file = new File(["x"], "huge.xlsx");
		Object.defineProperty(file, "size", { value: MAX_WORKBOOK_BYTES + 1 });
		const res = await send({ action: "open", file });
		expect(res.type).toBe("error");
		expect(res.error).toMatch(/too large/);
	});

	it("replies with an error for unknown actions instead of staying silent", async () => {
		const res = await send({ action: "bogus" } as unknown as Omit<
			ExcelWorkerRequest,
			"id"
		>);
		expect(res.type).toBe("error");
		expect(res.id).toBe(nextId - 1);
	});

	it("previews an empty sheet as empty text instead of failing", async () => {
		const res = await openBook(workbookFile({ Empty: [] }));
		expect(res.sheets).toEqual(["Empty"]);
		expect(res.preview).toBe("");
		expect(res.previewTruncated).toBe(false);
	});
});
