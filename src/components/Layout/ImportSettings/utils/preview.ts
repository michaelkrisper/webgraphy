import type { ColumnConfig } from "../../../../types/import";
import { splitCSVLine } from "../../../../utils/data-parser";
import { secureJSONParse } from "../../../../utils/json";
import { detectColumnTypeAndFormat } from "./detectors";

export interface PreviewData {
	headers: string[];
	rows: Record<string, string>[] | string[][];
	skippedLines: string[];
	gapStart: number | null;
	totalRows: number;
}

export function generatePreviewData(
	fileContent: string,
	fileType: "csv" | "json" | "excel",
	delimiter: string,
	startRow: number,
	commentChar: string,
): PreviewData {
	const HEAD = 25;
	const TAIL = 25;
	const trim = <T,>(
		arr: T[],
	): { rows: T[]; gapStart: number | null; totalRows: number } => {
		if (arr.length <= HEAD + TAIL) {
			return { rows: arr, gapStart: null, totalRows: arr.length };
		}
		return {
			rows: [...arr.slice(0, HEAD), ...arr.slice(-TAIL)],
			gapStart: HEAD,
			totalRows: arr.length,
		};
	};

	if (fileType === "json") {
		try {
			const parsed = secureJSONParse(fileContent) as unknown;
			const allRows = (Array.isArray(parsed) ? parsed : [parsed]) as Record<
				string,
				string
			>[];
			const headers = Object.keys(
				(allRows[0] as Record<string, unknown>) || {},
			);
			const { rows, gapStart, totalRows } = trim(allRows);
			return {
				headers,
				rows,
				skippedLines: [],
				gapStart,
				totalRows,
			};
		} catch {
			return {
				headers: [],
				rows: [],
				skippedLines: [],
				gapStart: null,
				totalRows: 0,
			};
		}
	}

	const allLines = fileContent.split(/\r?\n/).filter((l) => l.trim());
	const lines = allLines.filter((l) => {
		const trimmed = l.trim();
		return commentChar ? !trimmed.startsWith(commentChar) : true;
	});

	if (lines.length === 0) {
		return {
			headers: [],
			rows: [],
			skippedLines: [],
			gapStart: null,
			totalRows: 0,
		};
	}

	const headerRowIndex = Math.max(0, startRow - 1);
	const skippedLines = lines.slice(0, headerRowIndex);
	const headerLine = lines[headerRowIndex] || "";
	const headers = splitCSVLine(headerLine, delimiter).map((h) =>
		h.trim().replace(/^"|"$/g, ""),
	);
	const allDataLines = lines.slice(headerRowIndex + 1);
	const { rows: keptLines, gapStart, totalRows } = trim(allDataLines);
	const rows = keptLines.map((line) =>
		splitCSVLine(line, delimiter).map((v) => v.trim().replace(/^"|"$/g, "")),
	);

	return { headers, rows, skippedLines, gapStart, totalRows };
}

export function generateColumnConfigs(
	previewData: PreviewData,
	columnOverrides: Record<number, Partial<ColumnConfig>>,
	decimalPoint: string,
	fileType: "csv" | "json" | "excel",
): ColumnConfig[] {
	return previewData.headers.map((name, index) => {
		const override = columnOverrides[index];

		const firstVal =
			fileType === "json"
				? (previewData.rows as Record<string, string>[]).find(
						(row) => row[name],
					)?.[name]
				: (previewData.rows as string[][])[0]?.[index];

		const { type: autoType, dateFormat: autoFormat } =
			detectColumnTypeAndFormat(firstVal, decimalPoint);

		if (override) {
			return {
				index,
				name,
				type: override.type || autoType,
				dateFormat: override.dateFormat || autoFormat,
				...override,
			};
		}

		return { index, name, type: autoType, dateFormat: autoFormat };
	});
}

export function getPreferredXAxisColumn(
	columnConfigs: ColumnConfig[],
	xAxisColumnOverride: string | null,
): string {
	const nonIgnored = columnConfigs.filter((c) => c.type !== "ignore");
	if (
		xAxisColumnOverride &&
		nonIgnored.some((c) => c.name === xAxisColumnOverride)
	) {
		return xAxisColumnOverride;
	}
	return (
		nonIgnored.find((c) => c.type === "date")?.name || nonIgnored[0]?.name || ""
	);
}
