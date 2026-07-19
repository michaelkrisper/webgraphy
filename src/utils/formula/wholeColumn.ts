import { processRawColumn } from "../data-processing";
import {
	exponentialRegression,
	kdeSmoothing,
	linearRegression,
	logisticRegression,
	polynomialRegression,
} from "../regression";
import type { FormulaWorkerParams, FormulaEvaluationResult, Granularity } from "./types";
import { compileFormula } from "./compile";
import { toMillis } from "./date";

// ── Whole-column passes (regression + group-aggregate) ─────────────────────

export const REGRESSION_PATTERNS: { pattern: RegExp; type: string }[] = [
	{ pattern: /^linreg\(\[([^\]]+)\]\)$/i, type: "linear" },
	{ pattern: /^polyreg\(\[([^\]]+)\]\s*,\s*(\d+)\)$/i, type: "poly" },
	{ pattern: /^polyreg\(\[([^\]]+)\]\)$/i, type: "poly_default" },
	{ pattern: /^expreg\(\[([^\]]+)\]\)$/i, type: "exponential" },
	{ pattern: /^logreg\(\[([^\]]+)\]\)$/i, type: "logistic" },
	{ pattern: /^kde\(\[([^\]]+)\]\)$/i, type: "kde" },
	{ pattern: /^kde\(\[([^\]]+)\]\s*,\s*([0-9.]+)\)$/i, type: "kde_bw" },
];

export function tryRegressionFormula(
	formula: string,
	columns: string[],
	rowCount: number,
	columnData: { data: Float32Array; refPoint: number }[],
): Float64Array | null {
	const trimmed = formula.trim();

	for (const { pattern, type } of REGRESSION_PATTERNS) {
		const match = trimmed.match(pattern);
		if (!match) continue;

		const colName = match[1];
		// Callers (useGraphStore.addCalculatedColumn) pass columnData as [x, y]
		// in fixed order. We only need to validate the column name exists in
		// the dataset; the positional contract supplies the data.
		const colExists = columns.some(
			(c) => c === colName || c.endsWith(`: ${colName}`),
		);
		if (!colExists) return null;

		const xArr = new Float64Array(rowCount);
		const yArr = new Float64Array(rowCount);
		const xRef = columnData[0]?.refPoint || 0;
		const yRef = columnData[1]?.refPoint || 0;
		const xData = columnData[0]?.data;
		const yData = columnData[1]?.data;
		if (!xData || !yData) return null;

		for (let i = 0; i < rowCount; i++) {
			xArr[i] = xData[i] + xRef;
			yArr[i] = yData[i] + yRef;
		}

		switch (type) {
			case "linear":
				return linearRegression(xArr, yArr);
			case "poly":
				return polynomialRegression(xArr, yArr, parseInt(match[2], 10));
			case "poly_default":
				return polynomialRegression(xArr, yArr, 3);
			case "exponential":
				return exponentialRegression(xArr, yArr);
			case "logistic":
				return logisticRegression(xArr, yArr);
			case "kde":
				return kdeSmoothing(xArr, yArr);
			case "kde_bw":
				return kdeSmoothing(xArr, yArr, parseFloat(match[2]));
		}
	}
	return null;
}


export function evaluateGroupAverage(
	groupAvgMatch: RegExpMatchArray,
	formula: string,
	columns: string[],
	rowCount: number,
	columnData: { data: Float32Array; refPoint: number }[],
	datasetId?: string,
	name?: string,
): FormulaEvaluationResult {
	const granularity = groupAvgMatch[1].toLowerCase() as Granularity;
	const align = (groupAvgMatch[2]?.toLowerCase() ?? "c") as "l" | "c" | "r";
	const colName = groupAvgMatch[3];

	const compiled = compileFormula(formula, columns);
	if (compiled.error) {
		return { type: "error", error: compiled.error };
	}

	const timeColIdx = columns.findIndex(
		(c) => c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
	);
	// Mirror compileFormula's ensureTimeColumn fallback: column 0 stands in
	// when no explicit time/date column exists.
	const timeGlobalIdx = timeColIdx === -1 ? 0 : timeColIdx;
	const valueGlobalIdx = (() => {
		let idx = columns.indexOf(colName);
		if (idx === -1)
			idx = columns.findIndex(
				(c) => c.endsWith(`: ${colName}`) || c === colName,
			);
		return idx;
	})();
	if (valueGlobalIdx === -1) {
		return { type: "error", error: `Column not found: ${colName}` };
	}

	const localTimeIdx = compiled.usedColumnIndices.indexOf(timeGlobalIdx);
	const localValueIdx = compiled.usedColumnIndices.indexOf(valueGlobalIdx);
	if (localTimeIdx === -1 || localValueIdx === -1) {
		return { type: "error", error: "Could not resolve column indices" };
	}

	const timeCol = columnData[localTimeIdx];
	const valCol = columnData[localValueIdx];

	// Cached key reuse — incrementing through rows usually hits the same bucket.
	const cacheDate = new Date();
	let lastMs = NaN;
	let lastKey = 0;
	const getKey = (t: number): number => {
		const ms = toMillis(t);
		if (ms === lastMs) return lastKey;
		lastMs = ms;
		cacheDate.setTime(ms);
		if (granularity === "second") cacheDate.setMilliseconds(0);
		else if (granularity === "minute") cacheDate.setSeconds(0, 0);
		else if (granularity === "hour") cacheDate.setMinutes(0, 0, 0);
		else if (granularity === "day") cacheDate.setHours(0, 0, 0, 0);
		lastKey = cacheDate.getTime();
		return lastKey;
	};

	const groupSums = new Map<number, number>();
	const groupCounts = new Map<number, number>();
	const groupFirst = new Map<number, number>();
	const groupLast = new Map<number, number>();
	for (let i = 0; i < rowCount; i++) {
		const t = timeCol.data[i] + timeCol.refPoint;
		const v = valCol.data[i] + valCol.refPoint;
		const key = getKey(t);
		groupSums.set(key, (groupSums.get(key) ?? 0) + v);
		groupCounts.set(key, (groupCounts.get(key) ?? 0) + 1);
		if (!groupFirst.has(key)) groupFirst.set(key, i);
		groupLast.set(key, i);
	}

	const repXVals: number[] = [];
	const repYVals: number[] = [];
	groupFirst.forEach((firstIdx, key) => {
		const lastIdx = groupLast.get(key)!;
		let repIdx: number;
		if (align === "l") repIdx = firstIdx;
		else if (align === "r") repIdx = lastIdx;
		else repIdx = Math.round((firstIdx + lastIdx) / 2);
		repXVals.push(timeCol.data[repIdx] + timeCol.refPoint);
		repYVals.push(groupSums.get(key)! / groupCounts.get(key)!);
	});

	const compactX = new Float64Array(repXVals);
	const compactY = new Float64Array(repYVals);
	const orderLen = compactX.length;
	const order = new Uint32Array(orderLen);
	for (let i = 0; i < orderLen; i++) order[i] = i;
	order.sort((a, b) => compactX[a] - compactX[b]);
	const sortedX = new Float64Array(orderLen);
	const sortedY = new Float64Array(orderLen);
	for (let i = 0; i < orderLen; i++) {
		sortedX[i] = compactX[order[i]];
		sortedY[i] = compactY[order[i]];
	}

	const processedX = processRawColumn(sortedX);
	const processedY = processRawColumn(sortedY);
	return {
		type: "success",
		newColumn: {
			isFloat64: false,
			refPoint: processedY.refPoint,
			bounds: processedY.bounds,
			data: processedY.data,
		},
		sparseXColumn: {
			isFloat64: false,
			refPoint: processedX.refPoint,
			bounds: processedX.bounds,
			data: processedX.data,
		},
		datasetId,
		name,
	};
}

/**
 * Matches the top-level rolling call that should drive alignment.
 * Handles legacy avgN/avgNs… and new rolling/rollingC/rollingR/rollingTime[CR].
 *
 * Capture groups: 1=N (rows or seconds, may be absent for new form), 2=unit
 *   (s|m|h|d, may be absent), 3=alignment (c|l|r, may be absent),
 *   4=N when the new-form 2nd arg is a literal.
 */
export const ROLLING_TOP_LEVEL =
	/^(?:avg(\d+)(s|m|h|d)?([lcr])?|rolling(time)?([cr])?)\s*\(/i;

export function applyRollingAverageAlignment(
	formula: string,
	resultData: Float64Array,
	rowCount: number,
	columnData: { data: Float32Array; refPoint: number }[],
) {
	const trimmed = formula.trim();
	const m = trimmed.match(ROLLING_TOP_LEVEL);
	if (!m) return;

	let num: number;
	let unit: string | undefined;
	let align: "l" | "c" | "r";

	if (m[1]) {
		// legacy avgN[s|m|h|d][c|l|r]
		num = parseInt(m[1], 10);
		unit = m[2]?.toLowerCase();
		align = (m[3]?.toLowerCase() as "l" | "c" | "r") ?? "c";
	} else {
		// new rolling(...)/rollingTime(...) — need to find the N literal inside
		const isTime = !!m[4];
		const alignChar = m[5]?.toLowerCase();
		align = (alignChar as "l" | "c" | "r") ?? "l";
		unit = isTime ? "s" : undefined;
		// Extract the second top-level argument as the constant N.
		const open = trimmed.indexOf("(");
		let depth = 0;
		let argStart = open + 1;
		let secondArg = "";
		for (let i = open; i < trimmed.length; i++) {
			const c = trimmed[i];
			if (c === "(") depth++;
			else if (c === ")") {
				depth--;
				if (depth === 0) {
					secondArg = trimmed.substring(argStart, i).trim();
					break;
				}
			} else if (c === "," && depth === 1) {
				argStart = i + 1;
			}
		}
		const n = parseFloat(secondArg);
		if (!Number.isFinite(n)) return;
		num = n;
	}

	let shift = 0;
	if (unit) {
		if (align !== "l") {
			let windowSec = num;
			if (unit === "m") windowSec = num * 60;
			else if (unit === "h") windowSec = num * 3600;
			else if (unit === "d") windowSec = num * 86400;

			const timeColData = columnData[0];
			if (timeColData && rowCount > 1) {
				const sampleSize = Math.min(rowCount - 1, 200);
				const step = Math.max(1, Math.floor((rowCount - 1) / sampleSize));
				let totalInterval = 0;
				let count = 0;
				for (let i = 0; i < rowCount - 1; i += step) {
					const t0 = timeColData.data[i] + timeColData.refPoint;
					const t1 = timeColData.data[i + 1] + timeColData.refPoint;
					const dtMs = Math.abs(toMillis(t1) - toMillis(t0));
					if (dtMs > 0) {
						totalInterval += dtMs;
						count++;
					}
				}
				if (count > 0) {
					const medianIntervalSec = totalInterval / count / 1000;
					const halfRows = Math.round(windowSec / 2 / medianIntervalSec);
					shift = align === "c" ? halfRows : windowSec / medianIntervalSec - 1;
					if (align === "r")
						shift = Math.round(windowSec / medianIntervalSec) - 1;
				}
			}
		}
	} else {
		if (align === "c") shift = Math.floor(num / 2);
		else if (align === "r") shift = num - 1;
	}

	if (shift > 0 && shift < rowCount) {
		const out = new Float64Array(rowCount);
		for (let i = 0; i < rowCount - shift; i++) out[i] = resultData[i + shift];
		for (let i = rowCount - shift; i < rowCount; i++)
			out[i] = resultData[rowCount - 1];
		resultData.set(out);
	}
}

export function evaluateFormulaSync(
	params: FormulaWorkerParams,
): FormulaEvaluationResult {
	const { datasetId, name, formula, columns, rowCount, columnData } = params;

	try {
		const regressionResult = tryRegressionFormula(
			formula,
			columns,
			rowCount,
			columnData,
		);
		if (regressionResult) {
			const processed = processRawColumn(regressionResult);
			return {
				type: "success",
				newColumn: {
					isFloat64: false,
					refPoint: processed.refPoint,
					bounds: processed.bounds,
					data: processed.data,
				},
				datasetId,
				name,
			};
		}

		const groupAvgMatch = formula
			.trim()
			.match(/^avg(day|hour|minute|second)([lcr])?\(\[(.+)\]\)$/i);
		if (groupAvgMatch) {
			return evaluateGroupAverage(
				groupAvgMatch,
				formula,
				columns,
				rowCount,
				columnData,
				datasetId,
				name,
			);
		}

		const { evaluate, usedColumnIndices, error, createContext } =
			compileFormula(formula, columns);
		if (error) return { type: "error", error };

		const resultData = new Float64Array(rowCount);
		const rowValues = new Array(usedColumnIndices.length);
		const ctx = createContext ? createContext() : undefined;

		for (let i = 0; i < rowCount; i++) {
			for (let j = 0; j < usedColumnIndices.length; j++) {
				rowValues[j] = columnData[j].data[i] + columnData[j].refPoint;
			}
			resultData[i] = evaluate(rowValues, ctx);
		}

		applyRollingAverageAlignment(formula, resultData, rowCount, columnData);

		const processed = processRawColumn(resultData);

		return {
			type: "success",
			newColumn: {
				isFloat64: false,
				refPoint: processed.refPoint,
				bounds: processed.bounds,
				data: processed.data,
			},
			datasetId,
			name,
		};
	} catch (err) {
		return {
			type: "error",
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
