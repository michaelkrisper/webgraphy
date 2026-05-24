import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Dataset } from "../../services/persistence";
import { parseData } from "../../utils/data-parser";

vi.mock("../../utils/data-parser", () => ({
	parseData: vi.fn(),
}));

type WorkerSelf = { onmessage?: (ev: MessageEvent) => unknown };

describe("parser.worker", () => {
	let postMessageMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		postMessageMock = vi.fn();

		// Stub the global self properties required by the worker
		vi.stubGlobal("postMessage", postMessageMock);

		// Import the worker so it registers `self.onmessage`
		await import("../parser.worker");
	});

	it("should process a file successfully and post transferables", async () => {
		const mockFile = new File(["dummy"], "test.csv", { type: "text/csv" });
		const mockArrayBuffer = new ArrayBuffer(8);
		const mockDataset: Dataset[] = [
			{
				id: "123",
				name: "test.csv",
				columns: ["col1"],
				rowCount: 1,
				data: [
					{
						isFloat64: true,
						refPoint: 0,
						bounds: { min: 0, max: 0 },
						data: new Float64Array(mockArrayBuffer),
					},
				],
			},
		];

		vi.mocked(parseData).mockResolvedValue(mockDataset);

		const event = new MessageEvent("message", {
			data: {
				id: 1,
				file: mockFile,
				type: "csv",
			},
		});

		// call self.onmessage
		await (self as WorkerSelf).onmessage?.(event);

		expect(parseData).toHaveBeenCalledWith(mockFile, "csv", undefined);
		expect(postMessageMock).toHaveBeenCalledWith(
			{ id: 1, type: "success", datasets: mockDataset },
			[mockArrayBuffer],
		);
	});

	it("should handle Error object from parseData", async () => {
		const mockFile = new File(["dummy"], "test.csv", { type: "text/csv" });
		vi.mocked(parseData).mockRejectedValue(new Error("Parse failed"));

		const event = new MessageEvent("message", {
			data: {
				id: 2,
				file: mockFile,
				type: "csv",
			},
		});

		await (self as WorkerSelf).onmessage?.(event);

		expect(postMessageMock).toHaveBeenCalledWith({
			id: 2,
			type: "error",
			error: "Parse failed",
		});
	});

	it("should handle string error from parseData", async () => {
		const mockFile = new File(["dummy"], "test.csv", { type: "text/csv" });
		vi.mocked(parseData).mockRejectedValue("String error");

		const event = new MessageEvent("message", {
			data: {
				id: 3,
				file: mockFile,
				type: "csv",
			},
		});

		await (self as WorkerSelf).onmessage?.(event);

		expect(postMessageMock).toHaveBeenCalledWith({
			id: 3,
			type: "error",
			error: "String error",
		});
	});
});
