import type { ColumnType } from "../../../../types/import";

export function calculateDelimiterScore(lines: string[], delimiter: string): number {
	let totalCount = 0;
	const counts = new Map<number, number>();
	let maxConsistency = 0;

	for (const line of lines) {
		const count = line.split(delimiter).length - 1;
		totalCount += count;
		if (count > 0) {
			const c = (counts.get(count) || 0) + 1;
			counts.set(count, c);
			maxConsistency = Math.max(maxConsistency, c);
		}
	}

	// Score: number of lines with the most consistent non-zero count,
	// plus a small bonus for total count to break ties.
	return maxConsistency * 1000 + totalCount;
}

export function detectDelimiter(
	fileContent: string,
	fileType: "csv" | "json" | "excel",
): string {
	if (fileType !== "csv" && fileType !== "excel") return ",";
	if (!fileContent) return ",";

	const lines = fileContent
		.split(/\r?\n/)
		.slice(0, 100)
		.filter((l) => l.trim());
	if (lines.length === 0) return ",";

	const candidates = [",", ";", "\t", "|"];
	let best = ",";
	let maxScore = -1;

	for (const d of candidates) {
		const score = calculateDelimiterScore(lines, d);
		if (score > maxScore) {
			maxScore = score;
			best = d;
		}
	}
	return best;
}

export function detectDecimalPoint(fileContent: string, delimiter: string): string {
	if (!fileContent) return ".";
	const lines = fileContent
		.split(/\r?\n/)
		.slice(0, 100)
		.filter((l) => l.trim());
	let dotCount = 0;
	let commaCount = 0;

	const dotRegex = /\d\.\d/g;
	const commaRegex = /\d,\d/g;

	for (const line of lines) {
		const fields = line.split(delimiter);
		for (const field of fields) {
			dotCount += (field.match(dotRegex) || []).length;
			commaCount += (field.match(commaRegex) || []).length;
		}
	}

	return commaCount > dotCount ? "," : ".";
}

export function detectColumnTypeAndFormat(
	firstVal: string | undefined,
	decimalPoint: string,
): { type: ColumnType; dateFormat?: string } {
	if (!firstVal || firstVal.trim() === "") {
		return { type: "ignore" };
	}

	let type: ColumnType = "numeric";
	let dateFormat: string | undefined;

	const normalized = firstVal.replace(decimalPoint, ".");
	if (Number.isNaN(Number(normalized)) || normalized.split(".").length > 2) {
		if (
			firstVal.includes("-") ||
			firstVal.includes(".") ||
			firstVal.includes("/")
		) {
			type = "date";
			if (firstVal.match(/^\d{4}-\d{2}-\d{2}$/)) dateFormat = "YYYY-MM-DD";
			else if (firstVal.match(/^\d{2}\.\d{2}\.\d{4}$/))
				dateFormat = "DD.MM.YYYY";
			else if (firstVal.match(/^\d{2}\/\d{2}\/\d{4}$/))
				dateFormat = "DD/MM/YYYY";
		} else {
			type = "categorical";
		}
	}
	return { type, dateFormat };
}
