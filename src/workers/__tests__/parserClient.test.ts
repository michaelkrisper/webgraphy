import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

class MockWorker {
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onerror: ((ev: ErrorEvent | Event) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();

  simulateMessage(data: unknown) {
    if (this.onmessage) {
      this.onmessage({ data } as MessageEvent);
    }
  }

  simulateError(error: ErrorEvent | Event) {
    if (this.onerror) {
      this.onerror(error);
    }
  }
}

describe("parserClient", () => {
  let mockWorker: MockWorker;

  beforeEach(() => {
    // Correct way to stub a constructor with vi.stubGlobal
    mockWorker = new MockWorker();
    vi.stubGlobal("Worker", class {
      constructor() {
        return mockWorker;
      }
    });

    // Stub URL as well
    class MockURL extends URL {
      constructor(url: string | URL, base?: string | URL) {
        super(url, base);
      }
    }
    vi.stubGlobal("URL", MockURL);

    // Ensure parserClient's module-level cache is cleared
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves when worker returns success", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    expect(mockWorker).toBeDefined();
    expect(mockWorker.postMessage).toHaveBeenCalledWith({
      id: expect.any(Number),
      file,
      type: "csv",
      settings: undefined
    });

    const sentId = mockWorker.postMessage.mock.calls[0][0].id;

    const datasets = [{ id: "1", name: "test", color: "red", columns: [], data: [] }];
    mockWorker.simulateMessage({
      id: sentId,
      type: "success",
      datasets
    });

    const result = await promise;
    expect(result).toEqual(datasets);
  });

  it("rejects when worker returns error message", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    const sentId = mockWorker.postMessage.mock.calls[0][0].id;

    mockWorker.simulateMessage({
      id: sentId,
      type: "error",
      error: "Failed to parse"
    });

    await expect(promise).rejects.toThrow("Failed to parse");
  });

  it("rejects when worker emits error event", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    mockWorker.simulateError(new Error("Network error"));

    await expect(promise).rejects.toThrow("Network error");
  });

  it("rejects when worker emits error event without Error instance", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    mockWorker.simulateError({ message: "Unknown error" } as Event);

    await expect(promise).rejects.toThrow("Unknown error");
  });

  it("ignores messages with unknown IDs", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    mockWorker.simulateMessage({
      id: 9999,
      type: "success",
      datasets: []
    });

    const sentId = mockWorker.postMessage.mock.calls[0][0].id;
    mockWorker.simulateMessage({
      id: sentId,
      type: "success",
      datasets: []
    });

    await expect(promise).resolves.toEqual([]);
  });

  it("reuses the same worker for multiple calls", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file1 = new File(["content"], "test1.csv");
    const promise1 = parseDataInWorker(file1, "csv");

    const file2 = new File(["content"], "test2.csv");
    const promise2 = parseDataInWorker(file2, "csv");

    expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);

    const id1 = mockWorker.postMessage.mock.calls[0][0].id;
    const id2 = mockWorker.postMessage.mock.calls[1][0].id;

    expect(id1).not.toBe(id2);

    mockWorker.simulateMessage({ id: id1, type: "success", datasets: [] });
    mockWorker.simulateMessage({ id: id2, type: "success", datasets: [] });

    await expect(promise1).resolves.toEqual([]);
    await expect(promise2).resolves.toEqual([]);
  });

  it("rejects with generic message when error does not have message property", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    // Pass an empty object without message
    mockWorker.simulateError({} as Event);

    await expect(promise).rejects.toThrow("Worker error");
  });

  it("rejects with 'Parser worker error' when type is not success but no error string provided", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    const sentId = mockWorker.postMessage.mock.calls[0][0].id;
    mockWorker.simulateMessage({
      id: sentId,
      type: "error"
    });

    await expect(promise).rejects.toThrow("Parser worker error");
  });

  it("rejects with 'Parser worker error' when type is success but datasets is missing", async () => {
    const { parseDataInWorker } = await import("../parserClient");

    const file = new File(["content"], "test.csv");
    const promise = parseDataInWorker(file, "csv");

    const sentId = mockWorker.postMessage.mock.calls[0][0].id;
    mockWorker.simulateMessage({
      id: sentId,
      type: "success"
      // datasets omitted
    });

    await expect(promise).rejects.toThrow("Parser worker error");
  });

});
