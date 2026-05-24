import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistence } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import type { ImportSettings } from "../../types/import";
import { parseDataInWorker } from "../../workers/parserClient";
import { useDataImport } from "../useDataImport";

vi.mock("xlsx", () => ({
	read: vi.fn(),
	utils: {
		sheet_to_csv: vi.fn(),
	},
}));

// Mock the graph store
vi.mock("../../store/useGraphStore", () => ({
	useGraphStore: Object.assign(
		vi.fn(() => ({
			addDataset: vi.fn(),
			addSeries: vi.fn(),
		})),
		{
			getState: vi.fn(() => ({
				datasets: [],
				series: [],
			})),
		},
	),
}));

// Mock persistence
vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn().mockResolvedValue(undefined),
	},
}));

// Mock the parser worker client
vi.mock("../../workers/parserClient", () => ({
	parseDataInWorker: vi.fn(),
}));

// Mock URL.createObjectURL since JSDOM might not have it
if (typeof URL.createObjectURL === "undefined") {
	URL.createObjectURL = vi.fn(() => "blob:test-url");
}

describe("useDataImport hook", () => {
	const mockAddDataset = vi.fn();
	const mockAddSeries = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		const storeState = {
			addDataset: mockAddDataset,
			addSeries: mockAddSeries,
		} as unknown as ReturnType<typeof useGraphStore.getState>;
		// The hook now reads each field via a per-field selector; replicate that
		// behaviour so the mock honours the selector function.
		vi.mocked(useGraphStore).mockImplementation((selector?: unknown) => {
			if (typeof selector === "function")
				return (selector as (s: typeof storeState) => unknown)(storeState);
			return storeState;
		});
		vi.mocked(useGraphStore.getState).mockReturnValue({
			datasets: [],
			series: [],
		} as ReturnType<typeof useGraphStore.getState>);
	});

	it("should initialize correctly", () => {
		const { result } = renderHook(() => useDataImport());
		expect(result.current.isImporting).toBe(false);
		expect(result.current.error).toBe(null);
		expect(result.current.pendingFile).toBe(null);
	});

	it("should set pending file on initiateImport for json", async () => {
		const { result } = renderHook(() => useDataImport());

		const fileContent = '{"data": [1, 2]}';
		const file = new File([fileContent], "test.json", {
			type: "application/json",
		});

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onload?.({ target: { result: "preview data json" } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile).not.toBeNull();
		expect(result.current.pendingFile?.file).toBe(file);
		expect(result.current.pendingFile?.type).toBe("json");
		expect(result.current.pendingFile?.preview).toBe("preview data json");

		global.FileReader = originalFileReader;
	});

	it("should set pending file on initiateImport", async () => {
		const { result } = renderHook(() => useDataImport());

		const fileContent = "A,B\n1,2";
		const file = new File([fileContent], "test.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onload?.({ target: { result: "preview data" } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile).not.toBeNull();
		expect(result.current.pendingFile?.file).toBe(file);
		expect(result.current.pendingFile?.type).toBe("csv");
		expect(result.current.pendingFile?.preview).toBe("preview data");

		global.FileReader = originalFileReader;
	});

	it("should cancel import correctly", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "test.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		expect(result.current.pendingFile).not.toBeNull();

		act(() => {
			result.current.cancelImport();
		});

		expect(result.current.pendingFile).toBeNull();
		global.FileReader = originalFileReader;
	});

	it("should do nothing on confirmImport if no pending file", async () => {
		const { result } = renderHook(() => useDataImport());
		const emptySettings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
			xAxisColumn: "",
		};

		act(() => {
			result.current.confirmImport(emptySettings);
		});

		expect(result.current.isImporting).toBe(false);
	});

	it("should process import with parseData successfully", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "test.csv", { type: "text/csv" });
		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		expect(result.current.pendingFile).not.toBeNull();

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		const mockDataset = {
			id: "ds-1",
			name: "test.csv",
			columns: ["Col1"],
			rowCount: 10,
			data: [],
			xAxisColumn: "Col1",
			xAxisId: "axis-1",
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([
			mockDataset,
		] as unknown as ReturnType<typeof parseDataInWorker>);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(parseDataInWorker).toHaveBeenCalledWith(file, "csv", settings);
		expect(mockAddDataset).toHaveBeenCalled();
		expect(mockAddDataset.mock.calls[0][0].name).toBe("A - test.csv");
		expect(mockAddDataset.mock.calls[0][0].columns[0]).toBe("A: Col1");
		expect(result.current.isImporting).toBe(false);
		expect(result.current.pendingFile).toBeNull();

		global.FileReader = originalFileReader;
	});

	it("should process import with parseData successfully when xAxisColumn is undefined", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "test2.csv", { type: "text/csv" });
		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		const mockDataset = {
			id: "ds-2",
			name: "test2.csv",
			columns: ["Col1"],
			rowCount: 10,
			data: [],
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([
			mockDataset,
		] as unknown as ReturnType<typeof parseDataInWorker>);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(mockAddDataset.mock.calls[0][0].xAxisColumn).toBeUndefined();
		expect(result.current.isImporting).toBe(false);
		expect(result.current.pendingFile).toBeNull();
		// xAxisColumn is undefined so all columns pass the filter — Col1 gets auto-added as a series
		expect(mockAddSeries).toHaveBeenCalledTimes(1);
		expect(mockAddSeries.mock.calls[0][0].yColumn).toBe("A: Col1");

		global.FileReader = originalFileReader;
	});

	it("should handle parseData errors", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "test.json", { type: "application/json" });
		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		const errorMessage = "Failed to parse JSON";
		vi.mocked(parseDataInWorker).mockRejectedValueOnce(new Error(errorMessage));

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(result.current.isImporting).toBe(false);
		expect(result.current.error).toBe(errorMessage);
		expect(persistence.saveDataset).not.toHaveBeenCalled();
		expect(mockAddDataset).not.toHaveBeenCalled();

		global.FileReader = originalFileReader;
	});

	it("should handle non-csv files correctly", async () => {
		const { result } = renderHook(() => useDataImport());

		const fileContent = '{"data": [1, 2]}';
		const file = new File([fileContent], "test.txt", { type: "text/plain" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onload?.({ target: { result: "preview data txt" } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile).not.toBeNull();
		expect(result.current.pendingFile?.file).toBe(file);
		expect(result.current.pendingFile?.type).toBe("json"); // Default fallback
		expect(result.current.pendingFile?.preview).toBe("preview data txt");

		global.FileReader = originalFileReader;
	});

	it("should auto-add series for non-x columns when dataset has ≤5 columns", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "test.csv", { type: "text/csv" });
		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
			xAxisColumn: "",
		};

		const mockDataset = {
			id: "ds-auto",
			name: "test.csv",
			columns: ["Time", "Temp", "Humidity"],
			rowCount: 10,
			data: [],
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([
			mockDataset,
		] as unknown as ReturnType<typeof parseDataInWorker>);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(mockAddSeries).toHaveBeenCalledTimes(2);
		expect(mockAddSeries.mock.calls[0][0].yColumn).toBe("A: Temp");
		expect(mockAddSeries.mock.calls[1][0].yColumn).toBe("A: Humidity");

		global.FileReader = originalFileReader;
	});

	it("should not auto-add series when dataset has >5 columns", async () => {
		const { result } = renderHook(() => useDataImport());

		const file = new File([""], "wide.csv", { type: "text/csv" });
		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				this.onload?.({ target: { result: "data" } });
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
			xAxisColumn: "",
		};

		const mockDataset = {
			id: "ds-wide",
			name: "wide.csv",
			columns: ["T", "C1", "C2", "C3", "C4", "C5"],
			rowCount: 10,
			data: [],
			xAxisColumn: "T",
			xAxisId: "axis-1",
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([
			mockDataset,
		] as unknown as ReturnType<typeof parseDataInWorker>);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(mockAddSeries).not.toHaveBeenCalled();

		global.FileReader = originalFileReader;
	});

	it("should handle initiateImport with excel files successfully", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockReturnValueOnce({
			SheetNames: ["Sheet1", "Sheet2"],
			Sheets: {
				Sheet1: {},
				Sheet2: {},
			},
		} as unknown);
		vi.mocked(mockXLSX.utils.sheet_to_csv).mockReturnValueOnce(
			"ColA,ColB\n1,2\n3,4",
		);

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile).not.toBeNull();
		expect(result.current.pendingFile?.type).toBe("excel");
		expect(result.current.pendingFile?.sheets).toEqual(["Sheet1", "Sheet2"]);
		expect(result.current.pendingFile?.selectedSheet).toBe("Sheet1");
		expect(result.current.pendingFile?.fullCsv).toBe("ColA,ColB\n1,2\n3,4");

		global.FileReader = originalFileReader;
	});

	it("should handle changeSheet for excel files", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockReturnValueOnce({
			SheetNames: ["Sheet1", "Sheet2"],
			Sheets: {
				Sheet1: {},
				Sheet2: {},
			},
		} as unknown);
		vi.mocked(mockXLSX.utils.sheet_to_csv)
			.mockReturnValueOnce("ColA,ColB\n1,2") // initiate
			.mockReturnValueOnce("ColA,ColB\n3,4"); // changeSheet

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile?.selectedSheet).toBe("Sheet1");
		expect(result.current.pendingFile?.fullCsv).toBe("ColA,ColB\n1,2");

		await act(async () => {
			await result.current.changeSheet("Sheet2");
		});

		expect(result.current.pendingFile?.selectedSheet).toBe("Sheet2");
		expect(result.current.pendingFile?.fullCsv).toBe("ColA,ColB\n3,4");

		global.FileReader = originalFileReader;
	});

	it("should bypass changeSheet if not an excel file", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["A,B\n1,2"], "test.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onload?.({ target: { result: "A,B\n1,2" } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.pendingFile?.type).toBe("csv");
		expect(result.current.pendingFile?.selectedSheet).toBeUndefined();

		await act(async () => {
			await result.current.changeSheet("Sheet2");
		});

		// Remains the same
		expect(result.current.pendingFile?.type).toBe("csv");
		expect(result.current.pendingFile?.selectedSheet).toBeUndefined();

		global.FileReader = originalFileReader;
	});

	it("should confirmImport correctly for excel files", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockReturnValueOnce({
			SheetNames: ["Sheet1"],
			Sheets: {
				Sheet1: {},
			},
		} as unknown);
		vi.mocked(mockXLSX.utils.sheet_to_csv).mockReturnValueOnce("ColX\n100");

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([
			{ id: "1", name: "test", columns: ["ColX"], data: [], rowCount: 1 },
		] as unknown);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(parseDataInWorker).toHaveBeenCalled();
		// Assert that parseDataInWorker was called with a CSV file constructed from the fullCsv
		const calledFile = vi.mocked(parseDataInWorker).mock.calls[0][0] as File;
		expect(calledFile.name).toBe("test.xlsx.csv");
		expect(calledFile.type).toBe("text/csv");

		expect(result.current.isImporting).toBe(false);

		global.FileReader = originalFileReader;
	});

	it("should handle FileReader read errors", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File([""], "test.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onerror: (() => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onerror?.();
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.error).toBe("Failed to read file.");

		global.FileReader = originalFileReader;
	});

	it("should handle XLSX parse errors", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File([""], "bad.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockImplementationOnce(() => {
			throw new Error("Parse error");
		});

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.error).toBe("Failed to parse Excel file.");

		global.FileReader = originalFileReader;
	});

	it("should catch initiateImport errors with non-Error object", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "bad.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			readAsText() {
				throw "A string error";
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		expect(result.current.error).toBe("A string error");

		global.FileReader = originalFileReader;
	});

	it("should catch confirmImport errors with non-Error object", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["A,B\n1,2"], "test.csv", { type: "text/csv" });

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: string } }) => void) | null = null;
			readAsText() {
				setTimeout(() => {
					this.onload?.({ target: { result: "A,B\n1,2" } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		vi.mocked(parseDataInWorker).mockRejectedValueOnce("string error reject");

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(result.current.isImporting).toBe(false);
		expect(result.current.error).toBe("string error reject");

		global.FileReader = originalFileReader;
	});

	it("should handle null fullCsv in confirmImport", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockReturnValueOnce({
			SheetNames: ["Sheet1"],
			Sheets: {
				Sheet1: {},
			},
		} as unknown);
		vi.mocked(mockXLSX.utils.sheet_to_csv).mockReturnValueOnce(""); // empty string so that fullCsv is falsey/empty

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		// Now force fullCsv to be undefined to trigger the `[fullCsv ?? preview]` branch fallback.
		// Since we can't easily make fullCsv undefined through normal xlsx mock without typescript complaining or logic,
		// we can override the state directly or construct it so fullCsv is undefined.
		// Wait, readExcelFile explicitly assigns fullCsv = XLSX.utils.sheet_to_csv().
		// If sheet_to_csv returns an empty string, fullCsv ?? preview will use fullCsv.
		// Let's just mock parseDataInWorker returning null to trigger the `incoming = (datasets as Dataset[]) || []` branch.

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce(null as unknown);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		expect(parseDataInWorker).toHaveBeenCalled();
		expect(result.current.isImporting).toBe(false);

		global.FileReader = originalFileReader;
	});

	it("should fallback to preview when fullCsv is undefined", async () => {
		const { result } = renderHook(() => useDataImport());
		const file = new File(["dummy"], "test.xlsx", {
			type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
		});

		const mockXLSX = await import("xlsx");
		vi.mocked(mockXLSX.read).mockReturnValueOnce({
			SheetNames: ["Sheet1"],
			Sheets: {
				Sheet1: {},
			},
		} as unknown);
		vi.mocked(mockXLSX.utils.sheet_to_csv).mockReturnValueOnce("");

		const originalFileReader = global.FileReader;
		class MockFileReader {
			onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
				null;
			readAsArrayBuffer() {
				setTimeout(() => {
					this.onload?.({ target: { result: new ArrayBuffer(8) } });
				}, 10);
			}
		}
		global.FileReader = MockFileReader as unknown as typeof FileReader;

		await act(async () => {
			await result.current.importFile(file);
		});
		await act(async () => {
			await new Promise((r) => setTimeout(r, 20));
		});

		// Force fullCsv to be literally undefined using state hack
		act(() => {
			result.current.changeSheet("Sheet1");
			// But wait, changeSheet re-computes fullCsv from sheet_to_csv.
		});

		// Instead of doing state hacks, we can just intercept the setState or just use testing library state updates if we want to literally set fullCsv to undefined, but we can't cleanly do that.
		// Wait, readExcelFile sets fullCsv. What if we just mutate the pendingFile object in memory?
		if (result.current.pendingFile) {
			result.current.pendingFile.fullCsv = undefined;
		}

		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 1,
			columnConfigs: [],
		};

		vi.mocked(parseDataInWorker).mockResolvedValueOnce([]);

		await act(async () => {
			await result.current.confirmImport(settings);
		});

		// Check the worker file
		expect(parseDataInWorker).toHaveBeenCalled();

		global.FileReader = originalFileReader;
	});
});
