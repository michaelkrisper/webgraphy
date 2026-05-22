// Data Parser (v0.5.0 - Main Thread)

import type { DataColumn } from "../services/persistence";
import { processRawColumn } from "./data-processing";
import { secureJSONParse } from "./json";

interface ColumnConfigEntry {
	index: number;
	name?: string;
	type?: "numeric" | "date" | "categorical" | "ignore";
	dateFormat?: string;
}

export interface ParseSettings {
	delimiter?: string;
	decimalPoint?: string;
	startRow?: number;
	commentChar?: string;
	columnConfigs?: ColumnConfigEntry[];
	xAxisColumn?: string;
	splitByColumns?: string[];
}

interface ParseConfig {
	type?: string;
	dateFormat?: string;
}

export async function parseData(
	file: File,
	type: string,
	settings?: ParseSettings,
) {
	let result: Awaited<ReturnType<typeof parseCSV>>;
	if (type === "csv") result = await parseCSV(file, settings);
	else if (type === "json") result = await parseJSON(file, settings);
	else throw new Error(`Unsupported file type: ${type}`);

	const allColumns: string[] = result.columns;
	const allData: Float64Array[] = result.data;
	const totalRows: number = result.rowCount;
	const categoricalMaps: Map<string, number>[] = result.categoricalMaps;

	const configByName = new Map<string, ColumnConfigEntry>();
	if (settings?.columnConfigs) {
		for (let i = 0; i < settings.columnConfigs.length; i++) {
			const config = settings.columnConfigs[i];
			if (config.name) configByName.set(config.name, config);
		}
	}

	// Group row indices by combined values across all split columns. Each
	// active split column must be categorical and present in active columns.
	const splitColNames = settings?.splitByColumns ?? [];
	const splitColIdxs: number[] = [];
	const splitColIdxSet = new Set<number>();
	for (const name of splitColNames) {
		const idx = allColumns.indexOf(name);
		const cfg = configByName.get(name);
		if (idx >= 0 && cfg?.type === "categorical") {
			splitColIdxs.push(idx);
			splitColIdxSet.add(idx);
		}
	}
	const doSplit = splitColIdxs.length > 0;

	// rowIdxs === null means "identity mapping" — every row index maps to itself.
	// Keeps the non-split fast path from allocating a redundant index array.
	const groups: { name: string; rowIdxs: number[] | null }[] = [];
	if (doSplit) {
		const valueToNames = splitColIdxs.map((idx) => {
			const m = new Map<number, string>();
			categoricalMaps[idx].forEach((id, key) => {
				m.set(id, key);
			});
			return m;
		});
		const groupByKey = new Map<string, { name: string; rowIdxs: number[] }>();
		for (let r = 0; r < totalRows; r++) {
			let key = "";
			let name = "";
			for (let s = 0; s < splitColIdxs.length; s++) {
				const v = allData[splitColIdxs[s]][r];
				const label = valueToNames[s].get(v) ?? String(v);
				if (s > 0) {
					key += "\0";
					name += " / ";
				}
				key += String(v);
				name += label;
			}
			let g = groupByKey.get(key);
			if (!g) {
				g = { name, rowIdxs: [] };
				groupByKey.set(key, g);
			}
			g.rowIdxs.push(r);
		}
		groupByKey.forEach((g) => {
			groups.push(g);
		});
		groups.sort((a, b) => a.name.localeCompare(b.name));
	} else {
		groups.push({ name: "", rowIdxs: null });
	}

	// Output columns exclude the split columns themselves
	const outputColIdxs: number[] = [];
	const outputColumns: string[] = [];
	for (let i = 0; i < allColumns.length; i++) {
		if (doSplit && splitColIdxSet.has(i)) continue;
		outputColIdxs.push(i);
		outputColumns.push(allColumns[i]);
	}

	const datasets = groups.map((group) => {
		const rowIdxs = group.rowIdxs;
		const groupRowCount = rowIdxs === null ? totalRows : rowIdxs.length;
		const colCount = outputColIdxs.length;
		const relativeData = new Array(colCount);
		for (let j = 0; j < colCount; j++) {
			const src = allData[outputColIdxs[j]];
			if (rowIdxs === null) {
				// Identity mapping — processRawColumn doesn't mutate src.
				relativeData[j] = processRawColumn(src);
			} else {
				const gathered = new Float64Array(groupRowCount);
				for (let r = 0; r < groupRowCount; r++) gathered[r] = src[rowIdxs[r]];
				relativeData[j] = processRawColumn(gathered);
			}
		}

		const baseName = group.name ? `${file.name} (${group.name})` : file.name;
		return {
			id: crypto.randomUUID(),
			name: baseName,
			columns: outputColumns,
			rowCount: groupRowCount,
			xAxisColumn: settings?.xAxisColumn,
			data: outputColumns.map((colName, colIdx) => {
				const config = configByName.get(colName);
				const isDate =
					config?.type === "date" ||
					(!config?.type &&
						(colIdx === 0 ||
							colName.toLowerCase().includes("time") ||
							colName.toLowerCase().includes("date")));
				let categoryLabels: string[] | undefined;
				if (config?.type === "categorical") {
					const srcIdx = outputColIdxs[colIdx];
					const map = categoricalMaps[srcIdx];
					const labels = new Array(map.size);
					map.forEach((id, key) => {
						labels[id] = key;
					});
					categoryLabels = labels;
				}
				return {
					isFloat64: isDate,
					refPoint: relativeData[colIdx].refPoint,
					bounds: relativeData[colIdx].bounds,
					data: relativeData[colIdx].data,
					categoryLabels,
				} as DataColumn;
			}),
		};
	});

	return datasets;
}

export function splitCSVLine(line: string, delimiter: string): string[] {
	if (delimiter.length === 1) {
		const delimChar = delimiter.charCodeAt(0);
		const vals: string[] = [];
		let start = 0;
		const lineLen = line.length;
		let inQuote = false;

		for (let i = 0; i < lineLen; i++) {
			const c = line.charCodeAt(i);
			if (c === 34) {
				inQuote = !inQuote;
			} else if (c === delimChar && !inQuote) {
				vals.push(line.substring(start, i));
				start = i + 1;
			}
		}
		vals.push(line.substring(start));
		return vals;
	}

	return line.split(delimiter);
}

function processCSVHeader(
	line: string,
	delimiter: string,
	columnConfigs: ColumnConfigEntry[],
	capacity: number,
) {
	const headers = splitCSVLine(line, delimiter).map((h) =>
		h.trim().replace(/^"|"$/g, ""),
	);

	const configMap = new Map<number, ColumnConfigEntry>();
	for (let i = 0; i < columnConfigs.length; i++) {
		configMap.set(columnConfigs[i].index, columnConfigs[i]);
	}

	const configsByIndex = new Array(headers.length);
	for (let j = 0; j < headers.length; j++) {
		configsByIndex[j] = configMap.get(j);
	}

	const activeCols: number[] = [];
	const finalHeaders: string[] = [];

	for (let j = 0; j < headers.length; j++) {
		if (configsByIndex[j]?.type !== "ignore") {
			activeCols.push(j);
			finalHeaders.push(configsByIndex[j]?.name || headers[j]);
		}
	}

	const numActive = activeCols.length;
	const data = new Array(numActive);
	for (let k = 0; k < numActive; k++) {
		data[k] = new Float64Array(capacity);
	}

	const categoricalMaps = new Array(numActive)
		.fill(null)
		.map(() => new Map<string, number>());

	return {
		configsByIndex,
		activeCols,
		finalHeaders,
		numActive,
		data,
		categoricalMaps,
	};
}

function findNextDelimiterIndex(
	line: string,
	start: number,
	lineLen: number,
	delimChar: number,
): number {
	let inQuote = false;
	let end = start;
	while (end < lineLen) {
		const c = line.charCodeAt(end);
		if (c === 34) {
			inQuote = !inQuote;
		} else if (c === delimChar && !inQuote) {
			break;
		}
		end++;
	}
	return end;
}

function extractCSVValue(line: string, start: number, end: number): string {
	let vStart = start;
	let vEnd = end - 1;

	// Inline trim() logic
	while (vStart <= vEnd && line.charCodeAt(vStart) <= 32) vStart++;
	while (vEnd >= vStart && line.charCodeAt(vEnd) <= 32) vEnd--;

	if (vStart <= vEnd) {
		// Handle surrounding quotes
		if (
			line.charCodeAt(vStart) === 34 &&
			line.charCodeAt(vEnd) === 34 &&
			vEnd > vStart
		) {
			vStart++;
			vEnd--;
		}
		return line.substring(vStart, vEnd + 1);
	}
	return "";
}

function processCSVRow(
	line: string,
	delimiter: string,
	numActive: number,
	activeCols: number[],
	configsByIndex: (ColumnConfigEntry | undefined)[],
	isComma: boolean,
	categoricalMaps: Map<string, number>[],
	actualRowCount: number,
	data: Float64Array[],
) {
	// Optimization: When the delimiter is a single character, avoiding String.split()
	// and manually iterating over the string provides a significant performance boost
	// because it prevents the allocation of intermediate arrays and strings for discarded columns.
	const delimLen = delimiter.length;

	if (delimLen === 1) {
		let start = 0;
		let currentCol = 0;
		const delimChar = delimiter.charCodeAt(0);
		const lineLen = line.length;

		for (let k = 0; k < numActive; k++) {
			const targetCol = activeCols[k];

			// Fast forward to target column
			while (currentCol < targetCol && start < lineLen) {
					start = findNextDelimiterIndex(line, start, lineLen, delimChar);
				if (start < lineLen) {
					start++;
					currentCol++;
				}
			}

			let val = "";
			if (start < lineLen) {
					const end = findNextDelimiterIndex(line, start, lineLen, delimChar);
					val = extractCSVValue(line, start, end);
				start = end + 1;
				currentCol++;
			} else if (start === lineLen) {
				// Handle empty value at the very end of line if we expect it
				if (currentCol < targetCol) {
					val = "";
				}
				// Move past so we don't process it again
				start++;
				currentCol++;
			}

			data[k][actualRowCount] = parseValue(
				val,
				configsByIndex[activeCols[k]],
				isComma,
				categoricalMaps[k],
			);
		}
	} else {
		// Fallback for multi-character delimiters
		const values = line.split(delimiter);
		for (let k = 0; k < numActive; k++) {
			const j = activeCols[k];
			let val = values[j];

			if (val !== undefined) {
				val = val.trim();
				if (
					val.length > 1 &&
					val.charCodeAt(0) === 34 &&
					val.charCodeAt(val.length - 1) === 34
				) {
					val = val.substring(1, val.length - 1);
				}
			} else {
				val = "";
			}

			data[k][actualRowCount] = parseValue(
				val,
				configsByIndex[j],
				isComma,
				categoricalMaps[k],
			);
		}
	}
}

async function parseCSV(file: File, settings?: ParseSettings) {
	const {
		delimiter = ",",
		decimalPoint = ".",
		startRow = 1,
		commentChar,
		columnConfigs = [],
	} = settings || {};

	const stream = file.stream();
	const reader = stream.getReader();
	const decoder = new TextDecoder("utf-8");

	let buffer = "";
	let lineCount = 0;
	let actualRowCount = 0;

	// We don't know the rowCount in advance when streaming, start with a reasonable capacity and double it when needed
	let capacity = 100000;

	let numActive = 0;
	let activeCols: number[] = [];
	let finalHeaders: string[] = [];
	let configsByIndex: (ColumnConfigEntry | undefined)[] = [];
	let data: Float64Array[] = [];
	let categoricalMaps: Map<string, number>[] = [];
	const isComma = decimalPoint === ",";

	let isFirstLine = true;

	while (true) {
		const { done, value } = await reader.read();

		if (value) {
			buffer += decoder.decode(value, { stream: true });
		} else {
			buffer += decoder.decode();
		}

		// Strip BOM if present at the very beginning
		if (isFirstLine && buffer.charCodeAt(0) === 0xfeff) {
			buffer = buffer.slice(1);
		}

		const lines = buffer.split(/\r?\n/);

		// Keep the last partial line in the buffer
		if (!done) {
			buffer = lines.pop() || "";
		} else {
			buffer = "";
		}

		for (let i = 0; i < lines.length; i++) {
			const line = lines[i].trim();

			// Skip lines that start with the comment character
			if (commentChar && line.startsWith(commentChar)) {
				continue;
			}

			if (!line) {
				if (!done || i < lines.length - 1) {
					// Only increment lineCount if it's an actual empty line in the middle of the file
					lineCount++;
				}
				continue;
			}

			if (isFirstLine && lineCount === startRow - 1) {
				const headerResult = processCSVHeader(
					line,
					delimiter,
					columnConfigs,
					capacity,
				);
				configsByIndex = headerResult.configsByIndex;
				activeCols = headerResult.activeCols;
				finalHeaders = headerResult.finalHeaders;
				numActive = headerResult.numActive;
				data = headerResult.data;
				categoricalMaps = headerResult.categoricalMaps;
				isFirstLine = false;
			}

			if (lineCount >= startRow && !isFirstLine) {
				// Ensure capacity
				if (actualRowCount >= capacity) {
					capacity *= 2;
					for (let k = 0; k < numActive; k++) {
						const newData = new Float64Array(capacity);
						newData.set(data[k]);
						data[k] = newData;
					}
				}

				processCSVRow(
					line,
					delimiter,
					numActive,
					activeCols,
					configsByIndex,
					isComma,
					categoricalMaps,
					actualRowCount,
					data,
				);
				actualRowCount++;
			}
			lineCount++;
		}

		if (done) {
			break;
		}
	}

	if (actualRowCount === 0 && lineCount === 0) {
		throw new Error("Empty CSV file");
	}

	for (let k = 0; k < numActive; k++) {
		if (data[k].length !== actualRowCount) {
			data[k] = data[k].subarray(0, actualRowCount);
		}
	}

	return {
		columns: finalHeaders,
		rowCount: actualRowCount,
		data: data,
		categoricalMaps,
	};
}

async function parseJSON(file: File, settings?: ParseSettings) {
	const { decimalPoint = ".", columnConfigs = [] } = settings || {};

	const text = await file.text();
	let raw: unknown;
	try {
		// 🔒 Security Note: Using secureJSONParse instead of native JSON.parse to prevent Prototype Pollution vulnerabilities.
		raw = secureJSONParse(text);
	} catch (error) {
		console.error("Failed to parse JSON data:", error);
		throw new Error(
			"Invalid JSON format: " +
				(error instanceof Error ? error.message : String(error)),
			{ cause: error },
		);
	}

	if (!Array.isArray(raw) || raw.length === 0)
		throw new Error(
			"Invalid JSON format: Expected a non-empty array of objects",
		);

	const allHeaders = Object.keys(raw[0]);
	const rowCount = raw.length;

	// ⚡ Bolt Optimization: Pre-calculate column configurations
	const configMap = new Map<number, ColumnConfigEntry>();
	for (let i = 0; i < columnConfigs.length; i++) {
		configMap.set(columnConfigs[i].index, columnConfigs[i]);
	}

	const configsByIndex = new Array(allHeaders.length);
	for (let j = 0; j < allHeaders.length; j++) {
		configsByIndex[j] = configMap.get(j);
	}

	// ⚡ Bolt Optimization: Determine active columns upfront
	const activeCols: number[] = [];
	const finalHeaders: string[] = [];
	for (let j = 0; j < allHeaders.length; j++) {
		if (configsByIndex[j]?.type !== "ignore") {
			activeCols.push(j);
			finalHeaders.push(configsByIndex[j]?.name || allHeaders[j]);
		}
	}
	const numActive = activeCols.length;

	// ⚡ Bolt Optimization: Column-major storage
	const data: Float64Array[] = new Array(numActive);
	for (let k = 0; k < numActive; k++) {
		data[k] = new Float64Array(rowCount);
	}

	const categoricalMaps = new Array(numActive)
		.fill(null)
		.map(() => new Map<string, number>());
	const isComma = decimalPoint === ",";

	for (let i = 0; i < rowCount; i++) {
		const row = raw[i];

		for (let k = 0; k < numActive; k++) {
			const j = activeCols[k];
			const header = allHeaders[j];
			const config = configsByIndex[j];

			const val = row[header];
			const valStr = val === undefined || val === null ? "" : String(val);
			data[k][i] = parseValue(valStr, config, isComma, categoricalMaps[k]);
		}
	}

	return {
		columns: finalHeaders,
		rowCount: rowCount,
		data: data,
		categoricalMaps,
	};
}

function parseValue(
	val: string,
	config: ParseConfig | null | undefined,
	isComma: boolean,
	categoricalMap: Map<string, number>,
): number {
	if (val === undefined || val === null || val === "") return NaN;

	if (config?.type === "date") {
		return parseDate(val, config.dateFormat);
	}

	if (config?.type === "categorical") {
		if (!categoricalMap.has(val)) {
			categoricalMap.set(val, categoricalMap.size);
		}
		return categoricalMap.get(val) ?? 0;
	}
	// Default: numeric
	// ⚡ Bolt Optimization: Fast path for parseValue
	const p = parseFloat(isComma ? val.replace(",", ".") : val);
	return Number.isNaN(p) ? NaN : p;
}

interface DateFormatIndices {
	yIdx: number;
	moIdx: number;
	dIdx: number;
	hIdx: number;
	miIdx: number;
	sIdx: number;
}

const dateFormatCache = new Map<string, DateFormatIndices>();

function getDateFormatIndices(format: string): DateFormatIndices {
	let cached = dateFormatCache.get(format);
	if (cached) return cached;
	cached = {
		yIdx: format.indexOf("YYYY"),
		moIdx: format.indexOf("MM"),
		dIdx: format.indexOf("DD"),
		hIdx: format.indexOf("HH"),
		miIdx: format.indexOf("mm"),
		sIdx: format.indexOf("ss"),
	};
	dateFormatCache.set(format, cached);
	return cached;
}

function parseDate(val: string, format?: string): number {
	if (!format) {
		const d = new Date(val);
		return d.getTime() / 1000;
	}

	const idx = getDateFormatIndices(format);
	let year = 1970;
	let month = 0;
	let day = 1;
	let hour = 0;
	let min = 0;
	let sec = 0;

	if (idx.yIdx !== -1)
		year = parseInt(val.substring(idx.yIdx, idx.yIdx + 4), 10);
	if (idx.moIdx !== -1)
		month = parseInt(val.substring(idx.moIdx, idx.moIdx + 2), 10) - 1;
	if (idx.dIdx !== -1)
		day = parseInt(val.substring(idx.dIdx, idx.dIdx + 2), 10);
	if (idx.hIdx !== -1)
		hour = parseInt(val.substring(idx.hIdx, idx.hIdx + 2), 10);
	if (idx.miIdx !== -1)
		min = parseInt(val.substring(idx.miIdx, idx.miIdx + 2), 10);
	if (idx.sIdx !== -1)
		sec = parseInt(val.substring(idx.sIdx, idx.sIdx + 2), 10);

	// Match the previous local-time semantics (new Date(y, m, d, h, mi, s)) while
	// skipping the per-row Date allocation. Falls back to Date parsing if the
	// computed fields are out of range (e.g. malformed value).
	if (
		Number.isFinite(year) &&
		Number.isFinite(month) &&
		Number.isFinite(day) &&
		Number.isFinite(hour) &&
		Number.isFinite(min) &&
		Number.isFinite(sec)
	) {
		dateScratch.setFullYear(year, month, day);
		dateScratch.setHours(hour, min, sec, 0);
		return dateScratch.getTime() / 1000;
	}

	const d = new Date(val);
	return d.getTime() / 1000;
}

const dateScratch = new Date();
