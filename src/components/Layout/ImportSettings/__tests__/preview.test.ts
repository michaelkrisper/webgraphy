import { describe, it, expect } from "vitest";
import {
	generatePreviewData,
	generateColumnConfigs,
	getPreferredXAxisColumn,
} from "../utils/preview";
import type { ColumnConfig } from "../../../../types/import";

describe("preview", () => {
	describe("generatePreviewData", () => {
		it("should parse basic CSV", () => {
			const data = generatePreviewData("A,B\n1,2\n3,4", "csv", ",", 1, "#");
			expect(data.headers).toEqual(["A", "B"]);
			expect(data.rows).toEqual([["1", "2"], ["3", "4"]]);
			expect(data.totalRows).toBe(2);
		});
		it("should parse basic JSON", () => {
			const jsonStr = '[{"A":"1","B":"2"},{"A":"3","B":"4"}]';
			const data = generatePreviewData(jsonStr, "json", ",", 1, "#");
			expect(data.headers).toEqual(["A", "B"]);
			expect(data.rows).toEqual([{ A: "1", B: "2" }, { A: "3", B: "4" }]);
			expect(data.totalRows).toBe(2);
		});
	});

	describe("generateColumnConfigs", () => {
		it("should auto-detect numeric column", () => {
			const previewData = {
				headers: ["Col1"],
				rows: [["1.23"]],
				skippedLines: [],
				gapStart: null,
				totalRows: 1,
			};
			const configs = generateColumnConfigs(previewData, {}, ".", "csv");
			expect(configs).toEqual([{ index: 0, name: "Col1", type: "numeric", dateFormat: undefined }]);
		});
		it("should use overrides", () => {
			const previewData = {
				headers: ["Col1"],
				rows: [["1.23"]],
				skippedLines: [],
				gapStart: null,
				totalRows: 1,
			};
			const configs = generateColumnConfigs(previewData, { 0: { type: "categorical" } }, ".", "csv");
			expect(configs).toEqual([{ index: 0, name: "Col1", type: "categorical", dateFormat: undefined }]);
		});
	});

	describe("getPreferredXAxisColumn", () => {
		it("should use override if valid", () => {
			const configs: ColumnConfig[] = [
				{ index: 0, name: "Col1", type: "numeric" },
				{ index: 1, name: "Col2", type: "date" },
			];
			expect(getPreferredXAxisColumn(configs, "Col1")).toBe("Col1");
		});
		it("should fallback to first date column", () => {
			const configs: ColumnConfig[] = [
				{ index: 0, name: "Col1", type: "numeric" },
				{ index: 1, name: "Col2", type: "date" },
			];
			expect(getPreferredXAxisColumn(configs, null)).toBe("Col2");
		});
	});
});
