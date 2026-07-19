import { describe, it, expect } from "vitest";
import {
	calculateDelimiterScore,
	detectDelimiter,
	detectDecimalPoint,
	detectColumnTypeAndFormat,
} from "../utils/detectors";

describe("detectors", () => {
	describe("calculateDelimiterScore", () => {
		it("should score higher for consistent delimiters", () => {
			const lines = ["a,b,c", "d,e,f", "g,h,i"];
			const commaScore = calculateDelimiterScore(lines, ",");
			const semiScore = calculateDelimiterScore(lines, ";");
			expect(commaScore).toBeGreaterThan(semiScore);
		});
	});

	describe("detectDelimiter", () => {
		it("should detect comma", () => {
			expect(detectDelimiter("a,b\nc,d", "csv")).toBe(",");
		});
		it("should detect semicolon", () => {
			expect(detectDelimiter("a;b\nc;d", "csv")).toBe(";");
		});
		it("should return comma for non-csv/excel types", () => {
			expect(detectDelimiter("a;b", "json")).toBe(",");
		});
	});

	describe("detectDecimalPoint", () => {
		it("should detect dot", () => {
			expect(detectDecimalPoint("1.23,4.56", ",")).toBe(".");
		});
		it("should detect comma", () => {
			expect(detectDecimalPoint("1,23;4,56", ";")).toBe(",");
		});
	});

	describe("detectColumnTypeAndFormat", () => {
		it("should detect ignore for empty string", () => {
			expect(detectColumnTypeAndFormat("", ".")).toEqual({ type: "ignore" });
		});
		it("should detect numeric", () => {
			expect(detectColumnTypeAndFormat("1.23", ".")).toEqual({ type: "numeric", dateFormat: undefined });
		});
		it("should detect date", () => {
			expect(detectColumnTypeAndFormat("2023-01-01", ".")).toEqual({ type: "date", dateFormat: "YYYY-MM-DD" });
		});
		it("should detect categorical", () => {
			expect(detectColumnTypeAndFormat("abc", ".")).toEqual({ type: "categorical", dateFormat: undefined });
		});
	});
});
