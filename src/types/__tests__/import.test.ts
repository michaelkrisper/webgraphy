import { describe, it, expectTypeOf } from "vitest";
import type { ColumnType, ColumnConfig, ImportSettings } from "../import";

describe("Import Types", () => {
	it("ColumnType should match expected union", () => {
		expectTypeOf<ColumnType>().toEqualTypeOf<
			"numeric" | "date" | "categorical" | "ignore"
		>();
	});

	it("ColumnConfig should have the correct shape", () => {
		expectTypeOf<ColumnConfig>().toEqualTypeOf<{
			index: number;
			name: string;
			type: ColumnType;
			dateFormat?: string;
		}>();
	});

	it("ImportSettings should have the correct shape", () => {
		expectTypeOf<ImportSettings>().toEqualTypeOf<{
			delimiter: string;
			decimalPoint: string;
			startRow: number;
			commentChar: string;
			columnConfigs: ColumnConfig[];
			xAxisColumn?: string;
			splitByColumns?: string[];
		}>();
	});

	it("should allow valid ColumnConfig assignments", () => {
		const config: ColumnConfig = {
			index: 1,
			name: "DateCol",
			type: "date",
			dateFormat: "YYYY-MM-DD",
		};
		expectTypeOf(config).toMatchTypeOf<ColumnConfig>();
	});

	it("should allow valid ImportSettings assignments", () => {
		const settings: ImportSettings = {
			delimiter: ",",
			decimalPoint: ".",
			startRow: 0,
			commentChar: "#",
			columnConfigs: [
				{
					index: 0,
					name: "A",
					type: "numeric",
				},
			],
			xAxisColumn: "A",
			splitByColumns: ["B"],
		};
		expectTypeOf(settings).toMatchTypeOf<ImportSettings>();
	});
});
