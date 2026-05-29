import { describe, expect, it, vi } from "vitest";
import * as jsonUtils from "../json";
import { parseData } from "../data-parser";

function createMockFile(content: string, name: string, type: string) {
	const file = new File([content], name, { type });
	file.stream = () => ({
		getReader: () => {
			let done = false;
			return {
				read: async () => {
					if (done) return { done: true, value: undefined };
					done = true;
					return { done: false, value: new TextEncoder().encode(content) };
				},
			};
		},
	});
	file.text = async () => content;
	return file as File;
}

describe("data-parser", () => {
	it("should throw an error for unsupported file types", async () => {
		const file = createMockFile("content", "test.xml", "application/xml");
		await expect(parseData(file, "unsupported")).rejects.toThrow(
			"Unsupported file type: unsupported",
		);
	});

	it("should handle native Error instances in catch block", async () => {
		const mockFile = {
			name: "test.csv",
			stream: () => {
				throw new Error("File stream error");
			},
		};
		await expect(
			parseData(mockFile as unknown as File, "csv", {}),
		).rejects.toThrow("File stream error");
	});

	it("should handle non-Error instances in catch block", async () => {
		const mockFile = {
			name: "test.csv",
			stream: () => {
				throw "String error thrown";
			},
		};
		await expect(
			parseData(mockFile as unknown as File, "csv", {}),
		).rejects.toThrow("String error thrown");
	});

	describe("CSV parsing", () => {
		it("should parse simple CSV data", async () => {
			const content = "Col1,Col2\n1.1,2.2\n3.3,4.4";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				decimalPoint: ".",
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].columns).toEqual(["Col1", "Col2"]);
			expect(datasets[0].rowCount).toBe(2);

			// data is relative to first point
			expect(datasets[0].data[0].refPoint).toBe(1.1);
			expect(datasets[0].data[0].data[0]).toBeCloseTo(0);
			expect(datasets[0].data[0].data[1]).toBeCloseTo(2.2);

			expect(datasets[0].data[1].refPoint).toBe(2.2);
			expect(datasets[0].data[1].data[0]).toBeCloseTo(0);
			expect(datasets[0].data[1].data[1]).toBeCloseTo(2.2);
		});

		it("should parse CSV with comma decimal point and semicolon delimiter", async () => {
			const content = "Col1;Col2\n1,1;2,2\n3,3;4,4";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ";",
				decimalPoint: ",",
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].rowCount).toBe(2);
			expect(datasets[0].data[0].refPoint).toBe(1.1);
		});

		it("should handle multi-character delimiters and quotes", async () => {
			const content = 'Col1||Col2\n"1.1"||"2.2"\n3.3||4.4';
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: "||",
				decimalPoint: ".",
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].rowCount).toBe(2);
			expect(datasets[0].data[0].refPoint).toBe(1.1);
		});

		it("should ignore lines with comment chars and skip start rows", async () => {
			const content =
				"# This is a comment\nSkip me\nCol1,Col2\n# Skip\n1.1,2.2\n3.3,4.4";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				decimalPoint: ".",
				commentChar: "#",
				startRow: 2,
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].columns).toEqual(["Col1", "Col2"]);
			expect(datasets[0].rowCount).toBe(2);
		});

		it("should handle empty CSV files", async () => {
			const file = createMockFile("", "empty.csv", "text/csv");
			await expect(parseData(file, "csv", {})).rejects.toThrow(
				"Empty CSV file",
			);
		});

		it("should parse date formats", async () => {
			const content = "Date,Val\n2025-12-24,10\n2025-12-25,20";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				columnConfigs: [
					{ index: 0, name: "Date", type: "date", dateFormat: "YYYY-MM-DD" },
					{ index: 1, name: "Val", type: "numeric" },
				],
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].data[0].refPoint).toBe(
				new Date(2025, 11, 24).getTime() / 1000,
			);
			expect(datasets[0].data[0].isFloat64).toBe(true);
		});

		it("should parse categorical columns", async () => {
			const content = "Category,Val\nApple,10\nBanana,20\nApple,30";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				columnConfigs: [
					{ index: 0, name: "Category", type: "categorical" },
					{ index: 1, name: "Val", type: "numeric" },
				],
			});

			expect(datasets).toHaveLength(1);
			const catCol = datasets[0].data[0];
			expect(catCol.categoryLabels).toEqual(["Apple", "Banana"]);
			expect(catCol.refPoint).toBe(0);
			expect(catCol.data[0]).toBe(0);
			expect(catCol.data[1]).toBe(1);
			expect(catCol.data[2]).toBe(0);
		});

		it("should split by categorical columns", async () => {
			const content =
				"Device,Status,Val\nSensorA,OK,10\nSensorA,FAIL,20\nSensorB,OK,30\nSensorB,FAIL,40";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				splitByColumns: ["Device", "Status"],
				columnConfigs: [
					{ index: 0, name: "Device", type: "categorical" },
					{ index: 1, name: "Status", type: "categorical" },
					{ index: 2, name: "Val", type: "numeric" },
				],
			});

			expect(datasets).toHaveLength(4);
			// Sorted by group name: "SensorA / FAIL", "SensorA / OK", "SensorB / FAIL", "SensorB / OK"
			expect(datasets[0].name).toContain("SensorA / FAIL");
			expect(datasets[0].columns).toEqual(["Val"]); // Split cols are excluded
			expect(datasets[0].rowCount).toBe(1);
			expect(datasets[0].data[0].refPoint).toBe(20);

			expect(datasets[1].name).toContain("SensorA / OK");
			expect(datasets[1].data[0].refPoint).toBe(10);
		});

		it("should ignore columns marked as ignore", async () => {
			const content = "Col1,IgnoreMe,Col3\n1,2,3\n4,5,6";
			const file = createMockFile(content, "test.csv", "text/csv");
			const datasets = await parseData(file, "csv", {
				delimiter: ",",
				columnConfigs: [
					{ index: 0, type: "numeric" },
					{ index: 1, type: "ignore" },
					{ index: 2, type: "numeric" },
				],
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].columns).toEqual(["Col1", "Col3"]);
		});
	});

	describe("JSON parsing", () => {
		it("should handle asynchronous errors from file.text()", async () => {
			const mockFile = {
				name: "test.json",
				text: async () => {
					throw new Error("File read error");
				},
			};
			await expect(
				parseData(mockFile as unknown as File, "json", {}),
			).rejects.toThrow("File read error");
		});

		it("should throw error for empty array JSON", async () => {
			const file = createMockFile(
				"[]",
				"test.json",
				"application/json",
			);
			await expect(parseData(file, "json", {})).rejects.toThrow(
				"Invalid JSON format: Expected a non-empty array of objects",
			);
		});

		it("should parse simple JSON data", async () => {
			const data = [
				{ Time: 10, Temp: 1.1 },
				{ Time: 20, Temp: 2.2 },
			];
			const file = createMockFile(
				JSON.stringify(data),
				"test.json",
				"application/json",
			);
			const datasets = await parseData(file, "json", {});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].columns).toEqual(["Time", "Temp"]);
			expect(datasets[0].rowCount).toBe(2);
			expect(datasets[0].data[1].refPoint).toBe(1.1);
		});

		it("should throw error for valid JSON that is not an array", async () => {
			const file = createMockFile(
				'{"not_an_array": true}',
				"test.json",
				"application/json",
			);
			await expect(parseData(file, "json", {})).rejects.toThrow(
				"Invalid JSON format: Expected a non-empty array of objects",
			);
		});

		it("should throw error for invalid JSON format", async () => {
			const file = createMockFile(
				"[not json]",
				"test.json",
				"application/json",
			);
			await expect(parseData(file, "json", {})).rejects.toThrow(
				/^Invalid JSON format: /
			);
		});

		it("should handle non-Error instances when parsing JSON", async () => {
			const parseSpy = vi.spyOn(jsonUtils, "secureJSONParse").mockImplementation(() => {
				throw "String error thrown";
			});

			const file = createMockFile("[{}]", "test.json", "application/json");

			await expect(parseData(file, "json", {})).rejects.toThrow(
				"Invalid JSON format: String error thrown",
			);

			parseSpy.mockRestore();
		});

		it("should handle parsing configurations in JSON", async () => {
			const data = [
				{ Date: "2025-12-24", Category: "A", Value: "1,1" },
				{ Date: "2025-12-25", Category: "B", Value: "2,2" },
			];
			const file = createMockFile(
				JSON.stringify(data),
				"test.json",
				"application/json",
			);
			const datasets = await parseData(file, "json", {
				decimalPoint: ",",
				columnConfigs: [
					{ index: 0, name: "Date", type: "date", dateFormat: "YYYY-MM-DD" },
					{ index: 1, name: "Category", type: "categorical" },
					{ index: 2, name: "Value", type: "numeric" },
				],
			});

			expect(datasets).toHaveLength(1);
			expect(datasets[0].data[0].refPoint).toBe(
				new Date(2025, 11, 24).getTime() / 1000,
			);
			expect(datasets[0].data[1].categoryLabels).toEqual(["A", "B"]);
			expect(datasets[0].data[2].refPoint).toBe(1.1);
		});
	});
});
