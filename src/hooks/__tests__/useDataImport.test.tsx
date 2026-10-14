import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "../../store/useGraphStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import type { ImportSettings } from "../../types/import";
import { PREVIEW_HEAD_BYTES } from "../../utils/importFile";
import {
	parseDataInWorker,
	previewJsonInWorker,
} from "../../workers/parserClient";
import {
	closeWorkbookInWorker,
	openWorkbookInWorker,
	previewSheetInWorker,
	sheetCsvInWorker,
} from "../../workers/excelClient";
import { useDataImport } from "../useDataImport";

vi.mock("../../store/useGraphStore", () => ({
	useGraphStore: Object.assign(vi.fn(), { getState: vi.fn() }),
	withHistory: (_label: string, fn: () => unknown) => fn(),
}));

vi.mock("../../workers/parserClient", () => ({
	parseDataInWorker: vi.fn(),
	previewJsonInWorker: vi.fn(),
}));

vi.mock("../../workers/excelClient", () => ({
	openWorkbookInWorker: vi.fn(),
	previewSheetInWorker: vi.fn(),
	sheetCsvInWorker: vi.fn(),
	closeWorkbookInWorker: vi.fn(),
}));

const settings: ImportSettings = {
	delimiter: ",",
	decimalPoint: ".",
	startRow: 1,
	columnConfigs: [],
};

const dataset = (over: Record<string, unknown> = {}) =>
	({
		id: "ds-1",
		name: "test.csv",
		columns: ["Time", "Temp", "Humidity"],
		rowCount: 1234,
		data: [],
		xAxisColumn: "Time",
		...over,
	}) as unknown as Awaited<ReturnType<typeof parseDataInWorker>>[number];

const toasts = () => useNotificationStore.getState().notifications;
const lastToast = () => toasts()[toasts().length - 1];

describe("useDataImport", () => {
	const addDataset = vi.fn();
	const addSeries = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();
		useNotificationStore.setState({ notifications: [] });
		const state = { addDataset, addSeries };
		vi
			.mocked(useGraphStore)
			.mockImplementation((selector?: unknown) =>
				(selector as (s: typeof state) => unknown)(state),
			);
		vi.mocked(useGraphStore.getState).mockReturnValue({
			series: [],
			yAxes: [],
		} as unknown as ReturnType<typeof useGraphStore.getState>);
		vi.mocked(closeWorkbookInWorker).mockResolvedValue(undefined);
	});

	const open = async (files: File[]) => {
		const hook = renderHook(() => useDataImport());
		await act(() => hook.result.current.importFiles(files));
		return hook;
	};

	it("starts idle", () => {
		const { result } = renderHook(() => useDataImport());
		expect(result.current.pendingFile).toBeNull();
		expect(result.current.isImporting).toBe(false);
	});

	describe("routing by extension", () => {
		it.each([
			["DATA.CSV", undefined],
			["data.txt", undefined],
			["data.dat", undefined],
			["data.Tsv", "\t"],
		])("reads %s as delimited text", async (name, delimiter) => {
			const { result } = await open([new File(["A,B\n1,2"], name)]);
			expect(result.current.pendingFile).toMatchObject({
				type: "csv",
				preview: "A,B\n1,2",
				previewTruncated: false,
				defaultDelimiter: delimiter,
			});
			expect(previewJsonInWorker).not.toHaveBeenCalled();
		});

		it("previews JSON in the worker instead of reading it here", async () => {
			vi.mocked(previewJsonInWorker).mockResolvedValueOnce({
				preview: '[{"a":1}]',
				previewTruncated: true,
			});
			const file = new File(['[{"a":1}]'], "Data.JSON");
			const textSpy = vi.spyOn(file, "text");
			const { result } = await open([file]);
			expect(previewJsonInWorker).toHaveBeenCalledWith(file, 50);
			expect(textSpy).not.toHaveBeenCalled();
			expect(result.current.pendingFile).toMatchObject({
				type: "json",
				preview: '[{"a":1}]',
				previewTruncated: true,
			});
		});

		it.each(["book.XLSX", "book.xls", "book.ods"])(
			"opens %s in the excel worker",
			async (name) => {
				vi.mocked(openWorkbookInWorker).mockResolvedValueOnce({
					bookId: 7,
					preview: "A,B\n1,2",
					sheets: ["S1"],
					selectedSheet: "S1",
				});
				const { result } = await open([new File(["x"], name)]);
				expect(result.current.pendingFile).toMatchObject({
					type: "excel",
					bookId: 7,
					sheets: ["S1"],
					selectedSheet: "S1",
					previewTruncated: false,
				});
			},
		);

		it("rejects unknown extensions with an error toast", async () => {
			const { result } = await open([new File(["x"], "image.png")]);
			expect(result.current.pendingFile).toBeNull();
			expect(lastToast()).toMatchObject({ kind: "error" });
			expect(lastToast().message).toContain('"image.png"');
			expect(lastToast().message).toContain("unsupported file type");
		});
	});

	describe("preview read", () => {
		it("reads only a head slice of large text files, cut at a line end", async () => {
			const line = "1,2,3\n";
			const content = "A,B,C\n" + line.repeat(PREVIEW_HEAD_BYTES / 4);
			const file = new File([content], "big.csv");
			const sliceSpy = vi.spyOn(file, "slice");
			const { result } = await open([file]);
			expect(sliceSpy).toHaveBeenCalledWith(0, PREVIEW_HEAD_BYTES);
			const pending = result.current.pendingFile;
			expect(pending?.previewTruncated).toBe(true);
			expect(pending?.preview.length).toBeLessThanOrEqual(PREVIEW_HEAD_BYTES);
			expect(pending?.preview.endsWith("1,2,3")).toBe(true);
		});

		it("hands the original File to the parser worker, not the preview text", async () => {
			const file = new File(["A,B\n1,2"], "a.csv");
			const { result } = await open([file]);
			vi.mocked(parseDataInWorker).mockResolvedValueOnce([dataset()]);
			await act(() => result.current.confirmImport(settings));
			expect(parseDataInWorker).toHaveBeenCalledWith(file, "csv", settings);
		});

		it("toasts when the file cannot be read", async () => {
			const file = new File(["x"], "a.csv");
			vi.spyOn(file, "text").mockRejectedValueOnce(new Error("disk gone"));
			const { result } = await open([file]);
			expect(result.current.pendingFile).toBeNull();
			expect(lastToast()).toMatchObject({
				kind: "error",
				message: 'Could not open "a.csv": disk gone',
			});
		});
	});

	describe("confirmImport", () => {
		it("adds the datasets, auto-adds series and toasts a summary", async () => {
			const { result } = await open([new File(["A"], "a.csv")]);
			vi.mocked(parseDataInWorker).mockResolvedValueOnce([dataset()]);
			await act(() => result.current.confirmImport(settings));

			expect(addDataset).toHaveBeenCalledTimes(1);
			expect(addSeries.mock.calls.map((c) => c[0].yColumn)).toEqual([
				"Temp",
				"Humidity",
			]);
			expect(result.current.pendingFile).toBeNull();
			expect(result.current.isImporting).toBe(false);
			expect(lastToast()).toMatchObject({
				kind: "success",
				message: `Imported "a.csv": ${(1234).toLocaleString()} rows, 3 columns`,
			});
		});

		it("places auto-added series on free axes, sharing one for similar ranges", async () => {
			vi.mocked(useGraphStore.getState).mockReturnValue({
				series: [{ yAxisId: "axis-1" }, { yAxisId: "axis-3" }],
				yAxes: [],
			} as unknown as ReturnType<typeof useGraphStore.getState>);
			const col = (min: number, max: number) => ({
				isFloat64: false,
				refPoint: 0,
				bounds: { min, max },
				data: new Float32Array(0),
			});
			const { result } = await open([new File(["A"], "a.csv")]);
			vi.mocked(parseDataInWorker).mockResolvedValueOnce([
				dataset({
					columns: ["Time", "TempIn", "TempOut", "Pressure"],
					data: [col(0, 1), col(18, 24), col(5, 25), col(990, 1030)],
				}),
			]);
			await act(() => result.current.confirmImport(settings));

			const added = addSeries.mock.calls.map((c) => c[0]);
			expect(added.map((s) => s.yAxisId)).toEqual(["axis-2", "axis-2", "axis-4"]);
			// 1234 rows: dense enough that markers would merge into a rope.
			expect(added.every((s) => s.pointStyle === "none")).toBe(true);
		});

		it("does not auto-add series for wide datasets", async () => {
			const { result } = await open([new File(["A"], "a.csv")]);
			vi
				.mocked(parseDataInWorker)
				.mockResolvedValueOnce([
					dataset({ columns: ["T", "C1", "C2", "C3", "C4", "C5"] }),
				]);
			await act(() => result.current.confirmImport(settings));
			expect(addSeries).not.toHaveBeenCalled();
		});

		it("summarises split imports", async () => {
			const { result } = await open([new File(["A"], "a.csv")]);
			vi
				.mocked(parseDataInWorker)
				.mockResolvedValueOnce([
					dataset({ rowCount: 2 }),
					dataset({ id: "ds-2", rowCount: 3 }),
				]);
			await act(() => result.current.confirmImport(settings));
			expect(addSeries).not.toHaveBeenCalled();
			expect(lastToast().message).toBe('Imported "a.csv" as 2 datasets (5 rows)');
		});

		it.each([
			["an Error", new Error("bad row 3"), "bad row 3"],
			["a string", "worker died", "worker died"],
		])(
			"toasts %s and keeps the dialog open for a retry",
			async (_label, thrown, reason) => {
				const { result } = await open([new File(["A"], "a.csv")]);
				vi.mocked(parseDataInWorker).mockRejectedValueOnce(thrown);
				await act(() => result.current.confirmImport(settings));
				expect(lastToast()).toMatchObject({
					kind: "error",
					message: `Could not import "a.csv": ${reason}`,
				});
				expect(result.current.pendingFile).not.toBeNull();
				expect(result.current.isImporting).toBe(false);
				expect(addDataset).not.toHaveBeenCalled();
			},
		);

		it("treats an empty result as an error", async () => {
			const { result } = await open([new File(["A"], "a.csv")]);
			vi.mocked(parseDataInWorker).mockResolvedValueOnce([]);
			await act(() => result.current.confirmImport(settings));
			expect(lastToast().message).toBe('Could not import "a.csv": no data found');
		});

		it("reports busy state and ignores a second confirm while importing", async () => {
			const { result } = await open([new File(["A"], "a.csv")]);
			let finishParse!: (v: ReturnType<typeof dataset>[]) => void;
			vi.mocked(parseDataInWorker).mockReturnValueOnce(
				new Promise((r) => {
					finishParse = r;
				}),
			);

			let first!: Promise<void>;
			act(() => {
				first = result.current.confirmImport(settings);
				void result.current.confirmImport(settings);
			});
			expect(result.current.isImporting).toBe(true);
			expect(parseDataInWorker).toHaveBeenCalledTimes(1);

			// Cancel is ignored mid-import, so the parsed data is not lost.
			act(() => result.current.cancelImport());
			expect(result.current.pendingFile).not.toBeNull();

			await act(async () => {
				finishParse([dataset()]);
				await first;
			});
			expect(result.current.isImporting).toBe(false);
			expect(addDataset).toHaveBeenCalledTimes(1);
		});

		it("does nothing without a pending file", async () => {
			const { result } = renderHook(() => useDataImport());
			await act(() => result.current.confirmImport(settings));
			expect(parseDataInWorker).not.toHaveBeenCalled();
		});
	});

	describe("queue", () => {
		it("opens dropped files one after another", async () => {
			const a = new File(["A"], "a.csv");
			const b = new File(["{}"], "b.unknown");
			const c = new File(["C"], "c.tsv");
			const { result } = await open([a, b, c]);
			expect(toasts()[0]).toMatchObject({ kind: "info" });
			expect(result.current.pendingFile?.file).toBe(a);

			vi.mocked(parseDataInWorker).mockResolvedValueOnce([dataset()]);
			await act(() => result.current.confirmImport(settings));
			// b is skipped with an error toast, c opens next.
			expect(
				toasts().some((t) => t.kind === "error" && t.message.includes("b.unknown")),
			).toBe(true);
			expect(result.current.pendingFile?.file).toBe(c);

			await act(async () => result.current.cancelImport());
			expect(result.current.pendingFile).toBeNull();
		});

		it("queues files picked while a dialog is already open", async () => {
			const a = new File(["A"], "a.csv");
			const b = new File(["B"], "b.csv");
			const { result } = await open([a]);
			await act(() => result.current.importFiles([b]));
			expect(result.current.pendingFile?.file).toBe(a);
			await act(async () => result.current.cancelImport());
			expect(result.current.pendingFile?.file).toBe(b);
		});

		it("gives each opened file a new id so the dialog remounts", async () => {
			const { result } = await open([
				new File(["A"], "a.csv"),
				new File(["B"], "b.csv"),
			]);
			const firstId = result.current.pendingFile?.id;
			await act(async () => result.current.cancelImport());
			expect(result.current.pendingFile?.id).not.toBe(firstId);
		});

		it("ignores an empty file list", async () => {
			const { result } = await open([]);
			expect(result.current.pendingFile).toBeNull();
			expect(toasts()).toHaveLength(0);
		});
	});

	describe("excel", () => {
		const openBook = async () => {
			vi.mocked(openWorkbookInWorker).mockResolvedValueOnce({
				bookId: 3,
				preview: "A,B\n1,2",
				previewTruncated: true,
				sheets: ["S1", "S2"],
				selectedSheet: "S1",
			});
			return open([new File(["x"], "book.xlsx")]);
		};

		it("changes sheets by workbook id, repeatedly", async () => {
			const { result } = await openBook();
			vi
				.mocked(previewSheetInWorker)
				.mockResolvedValueOnce({ preview: "C\n5" })
				.mockResolvedValueOnce({ preview: "A,B\n1,2", previewTruncated: true });

			await act(() => result.current.changeSheet("S2"));
			expect(previewSheetInWorker).toHaveBeenLastCalledWith(3, "S2");
			expect(result.current.pendingFile).toMatchObject({
				selectedSheet: "S2",
				preview: "C\n5",
				previewTruncated: false,
			});

			await act(() => result.current.changeSheet("S1"));
			expect(previewSheetInWorker).toHaveBeenLastCalledWith(3, "S1");
			expect(result.current.pendingFile?.selectedSheet).toBe("S1");
		});

		it("toasts a failed sheet change and keeps the current preview", async () => {
			const { result } = await openBook();
			vi
				.mocked(previewSheetInWorker)
				.mockRejectedValueOnce(new Error('Sheet "S2" not found'));
			await act(() => result.current.changeSheet("S2"));
			expect(lastToast()).toMatchObject({ kind: "error" });
			expect(lastToast().message).toContain('Sheet "S2" not found');
			expect(result.current.pendingFile?.selectedSheet).toBe("S1");
		});

		it("drops a sheet preview that arrives after the dialog closed", async () => {
			const { result } = await openBook();
			let resolve!: (v: { preview: string }) => void;
			vi.mocked(previewSheetInWorker).mockReturnValueOnce(
				new Promise((r) => {
					resolve = r;
				}),
			);
			let pending!: Promise<void>;
			act(() => {
				pending = result.current.changeSheet("S2");
			});
			act(() => result.current.cancelImport());
			await act(async () => {
				resolve({ preview: "late" });
				await pending;
			});
			expect(result.current.pendingFile).toBeNull();
		});

		it("imports the selected sheet's CSV and frees the workbook", async () => {
			const { result } = await openBook();
			const csv = new Blob(["A,B\n1,2"], { type: "text/csv" });
			vi.mocked(sheetCsvInWorker).mockResolvedValueOnce(csv);
			vi.mocked(parseDataInWorker).mockResolvedValueOnce([dataset()]);

			await act(() => result.current.confirmImport(settings));

			expect(sheetCsvInWorker).toHaveBeenCalledWith(3, "S1");
			const [workerFile, type] = vi.mocked(parseDataInWorker).mock.calls[0];
			expect(type).toBe("csv");
			expect(workerFile.name).toBe("book.xlsx.csv");
			expect(await workerFile.text()).toBe("A,B\n1,2");
			expect(closeWorkbookInWorker).toHaveBeenCalledWith(3);
			expect(result.current.pendingFile).toBeNull();
		});

		it("frees the workbook on cancel", async () => {
			const { result } = await openBook();
			await act(async () => result.current.cancelImport());
			expect(closeWorkbookInWorker).toHaveBeenCalledWith(3);
		});

		it("keeps the workbook when the import fails so it can be retried", async () => {
			const { result } = await openBook();
			vi
				.mocked(sheetCsvInWorker)
				.mockRejectedValueOnce(new Error("The workbook is no longer loaded"));
			await act(() => result.current.confirmImport(settings));
			expect(lastToast().message).toBe(
				'Could not import "book.xlsx": The workbook is no longer loaded',
			);
			expect(closeWorkbookInWorker).not.toHaveBeenCalled();
		});

		it("toasts when the workbook cannot be opened", async () => {
			vi
				.mocked(openWorkbookInWorker)
				.mockRejectedValueOnce(new Error("The file is too large"));
			const { result } = await open([new File(["x"], "huge.xlsx")]);
			expect(result.current.pendingFile).toBeNull();
			expect(lastToast().message).toBe(
				'Could not open "huge.xlsx": The file is too large',
			);
		});
	});
});
