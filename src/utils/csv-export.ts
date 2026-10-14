import type {
	DataColumn,
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../services/persistence";
import { getAxisById } from "./axisCalculations";
import { getColumnIndex } from "./columns";

/**
 * CSV/TSV serialisation of dataset columns. Pure: the chunked driver and the
 * download live in `services/csvExport.ts`.
 */

/**
 * Excel decodes a BOM-less CSV in the legacy ANSI code page, which mangles
 * every non-ASCII header ("°C", "m²"); the UTF-8 BOM is the only signal it
 * honours. pandas, R and LibreOffice all skip it, so it costs nothing there.
 */
export const UTF8_BOM = "\uFEFF";

/** RFC 4180 record separator. */
export const CSV_EOL = "\r\n";

export type CellKind = "number" | "date" | "category";

/** Mirrors the store's `xModeFor`, so a column exports as the axis shows it. */
export function columnKind(col: DataColumn): CellKind {
	if (col.categoryLabels) return "category";
	return col.isFloat64 ? "date" : "number";
}

const FORMULA_TRIGGER = /^[=+\-@\t\r]/;

/**
 * A text cell made safe for spreadsheets: a leading `= + - @ TAB CR` would be
 * evaluated as a formula, so it is defused with a `'` prefix; the result is
 * then quoted per RFC 4180 if it contains the delimiter, a quote or a newline.
 * Only for text — numbers go through {@link formatStoredNumber} and keep
 * their sign.
 */
export function escapeTextCell(text: string, delimiter = ","): string {
	const safe = FORMULA_TRIGGER.test(text) ? `'${text}` : text;
	if (
		safe.includes(delimiter) ||
		safe.includes('"') ||
		safe.includes("\n") ||
		safe.includes("\r")
	) {
		return `"${safe.replaceAll('"', '""')}"`;
	}
	return safe;
}

const fits = (s: string, rel: number, ref: number) =>
	Math.fround(Number(s) - ref) === rel;

/**
 * The shortest decimal that re-imports to the same stored value.
 *
 * A column stores `rel = fround(value - refPoint)`, so its precision is the
 * Float32 resolution of `rel`, not of the reconstructed float64 `rel + ref`.
 * Printing the latter with `String()` would emit up to 17 digits of which the
 * last ~9 are noise; instead this finds the fewest decimals whose value maps
 * back to the identical Float32 through the parser's own
 * `fround(value - refPoint)`.
 */
export function formatStoredNumber(rel: number, ref: number): string {
	return formatStoredNumberD(rel, ref, 6)[0];
}

const MAX_FIXED_DECIMALS = 22;
const POW10 = Array.from({ length: MAX_FIXED_DECIMALS + 1 }, (_, i) => 10 ** i);

/**
 * `v` with `d` decimals, built from an integer: `toFixed`/`toPrecision` go
 * through V8's slow bignum path and dominate a 10M-row export. Null when the
 * scaled value no longer fits a safe integer.
 */
function scaledFixed(v: number, d: number): string | null {
	const m = Math.round(v * POW10[d]);
	if (!(Math.abs(m) < Number.MAX_SAFE_INTEGER)) return null;
	if (d === 0) return String(m);
	let digits = String(Math.abs(m));
	if (digits.length <= d) digits = "0".repeat(d + 1 - digits.length) + digits;
	const cut = digits.length - d;
	return `${m < 0 ? "-" : ""}${digits.slice(0, cut)}.${digits.slice(cut)}`;
}

/**
 * Returns the string and the decimal count it used. `hint` is the previous
 * cell's count — consecutive values of a column need nearly the same number
 * of decimals, which keeps the search at about two probes per cell.
 */
function formatStoredNumberD(
	rel: number,
	ref: number,
	hint: number,
): [string, number] {
	const v = rel + ref;
	let d = hint;
	let s = scaledFixed(v, d);
	if (s !== null && fits(s, rel, ref)) {
		while (d > 0) {
			const shorter = scaledFixed(v, d - 1);
			if (shorter === null || !fits(shorter, rel, ref)) break;
			s = shorter;
			d--;
		}
		return [s, d];
	}
	// Too large for this many decimals: restart the search from integers.
	if (s === null) d = -1;
	while (d < MAX_FIXED_DECIMALS) {
		d++;
		s = scaledFixed(v, d);
		if (s === null) break;
		if (fits(s, rel, ref)) return [s, d];
	}
	// Beyond the fixed-point range (|v| >= ~1e15, or tiny magnitudes): search
	// significant digits instead; `String(Number())` drops trailing zeros.
	for (let p = 1; p < 17; p++) {
		const t = v.toPrecision(p);
		if (fits(t, rel, ref)) return [String(Number(t)), hint];
	}
	return [String(v), hint];
}

// Date's valid range, ±8.64e15 ms; `toISOString` throws outside it.
const MAX_DATE_SECONDS = 8.64e12;

/** Epoch seconds as UTC ISO 8601 with milliseconds, or null outside Date's range. */
export function formatIsoDate(seconds: number): string | null {
	if (!Number.isFinite(seconds) || Math.abs(seconds) > MAX_DATE_SECONDS) {
		return null;
	}
	// Rounded, not truncated: `new Date()` would drop a .9999 ms float residue.
	return new Date(Math.round(seconds * 1000)).toISOString();
}

/**
 * Formats one stored cell of `col`. Stateful per column (the digit hint), so
 * create one per column and call it row by row.
 */
export function makeCellFormatter(
	col: DataColumn,
	delimiter = ",",
): (rel: number) => string {
	const ref = col.refPoint;
	const kind = columnKind(col);
	let hint = 6;
	const number = (rel: number) => {
		const [s, d] = formatStoredNumberD(rel, ref, hint);
		hint = d;
		return s;
	};
	if (kind === "date") {
		return (rel) => {
			if (!Number.isFinite(rel)) return "";
			return formatIsoDate(rel + ref) ?? number(rel);
		};
	}
	if (kind === "category") {
		const labels = col.categoryLabels ?? [];
		return (rel) => {
			if (!Number.isFinite(rel)) return "";
			const label = labels[Math.round(rel + ref)];
			return label === undefined ? number(rel) : escapeTextCell(label, delimiter);
		};
	}
	return (rel) => (Number.isFinite(rel) ? number(rel) : "");
}

export interface CsvTable {
	headers: string[];
	columns: DataColumn[];
	/** Row indices into the columns, or a plain row count for all rows. */
	rows: Uint32Array | number;
}

/** Row count of a {@link CsvTable}. */
export function csvRowCount(table: CsvTable): number {
	return typeof table.rows === "number" ? table.rows : table.rows.length;
}

/**
 * Yields the CSV text in pieces: the BOM plus header first, then one string
 * per `rowsPerChunk` rows. Joining the pieces gives the file; the driver
 * hands them to `Blob` as parts so no single giant string is ever built.
 */
export function* csvChunks(
	table: CsvTable,
	{ delimiter = ",", rowsPerChunk = 2000, bom = true } = {},
): Generator<string> {
	const head = table.headers.map((h) => escapeTextCell(h, delimiter));
	yield (bom ? UTF8_BOM : "") + head.join(delimiter) + CSV_EOL;

	const fmts = table.columns.map((c) => makeCellFormatter(c, delimiter));
	const datas = table.columns.map((c) => c.data);
	const nCols = datas.length;
	const total = csvRowCount(table);
	const idx = typeof table.rows === "number" ? null : table.rows;

	for (let start = 0; start < total; start += rowsPerChunk) {
		const end = Math.min(total, start + rowsPerChunk);
		let out = "";
		for (let r = start; r < end; r++) {
			const row = idx ? idx[r] : r;
			for (let c = 0; c < nCols; c++) {
				if (c > 0) out += delimiter;
				out += fmts[c](datas[c][row]);
			}
			out += CSV_EOL;
		}
		yield out;
	}
}

/** Whole table as one string (small tables and tests). */
export function toCsvString(
	table: CsvTable,
	options?: Parameters<typeof csvChunks>[1],
): string {
	let s = "";
	for (const chunk of csvChunks(table, options)) s += chunk;
	return s;
}

/** Every column of a dataset, calculated ones included, in column order. */
export function datasetCsvTable(ds: Dataset): CsvTable {
	return {
		headers: [...ds.columns],
		columns: ds.data,
		rows: Math.min(ds.rowCount, ...ds.data.map((c) => c.data.length)),
	};
}

/**
 * Indices of the rows whose world x (`data[i] + refPoint`) lies within
 * `[min, max]`. x need not be sorted; NaN rows never match.
 */
export function selectRowsInRange(
	xCol: DataColumn,
	min: number,
	max: number,
): Uint32Array {
	const data = xCol.data;
	const lo = min - xCol.refPoint;
	const hi = max - xCol.refPoint;
	let count = 0;
	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (v >= lo && v <= hi) count++;
	}
	const out = new Uint32Array(count);
	let k = 0;
	for (let i = 0; i < data.length; i++) {
		const v = data[i];
		if (v >= lo && v <= hi) out[k++] = i;
	}
	return out;
}

export interface VisibleCsvTable {
	dataset: Dataset;
	table: CsvTable;
}

/**
 * One table per dataset that has a visible series: the rows inside its
 * x-axis's current range, the x column first, then each plotted column once
 * in series order.
 */
export function visibleCsvTables({
	series,
	datasets,
	xAxes,
}: {
	series: readonly SeriesConfig[];
	datasets: readonly Dataset[];
	xAxes: readonly XAxisConfig[];
}): VisibleCsvTable[] {
	const out: VisibleCsvTable[] = [];
	for (const ds of datasets) {
		const xIdx = getColumnIndex(ds, ds.xAxisColumn);
		const xAxis = getAxisById(xAxes as XAxisConfig[], ds.xAxisId);
		if (xIdx === -1 || !xAxis) continue;
		const colIdxs = [xIdx];
		let plotted = false;
		for (const s of series) {
			if (s.hidden || s.sourceId !== ds.id) continue;
			const i = getColumnIndex(ds, s.yColumn);
			if (i === -1) continue;
			plotted = true;
			if (!colIdxs.includes(i)) colIdxs.push(i);
		}
		if (!plotted) continue;
		out.push({
			dataset: ds,
			table: {
				headers: colIdxs.map((i) => ds.columns[i]),
				columns: colIdxs.map((i) => ds.data[i]),
				rows: selectRowsInRange(ds.data[xIdx], xAxis.min, xAxis.max),
			},
		});
	}
	return out;
}

/** A file name derived from a dataset name: no path separators, no extension doubling. */
export function csvFileName(datasetName: string, suffix = ""): string {
	const base =
		datasetName
			.replace(/\.(csv|tsv|txt|json|xlsx?)$/i, "")
			// eslint-disable-next-line no-control-regex -- stripping them is the point
			.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_")
			.trim() || "dataset";
	return `${base}${suffix}.csv`;
}
