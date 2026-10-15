import { beforeEach, describe, expect, it, vi } from "vitest";
import { handleExcelRequest } from "../excelHandler";

vi.mock("../excelHandler", () => ({
	handleExcelRequest: vi.fn(),
}));

type WorkerSelf = { onmessage?: (ev: MessageEvent) => Promise<void> };

describe("excel.worker entry", () => {
	let postMessageMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.clearAllMocks();
		postMessageMock = vi.fn();
		vi.stubGlobal("postMessage", postMessageMock);
		await import("../excel.worker");
	});

	it("forwards each request to the handler and posts its reply", async () => {
		const reply = { id: 7, type: "success", sheets: ["A"] };
		vi.mocked(handleExcelRequest).mockResolvedValue(reply as never);
		const request = { id: 7, action: "close", bookId: 1 };

		await (self as unknown as WorkerSelf).onmessage?.(
			new MessageEvent("message", { data: request }),
		);

		expect(handleExcelRequest).toHaveBeenCalledWith(request);
		expect(postMessageMock).toHaveBeenCalledTimes(1);
		expect(postMessageMock).toHaveBeenCalledWith(reply);
	});

	it("posts error replies unchanged so the client can reject the request", async () => {
		const reply = { id: 8, type: "error", error: "boom" };
		vi.mocked(handleExcelRequest).mockResolvedValue(reply as never);

		await (self as unknown as WorkerSelf).onmessage?.(
			new MessageEvent("message", { data: { id: 8, action: "bogus" } }),
		);

		expect(postMessageMock).toHaveBeenCalledWith(reply);
	});
});
