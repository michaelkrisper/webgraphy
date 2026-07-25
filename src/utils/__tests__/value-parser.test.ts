import { describe, it, expect } from "vitest";
import { parseDate, parseValue } from "../value-parser";
import type { ParseConfig } from "../parser-types";

describe("parseDate", () => {
	it("should parse date without format using standard Date", () => {
		const val = "2023-10-15T12:00:00Z";
		const expected = new Date(val).getTime() / 1000;
		expect(parseDate(val)).toBe(expected);
	});

	it("should parse date with full format", () => {
		// "YYYY-MM-DD HH:mm:ss"
		const val = "2023-10-15 14:30:45";
		const format = "YYYY-MM-DD HH:mm:ss";

		const expectedDate = new Date();
		expectedDate.setFullYear(2023, 9, 15);
		expectedDate.setHours(14, 30, 45, 0);

		expect(parseDate(val, format)).toBe(expectedDate.getTime() / 1000);
	});

	it("should parse date with partial format", () => {
		// "YYYY-MM"
		const val = "2023-10";
		const format = "YYYY-MM";

		const expectedDate = new Date();
		expectedDate.setFullYear(2023, 9, 1);
		expectedDate.setHours(0, 0, 0, 0);

		expect(parseDate(val, format)).toBe(expectedDate.getTime() / 1000);
	});

	it("should fallback to standard Date parsing if computed fields are NaN", () => {
		// e.g. "invalid" with format "YYYY-MM"
		const val = "invalid";
		const format = "YYYY-MM";

		const expected = new Date(val).getTime() / 1000;
		expect(parseDate(val, format)).toBe(expected);
	});

	it("should correctly handle cached format indices", () => {
		const val1 = "2023-10-15";
		const val2 = "2024-11-16";
		const format = "YYYY-MM-DD";

		const expectedDate1 = new Date();
		expectedDate1.setFullYear(2023, 9, 15);
		expectedDate1.setHours(0, 0, 0, 0);

		const expectedDate2 = new Date();
		expectedDate2.setFullYear(2024, 10, 16);
		expectedDate2.setHours(0, 0, 0, 0);

		expect(parseDate(val1, format)).toBe(expectedDate1.getTime() / 1000);
		expect(parseDate(val2, format)).toBe(expectedDate2.getTime() / 1000);
	});
});

describe("parseValue", () => {
	it("should return NaN for empty, null, or undefined values", () => {
		expect(parseValue("", null, false, new Map())).toBeNaN();
		expect(parseValue(undefined as any, null, false, new Map())).toBeNaN();
		expect(parseValue(null as any, null, false, new Map())).toBeNaN();
	});

	it("should parse date type", () => {
		const config: ParseConfig = { type: "date", dateFormat: "YYYY-MM-DD" };
		const val = "2023-10-15";
		const expectedDate = new Date();
		expectedDate.setFullYear(2023, 9, 15);
		expectedDate.setHours(0, 0, 0, 0);

		expect(parseValue(val, config, false, new Map())).toBe(expectedDate.getTime() / 1000);
	});

	it("should parse categorical type and update map", () => {
		const config: ParseConfig = { type: "categorical" };
		const map = new Map<string, number>();

		expect(parseValue("A", config, false, map)).toBe(0);
		expect(map.get("A")).toBe(0);

		expect(parseValue("B", config, false, map)).toBe(1);
		expect(map.get("B")).toBe(1);

		expect(parseValue("A", config, false, map)).toBe(0);
	});

	it("should parse numeric value with or without comma", () => {
		expect(parseValue("123.45", null, false, new Map())).toBe(123.45);
		expect(parseValue("123,45", null, true, new Map())).toBe(123.45);
		expect(parseValue("abc", null, false, new Map())).toBeNaN();
	});
});
