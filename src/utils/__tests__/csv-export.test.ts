import { describe, expect, it } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../services/persistence";
import {
	columnKind,
	csvChunks,
	csvFileName,
	datasetCsvTable,
	escapeTextCell,
	formatIsoDate,
	formatStoredNumber,
	makeCellFormatter,
	selectRowsInRange,
	toCsvString,
	UTF8_BOM,
	visibleCsvTables,
} from "../csv-export";
import { processRawColumn } from "../data-processing";

const col = (values: number[], extra: Partial<DataColumn> = {}): DataColumn => {
	const { data, refPoint, bounds } = processRawColumn(values);
	return { isFloat64: false, refPoint, bounds, data, ...extra };
};

describe("escapeTextCell", () => {
	it("leaves plain text alone", () => {
		expect(escapeTextCell("Temperature (°C)")).toBe("Temperature (°C)");
	});

	it("quotes delimiters, quotes and line breaks per RFC 4180", () => {
		expect(escapeTextCell("a,b")).toBe('"a,b"');
		expect(escapeTextCell('say "hi"')).toBe('"say ""hi"""');
		expect(escapeTextCell("two\nlines")).toBe('"two\nlines"');
		expect(escapeTextCell("cr\rlf")).toBe('"cr\rlf"');
	});

	it("quotes for the delimiter in use", () => {
		expect(escapeTextCell("a,b", "\t")).toBe("a,b");
		expect(escapeTextCell("a\tb", "\t")).toBe('"a\tb"');
	});

	it.each(["=SUM(A1)", "+1", "-2+3", "@cmd", "\tx", "\rx"])(
		"defuses formula trigger %j",
		(text) => {
			expect(escapeTextCell(text).replace(/^"/, "")).toMatch(/^'/);
		},
	);

	it("guards and then quotes when both apply", () => {
		expect(escapeTextCell('=HYPERLINK("x",1)')).toBe('"\'=HYPERLINK(""x"",1)"');
	});
});

describe("formatStoredNumber", () => {
	it("prints the shortest decimal for Float32 data, not float64 noise", () => {
		const rel = Math.fround(15.234567);
		expect(String(rel)).toBe("15.234566688537598");
		expect(formatStoredNumber(rel, 0)).toBe("15.234567");
		expect(formatStoredNumber(Math.fround(0.1), 0)).toBe("0.1");
	});

	it("adds the refPoint back", () => {
		expect(formatStoredNumber(Math.fround(0.5), 100000.123)).toBe("100000.623");
		// The reference row itself is the exact original float64.
		expect(formatStoredNumber(0, 0.30000000000000004)).toBe(
			"0.30000000000000004",
		);
		expect(formatStoredNumber(0, 1234.5678)).toBe("1234.5678");
	});

	it("keeps negative numbers numeric (no injection prefix)", () => {
		expect(formatStoredNumber(Math.fround(-1.5), 0)).toBe("-1.5");
		expect(formatStoredNumber(Math.fround(-0.05), 0)).toBe("-0.05");
	});

	it("handles integers and extreme magnitudes", () => {
		expect(formatStoredNumber(42, 0)).toBe("42");
		const tiny = Math.fround(1e-30);
		expect(Math.fround(Number(formatStoredNumber(tiny, 0)))).toBe(tiny);
		const huge = Math.fround(3e25);
		expect(Math.fround(Number(formatStoredNumber(huge, 0)))).toBe(huge);
	});

	it("round-trips through the importer's own refPoint/Float32 path", () => {
		let seed = 12345;
		const rand = () => {
			seed = (seed * 1103515245 + 12345) % 2147483648;
			return seed / 2147483648;
		};
		for (const scale of [1e-6, 1, 1000, 1e7]) {
			const values = Array.from(
				{ length: 500 },
				() => (rand() - 0.3) * scale + scale * 3.7,
			);
			const c = col(values);
			const fmt = makeCellFormatter(c);
			const text = Array.from(c.data, (v) => fmt(v));
			const back = processRawColumn(text.map(Number));
			expect(back.refPoint).toBe(c.refPoint);
			expect(Array.from(back.data)).toEqual(Array.from(c.data));
			// And no gratuitous digits: Float32 carries < 10 significant ones
			// relative to the refPoint row.
			for (const s of text.slice(1)) {
				expect(s.replace(/[-.]/g, "").replace(/^0+/, "").length).toBeLessThan(17);
			}
		}
	});
});

describe("formatIsoDate", () => {
	it("formats epoch seconds as UTC ISO 8601", () => {
		expect(formatIsoDate(0)).toBe("1970-01-01T00:00:00.000Z");
		expect(formatIsoDate(1700000000.25)).toBe("2023-11-14T22:13:20.250Z");
	});

	it("rounds a float residue to the nearest millisecond", () => {
		expect(formatIsoDate(1.0009999999)).toBe("1970-01-01T00:00:01.001Z");
	});

	it("returns null outside Date's range", () => {
		expect(formatIsoDate(1e20)).toBeNull();
		expect(formatIsoDate(Number.NaN)).toBeNull();
	});
});

describe("makeCellFormatter", () => {
	it("reconstructs date columns from Float32 + refPoint as ISO strings", () => {
		const c = col([1700000000, 1700000060, Number.NaN], { isFloat64: true });
		expect(columnKind(c)).toBe("date");
		const fmt = makeCellFormatter(c);
		expect(Array.from(c.data, fmt)).toEqual([
			"2023-11-14T22:13:20.000Z",
			"2023-11-14T22:14:20.000Z",
			"",
		]);
	});

	it("writes category labels as guarded text", () => {
		const c = col([0, 1, 2], { categoryLabels: ["a,b", "=evil()", "plain"] });
		const fmt = makeCellFormatter(c);
		expect(Array.from(c.data, fmt)).toEqual(['"a,b"', "'=evil()", "plain"]);
	});

	it("writes NaN and infinities as empty cells", () => {
		const fmt = makeCellFormatter(col([1, 2]));
		expect(fmt(Number.NaN)).toBe("");
		expect(fmt(Number.POSITIVE_INFINITY)).toBe("");
	});
});

const dataset = (): Dataset => ({
	id: "ds-1",
	name: "Sensors.csv",
	columns: ["time", "temp, °C", "=calc"],
	rowCount: 4,
	xAxisColumn: "time",
	xAxisId: "axis-1",
	data: [
		col([10, 11, 12, 13]),
		col([-1.5, Number.NaN, 2.25, 3]),
		{ ...col([1, 2, 3, 4]), formula: "[time] * 2" },
	],
});

describe("toCsvString", () => {
	it("writes BOM, guarded and quoted headers, CRLF rows and empty NaN cells", () => {
		const csv = toCsvString(datasetCsvTable(dataset()));
		expect(csv.startsWith(UTF8_BOM)).toBe(true);
		expect(csv.slice(1)).toBe(
			[
				`time,"temp, °C",'=calc`,
				"10,-1.5,1",
				"11,,2",
				"12,2.25,3",
				"13,3,4",
				"",
			].join("\r\n"),
		);
	});

	it("can omit the BOM and use another delimiter", () => {
		const csv = toCsvString(datasetCsvTable(dataset()), {
			bom: false,
			delimiter: "\t",
		});
		expect(csv.split("\r\n")[0]).toBe("time\ttemp, °C\t'=calc");
	});

	it("yields the same text however it is chunked", () => {
		const table = datasetCsvTable(dataset());
		const chunks = [...csvChunks(table, { rowsPerChunk: 1 })];
		expect(chunks).toHaveLength(5);
		expect(chunks.join("")).toBe(toCsvString(table));
	});
});

describe("datasetCsvTable", () => {
	it("includes calculated columns", () => {
		const table = datasetCsvTable(dataset());
		expect(table.headers).toEqual(["time", "temp, °C", "=calc"]);
		expect(table.columns).toHaveLength(3);
		expect(table.rows).toBe(4);
	});
});

describe("selectRowsInRange", () => {
	it("compares world x (data + refPoint), inclusive, unsorted, skipping NaN", () => {
		const x = col([1000, 1003, 1001, Number.NaN, 1005, 1002]);
		expect(x.refPoint).toBe(1000);
		expect(Array.from(selectRowsInRange(x, 1001, 1003))).toEqual([1, 2, 5]);
		expect(selectRowsInRange(x, 2000, 3000)).toHaveLength(0);
	});
});

describe("visibleCsvTables", () => {
	const xAxes = [
		{
			id: "axis-1",
			name: "",
			min: 11,
			max: 12,
			showGrid: true,
			xMode: "numeric",
		},
	] as XAxisConfig[];
	const s = (id: string, yColumn: string, extra = {}) =>
		({
			id,
			sourceId: "ds-1",
			name: id,
			yColumn,
			yAxisId: "axis-1",
			hidden: false,
			...extra,
		}) as unknown as SeriesConfig;

	it("emits the x column then each plotted column once, rows in range", () => {
		const [t] = visibleCsvTables({
			series: [s("a", "=calc"), s("b", "temp, °C"), s("c", "=calc")],
			datasets: [dataset()],
			xAxes,
		});
		expect(t.table.headers).toEqual(["time", "=calc", "temp, °C"]);
		expect(Array.from(t.table.rows as Uint32Array)).toEqual([1, 2]);
		expect(toCsvString(t.table, { bom: false })).toBe(
			'time,\'=calc,"temp, °C"\r\n11,2,\r\n12,3,2.25\r\n',
		);
	});

	it("skips datasets without a visible series", () => {
		expect(
			visibleCsvTables({
				series: [s("a", "temp, °C", { hidden: true })],
				datasets: [dataset()],
				xAxes,
			}),
		).toEqual([]);
	});

	it("keeps a dataset whose only series plots the x column", () => {
		const [t] = visibleCsvTables({
			series: [s("a", "time")],
			datasets: [dataset()],
			xAxes,
		});
		expect(t.table.headers).toEqual(["time"]);
	});
});

describe("csvFileName", () => {
	it("drops the source extension and path-hostile characters", () => {
		expect(csvFileName("Sensors.csv")).toBe("Sensors.csv");
		expect(csvFileName("log.txt (group A)")).toBe("log.txt (group A).csv");
		expect(csvFileName("a/b:c.xlsx", "-visible")).toBe("a_b_c-visible.csv");
		expect(csvFileName("   ")).toBe("dataset.csv");
	});
});
