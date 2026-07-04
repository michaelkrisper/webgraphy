import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("../../utils/formula", () => ({
  evaluateFormulaSync: vi.fn(),
}));

describe("formula.worker", () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let evaluateFormulaSyncMock: any;

  beforeEach(async () => {
    vi.resetModules();
    evaluateFormulaSyncMock = (await import("../../utils/formula"))
      .evaluateFormulaSync;

    // Setup global context for worker
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.self = globalThis as any;
    globalThis.postMessage = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (globalThis as any).onmessage;
  });

  it("should process successful evaluation without transferables", async () => {
    await import("../formula.worker");

    const mockResult = { type: "success" };
    evaluateFormulaSyncMock.mockReturnValue(mockResult);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onmessage = (globalThis as any).onmessage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onmessage({ data: { id: 123, formulaId: "test-id" } } as any);

    expect(evaluateFormulaSyncMock).toHaveBeenCalledWith({
      id: 123,
      formulaId: "test-id",
    });
    expect(globalThis.postMessage).toHaveBeenCalledWith(
      { ...mockResult, id: 123 },
      [],
    );
  });

  it("should process successful evaluation with transferables", async () => {
    await import("../formula.worker");

    const buffer1 = new ArrayBuffer(8);
    const buffer2 = new ArrayBuffer(8);
    const mockResult = {
      type: "success",
      newColumn: { data: { buffer: buffer1 } },
      sparseXColumn: { data: { buffer: buffer2 } },
    };
    evaluateFormulaSyncMock.mockReturnValue(mockResult);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onmessage = (globalThis as any).onmessage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onmessage({ data: { id: 123, formulaId: "test-id" } } as any);

    expect(evaluateFormulaSyncMock).toHaveBeenCalledWith({
      id: 123,
      formulaId: "test-id",
    });
    expect(globalThis.postMessage).toHaveBeenCalledWith(
      { ...mockResult, id: 123 },
      [buffer1, buffer2],
    );
  });

  // Covers both branches of the error normalization in the worker's catch block.
  it.each([
    { label: "Error object", thrown: new Error("Test Error"), error: "Test Error" },
    { label: "string", thrown: "String Error", error: "String Error" },
  ])("reports a thrown $label as an error response", async ({ thrown, error }) => {
    await import("../formula.worker");

    evaluateFormulaSyncMock.mockImplementation(() => {
      throw thrown;
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onmessage = (globalThis as any).onmessage;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    onmessage({ data: { id: 123, formulaId: "test-id" } } as any);

    expect(globalThis.postMessage).toHaveBeenCalledWith({
      id: 123,
      type: "error",
      error,
    });
  });
});

describe("formula.worker stringification fallback", () => {
  let evaluateFormulaSyncMock: any;

  beforeEach(async () => {
    vi.resetModules();
    evaluateFormulaSyncMock = (await import("../../utils/formula")).evaluateFormulaSync;
    globalThis.self = globalThis as any;
    globalThis.postMessage = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete (globalThis as any).onmessage;
  });

  it("handles non-Error objects in catch block", async () => {
    await import("../formula.worker");

    evaluateFormulaSyncMock.mockImplementation(() => {
      throw null;
    });

    const onmessage = (globalThis as any).onmessage;
    onmessage({ data: { id: 123, formulaId: "test-id" } } as any);

    expect(globalThis.postMessage).toHaveBeenCalledWith({
      id: 123,
      type: "error",
      error: "null",
    });
  });
});
