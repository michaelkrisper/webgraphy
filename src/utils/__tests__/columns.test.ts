import { describe, expect, it } from "vitest";
import type { Dataset } from "../../services/persistence";
import { getColumnIndex } from "../columns";

describe("getColumnIndex", () => {
	const mockDataset = (columns: string[], id = "test-ds"): Dataset => ({
		id,
		name: "Test Dataset",
		columns,
		data: [],
		rowCount: 0,
		xAxisColumn: columns[0] || "",
		xAxisId: "axis-1",
	});

	it("should return the correct index for an exact match", () => {
		const ds = mockDataset(["Timestamp", "Value", "Status"]);
		expect(getColumnIndex(ds, "Value")).toBe(1);
		expect(getColumnIndex(ds, "Timestamp")).toBe(0);
		expect(getColumnIndex(ds, "Status")).toBe(2);
	});

	it("should return the correct index for a suffix match", () => {
		const ds = mockDataset(["A: Time", "B: Temperature", "C: Humidity"]);
		expect(getColumnIndex(ds, "Time")).toBe(0);
		expect(getColumnIndex(ds, "Temperature")).toBe(1);
		expect(getColumnIndex(ds, "Humidity")).toBe(2);
	});

	it("should return -1 if the column is not found", () => {
		const ds = mockDataset(["A", "B", "C"]);
		expect(getColumnIndex(ds, "D")).toBe(-1);
	});

	it("should resolve independently per dataset", () => {
		const ds1 = mockDataset(["A", "B", "C"], "ds1");
		const ds2 = mockDataset(["X", "Y", "Z"], "ds2");

		expect(getColumnIndex(ds1, "A")).toBe(0);
		expect(getColumnIndex(ds2, "A")).toBe(-1);
		expect(getColumnIndex(ds2, "X")).toBe(0);
	});

	it("should handle edge case where columnName is empty", () => {
		const ds = mockDataset(["A", "B", ""]);
		expect(getColumnIndex(ds, "")).toBe(2);
	});

	it("should prioritize exact match over suffix match", () => {
		const ds = mockDataset(["Time", "A: Time"]);
		// indexOf is called first, finding 'Time' at index 0
		expect(getColumnIndex(ds, "Time")).toBe(0);
	});

	it("should handle suffix match when exact match is also present but later", () => {
		const ds = mockDataset(["A: Time", "Time"]);
		// indexOf will find 'Time' at index 1 first
		expect(getColumnIndex(ds, "Time")).toBe(1);
	});
});
