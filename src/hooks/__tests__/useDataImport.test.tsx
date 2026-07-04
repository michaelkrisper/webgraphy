import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { persistence } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import type { ImportSettings } from "../../types/import";
import { parseDataInWorker } from "../../workers/parserClient";
import { useDataImport } from "../useDataImport";

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

// Mock xlsx
vi.mock("xlsx", () => ({
  read: vi.fn(),
  utils: {
    sheet_to_csv: vi.fn(),
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
    expect(mockAddDataset.mock.calls[0][0].name).toBe("test.csv");
    expect(mockAddDataset.mock.calls[0][0].columns[0]).toBe("Col1");
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
    expect(mockAddSeries.mock.calls[0][0].yColumn).toBe("Col1");

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
    expect(mockAddSeries.mock.calls[0][0].yColumn).toBe("Temp");
    expect(mockAddSeries.mock.calls[1][0].yColumn).toBe("Humidity");

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

  it("should handle reader.onerror when reading an Excel file", async () => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      readAsArrayBuffer() {
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

  it("should handle error when reading an Excel file fails (e.g. XLSX.read throws)", async () => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onload: ((event: { target: { result: ArrayBuffer } }) => void) | null =
        null;
      readAsArrayBuffer() {
        setTimeout(() => {
          // We just trigger onload; the actual hook calls XLSX.read which we will mock to throw
          this.onload?.({ target: { result: new ArrayBuffer(8) } });
        }, 10);
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    const xlsx = await import("xlsx");
    vi.mocked(xlsx.read).mockImplementationOnce(() => {
      throw new Error("Parse error");
    });

    await act(async () => {
      await result.current.importFile(file);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.error).toBe("Failed to parse Excel file.");
    global.FileReader = originalFileReader;
  });

  it("should successfully import an Excel file", async () => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

    const xlsx = await import("xlsx");
    const mockWorkbook = {
      SheetNames: ["Sheet1", "Sheet2"],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    };
    vi.mocked(xlsx.read).mockReturnValue(
      mockWorkbook as unknown as ReturnType<typeof xlsx.read>,
    );
    vi.mocked(xlsx.utils.sheet_to_csv).mockReturnValue("A,B\n1,2\n3,4");

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
    expect(result.current.pendingFile?.preview).toBe("A,B\n1,2\n3,4");

    global.FileReader = originalFileReader;
  });

  it("should successfully change sheet for an Excel file", async () => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

    const xlsx = await import("xlsx");
    const mockWorkbook = {
      SheetNames: ["Sheet1", "Sheet2"],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    };
    vi.mocked(xlsx.read).mockReturnValue(
      mockWorkbook as unknown as ReturnType<typeof xlsx.read>,
    );
    vi.mocked(xlsx.utils.sheet_to_csv).mockReturnValue("A,B\n1,2\n3,4");

    await act(async () => {
      await result.current.importFile(file);
    });

    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });

    expect(result.current.pendingFile?.selectedSheet).toBe("Sheet1");

    vi.mocked(xlsx.utils.sheet_to_csv).mockReturnValue("C,D\n5,6\n7,8");

    await act(async () => {
      await result.current.changeSheet("Sheet2");
    });

    expect(result.current.pendingFile?.selectedSheet).toBe("Sheet2");
    expect(result.current.pendingFile?.preview).toBe("C,D\n5,6\n7,8");

    global.FileReader = originalFileReader;
  });

  it("should do nothing on changeSheet if no pending file or not excel", async () => {
    const { result } = renderHook(() => useDataImport());

    await act(async () => {
      await result.current.changeSheet("Sheet2");
    });

    expect(result.current.pendingFile).toBeNull();
  });

  it("should handle confirmImport for an Excel file", async () => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.xlsx", {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
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

    const xlsx = await import("xlsx");
    const mockWorkbook = {
      SheetNames: ["Sheet1", "Sheet2"],
      Sheets: {
        Sheet1: {},
        Sheet2: {},
      },
    };
    vi.mocked(xlsx.read).mockReturnValue(
      mockWorkbook as unknown as ReturnType<typeof xlsx.read>,
    );
    vi.mocked(xlsx.utils.sheet_to_csv).mockReturnValue("A,B\n1,2\n3,4");

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

    const mockDataset = {
      id: "ds-3",
      name: "test.xlsx",
      columns: ["A", "B"],
      rowCount: 2,
      data: [],
    };

    vi.mocked(parseDataInWorker).mockResolvedValueOnce([
      mockDataset,
    ] as unknown as ReturnType<typeof parseDataInWorker>);

    await act(async () => {
      await result.current.confirmImport(settings);
    });

    expect(parseDataInWorker).toHaveBeenCalled();
    // Worker is called with a file constructed from CSV and workerType 'csv'
    expect(vi.mocked(parseDataInWorker).mock.calls[0][1]).toBe("csv");

    expect(mockAddDataset).toHaveBeenCalled();
    expect(result.current.isImporting).toBe(false);
    expect(result.current.pendingFile).toBeNull();

    global.FileReader = originalFileReader;
  });

  // confirmImport normalizes thrown values via `err instanceof Error ? err.message
  // : String(err)`, so both an Error and a raw string must surface as `error`.
  it.each([
    { label: "an Error", thrown: new Error("addDataset failed"), expected: "addDataset failed" },
    { label: "a string", thrown: "String error in confirmImport", expected: "String error in confirmImport" },
  ])("surfaces $label thrown by addDataset during confirmImport", async ({ thrown, expected }) => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.csv", { type: "text/csv" });

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
      id: "ds-err",
      name: "err.csv",
      columns: ["A"],
      rowCount: 1,
      data: [],
    };

    vi.mocked(parseDataInWorker).mockResolvedValueOnce([
      mockDataset,
    ] as unknown as ReturnType<typeof parseDataInWorker>);

    mockAddDataset.mockImplementationOnce(() => {
      throw thrown;
    });

    await act(async () => {
      await result.current.confirmImport(settings);
    });

    expect(result.current.error).toBe(expected);
    expect(result.current.isImporting).toBe(false);

    global.FileReader = originalFileReader;
  });

  it("should handle file reading errors in initiateImport", async () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([""], "test.csv", { type: "text/csv" });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      onerror: (() => void) | null = null;
      readAsText() {
        this.onerror?.();
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    await act(async () => {
      await result.current.importFile(file);
    });

    expect(result.current.error).toBe("Failed to read file.");

    global.FileReader = originalFileReader;
  });

  it("should handle file reading errors in initiateImport with a string error", async () => {
    const { result } = renderHook(() => useDataImport());

    const file = new File([""], "test.csv", { type: "text/csv" });

    const originalFileReader = global.FileReader;
    class MockFileReader {
      readAsText() {
        throw "String error";
      }
    }
    global.FileReader = MockFileReader as unknown as typeof FileReader;

    await act(async () => {
      await result.current.importFile(file);
    });

    expect(result.current.error).toBe("String error");

    global.FileReader = originalFileReader;
  });

  it.each([
    { label: "an Error", thrown: new Error("parseDataInWorker failed"), expected: "parseDataInWorker failed" },
    { label: "a string", thrown: "String error in parseDataInWorker", expected: "String error in parseDataInWorker" },
  ])("surfaces $label thrown by parseDataInWorker during confirmImport", async ({ thrown, expected }) => {
    const { result } = renderHook(() => useDataImport());
    const file = new File(["dummy"], "test.csv", { type: "text/csv" });

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

    vi.mocked(parseDataInWorker).mockRejectedValueOnce(thrown);

    await act(async () => {
      await result.current.confirmImport(settings);
    });

    expect(result.current.error).toBe(expected);
    expect(result.current.isImporting).toBe(false);

    global.FileReader = originalFileReader;
  });
});
