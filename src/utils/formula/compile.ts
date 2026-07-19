import type { FormulaResult, FormulaContext } from "./types";
import { FormulaError } from "./types";
import { mathModulo, isTruthy } from "./math";
import { evaluateFuncToken } from "./evaluate";
import { resolveBracketedReferences, tokenizeFormula, shuntingYard } from "./parser";

export function compileFormula(
	formula: string,
	availableColumns: string[],
): FormulaResult {
	try {
		const usedColumnIndices: number[] = [];
		const columnMap = new Map<string, number>();
		let funcIdCounter = 1;
		let usesAllColumns = false;

		let availableColumnsMap: Map<string, number> | undefined;

		const ensureAvailableColumnsMap = () => {
			if (!availableColumnsMap) {
				availableColumnsMap = new Map<string, number>();
				for (let i = 0; i < availableColumns.length; i++) {
					const col = availableColumns[i];
					if (!availableColumnsMap.has(col)) {
						availableColumnsMap.set(col, i);
					}
				}
			}
			return availableColumnsMap;
		};

		// 1. Resolve bracketed column references (longest-match).
		const err = resolveBracketedReferences(
			formula,
			ensureAvailableColumnsMap(),
			columnMap,
			usedColumnIndices,
		);
		if (err) return err;

		let timeVarIdx = -1;
		const ensureTimeColumn = () => {
			if (timeVarIdx !== -1) return timeVarIdx;
			let colIndex = availableColumns.findIndex(
				(c) =>
					c.toLowerCase().includes("time") || c.toLowerCase().includes("date"),
			);
			if (colIndex === -1) colIndex = 0;
			timeVarIdx = usedColumnIndices.indexOf(colIndex);
			if (timeVarIdx === -1) {
				timeVarIdx = usedColumnIndices.length;
				usedColumnIndices.push(colIndex);
			}
			return timeVarIdx;
		};

		const dataColumnIndices: number[] = [];
		const ensureAllDataColumns = () => {
			dataColumnIndices.length = 0;
			const existingIndices = new Int32Array(availableColumns.length).fill(-1);
			for (let idx = 0; idx < usedColumnIndices.length; idx++) {
				existingIndices[usedColumnIndices[idx]] = idx;
			}
			for (let i = 0; i < availableColumns.length; i++) {
				const lower = availableColumns[i].toLowerCase();
				if (lower.includes("time") || lower.includes("date")) continue;

				let varIdx = existingIndices[i];
				if (varIdx === -1) {
					varIdx = usedColumnIndices.length;
					existingIndices[i] = varIdx;
					usedColumnIndices.push(i);
				}
				dataColumnIndices.push(varIdx);
			}
			return dataColumnIndices;
		};

		// 2 & 3. Tokenize and convert to RPN via shunting-yard.
		const tokens = tokenizeFormula(
			formula,
			columnMap,
			ensureTimeColumn,
			() => funcIdCounter++,
		);

		const { outputQueue, setUsesAllColumns } = shuntingYard(tokens);
		if (setUsesAllColumns) usesAllColumns = true;

		const finalDataColumnIndices = usesAllColumns
			? [...ensureAllDataColumns()]
			: [];

		// 4. Build evaluator.
		const createContext = (): FormulaContext => ({
			queues: {},
			sums: {},
			sumsSq: {},
			timeQueues: {},
			timeSums: {},
			groupSums: {},
			groupCounts: {},
			groupLastKey: {},
			lagBuffers: {},
			prevVals: {},
			hasPrev: {},
			cumState: {},
			cumHas: {},
			filterState: {},
		});

		// Each token pushes at most one value, so the RPN stack can never grow
		// deeper than the queue length — size it accordingly to avoid silent
		// out-of-range writes on deeply nested expressions.
		const stack = new Float64Array(outputQueue.length + 1);
		const argsScratch: number[] = [];

		return {
			usedColumnIndices,
			createContext,
			evaluate: (rowValues: number[], ctx?: FormulaContext) => {
				let sp = 0;
				for (let i = 0; i < outputQueue.length; i++) {
					const token = outputQueue[i];
					const type = token.type;
					if (type === "NUMBER" || type === "CONST") {
						stack[sp++] = token.value;
					} else if (type === "VAR") {
						stack[sp++] = rowValues[token.index];
					} else if (type === "FUNC") {
						const argCount = token.args ?? 1;
						argsScratch.length = argCount;
						for (let j = argCount - 1; j >= 0; j--)
							argsScratch[j] = stack[--sp];
						stack[sp++] = evaluateFuncToken(
							token,
							argsScratch,
							rowValues,
							finalDataColumnIndices,
							timeVarIdx,
							ctx,
						);
					} else if (type === "OP") {
						const op = token.value;
						if (token.unary) {
							const a = stack[--sp];
							if (op === "u-") stack[sp++] = -a;
							else if (op === "!") stack[sp++] = isTruthy(a) ? 0 : 1;
							else stack[sp++] = a;
						} else {
							const b = stack[--sp];
							const a = stack[--sp];
							let r: number;
							switch (op) {
								case "+":
									r = a + b;
									break;
								case "-":
									r = a - b;
									break;
								case "*":
									r = a * b;
									break;
								case "/":
									r = a / b;
									break;
								case "%":
									r = mathModulo(a, b);
									break;
								case "^":
									r = a ** b;
									break;
								case "==":
									r = a === b ? 1 : 0;
									break;
								case "!=":
									r = a !== b ? 1 : 0;
									break;
								case "<":
									r = a < b ? 1 : 0;
									break;
								case ">":
									r = a > b ? 1 : 0;
									break;
								case "<=":
									r = a <= b ? 1 : 0;
									break;
								case ">=":
									r = a >= b ? 1 : 0;
									break;
								case "&&":
									r = isTruthy(a) ? b : a;
									break;
								case "||":
									r = isTruthy(a) ? a : b;
									break;
								default:
									r = a;
							}
							stack[sp++] = r;
						}
					}
				}
				return stack[0];
			},
		};
	} catch (err) {
		if (err instanceof FormulaError) {
			return {
				evaluate: () => NaN,
				usedColumnIndices: [],
				error: err.message,
				errorPos: err.pos,
				createContext: () => ({}) as FormulaContext,
			};
		}
		return {
			evaluate: () => NaN,
			usedColumnIndices: [],
			error: err instanceof Error ? err.message : String(err),
			createContext: () => ({}) as FormulaContext,
		};
	}
}
