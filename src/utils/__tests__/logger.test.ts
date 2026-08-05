import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { logger } from "../logger";

describe("logger", () => {
	beforeEach(() => {
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "warn").mockImplementation(() => {});
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	describe("error", () => {
		it("should delegate to console.error with a single string message", () => {
			logger.error("test error message");
			expect(console.error).toHaveBeenCalledTimes(1);
			expect(console.error).toHaveBeenCalledWith("test error message");
		});

		it("should delegate to console.error with a message and multiple details", () => {
			const detail1 = { key: "value" };
			const detail2 = [1, 2, 3];
			logger.error("test error message", detail1, detail2);
			expect(console.error).toHaveBeenCalledTimes(1);
			expect(console.error).toHaveBeenCalledWith("test error message", detail1, detail2);
		});
	});

	describe("warn", () => {
		it("should delegate to console.warn with a single string message", () => {
			logger.warn("test warn message");
			expect(console.warn).toHaveBeenCalledTimes(1);
			expect(console.warn).toHaveBeenCalledWith("test warn message");
		});

		it("should delegate to console.warn with a message and multiple details", () => {
			const detail1 = { key: "value" };
			const detail2 = [1, 2, 3];
			logger.warn("test warn message", detail1, detail2);
			expect(console.warn).toHaveBeenCalledTimes(1);
			expect(console.warn).toHaveBeenCalledWith("test warn message", detail1, detail2);
		});
	});
});
