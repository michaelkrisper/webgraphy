import type { Token, FormulaResult } from "./types";
import { FormulaError } from "./types";
import { KNOWN_FUNCTION_NAMES, resolveLegacyName, FUNCTION_BY_NAME } from "../formulaFunctions";

// ── Precedence ─────────────────────────────────────────────────────────────

export const OP_PRECEDENCE: Record<string, { prec: number; assoc: "L" | "R" }> = {
	"||": { prec: 1, assoc: "L" },
	"&&": { prec: 2, assoc: "L" },
	"==": { prec: 3, assoc: "L" },
	"!=": { prec: 3, assoc: "L" },
	"<": { prec: 4, assoc: "L" },
	">": { prec: 4, assoc: "L" },
	"<=": { prec: 4, assoc: "L" },
	">=": { prec: 4, assoc: "L" },
	"+": { prec: 5, assoc: "L" },
	"-": { prec: 5, assoc: "L" },
	"*": { prec: 6, assoc: "L" },
	"/": { prec: 6, assoc: "L" },
	"%": { prec: 6, assoc: "L" },
	"^": { prec: 7, assoc: "R" },
};

export const UNARY_PREC = 8;

export function resolveBracketedReferences(
	formula: string,
	map1: Map<string, number>,
	columnMap: Map<string, number>,
	usedColumnIndices: number[],
): FormulaResult | null {
	let maxKeyLen = 0;
	for (const key of map1.keys()) {
		if (key.length > maxKeyLen) maxKeyLen = key.length;
	}
	let scanPos = 0;
	while (scanPos < formula.length) {
		const start = formula.indexOf("[", scanPos);
		if (start === -1) break;
		let bestEnd = -1;
		let end = start;
		while ((end = formula.indexOf("]", end + 1)) !== -1) {
			if (end - start - 1 > maxKeyLen) break;
			const candidate = formula.substring(start + 1, end);
			if (map1.has(candidate)) bestEnd = end;
		}
		if (bestEnd !== -1) {
			const fullMatch = formula.substring(start, bestEnd + 1);
			if (!columnMap.has(fullMatch)) {
				const colName = formula.substring(start + 1, bestEnd);
				const colIndex = map1.get(colName)!;
				columnMap.set(fullMatch, usedColumnIndices.length);
				usedColumnIndices.push(colIndex);
			}
			scanPos = bestEnd + 1;
			continue;
		}

		end = formula.indexOf("]", start + 1);
		if (end === -1) {
			scanPos = start + 1;
			continue;
		}

		const colName = formula.substring(start + 1, end);
		const fullMatch = formula.substring(start, end + 1);
		if (!columnMap.has(fullMatch)) {
			return {
				evaluate: () => NaN,
				usedColumnIndices: [],
				error: `Column not found: ${colName}`,
				errorPos: start,
			};
		}
		scanPos = end + 1;
	}
	return null;
}

export function tokenizeFormula(
	formula: string,
	columnMap: Map<string, number>,
	ensureTimeColumn: () => void,
	nextFuncId: () => number,
): Token[] {
	let maxKeyLen = 0;
	for (const key of columnMap.keys()) {
		if (key.length > maxKeyLen) maxKeyLen = key.length;
	}
	const tokens: Token[] = [];
	let i = 0;
	while (i < formula.length) {
		const char = formula[i];
		const prevToken = tokens.length > 0 ? tokens[tokens.length - 1] : null;
		const startPos = i;

		if (/\s/.test(char)) {
			i++;
			continue;
		}

		// Column reference [Foo]
		if (char === "[") {
			let bestEnd = -1;
			let end = i;
			while ((end = formula.indexOf("]", end + 1)) !== -1) {
				if (end - i + 1 > maxKeyLen) break;
				if (columnMap.has(formula.substring(i, end + 1))) bestEnd = end;
			}
			if (bestEnd === -1) {
				end = formula.indexOf("]", i + 1);
				if (end === -1) throw new FormulaError("Missing closing bracket ]", i);
				throw new FormulaError(
					`Unknown column: ${formula.substring(i + 1, end)}`,
					i,
				);
			}
			const fullMatch = formula.substring(i, bestEnd + 1);
			tokens.push({
				type: "VAR",
				index: columnMap.get(fullMatch)!,
				pos: startPos,
			});
			i = bestEnd + 1;
			continue;
		}

		// Numeric literal with optional scientific notation
		if (/[0-9.]/.test(char)) {
			const start = i;
			let sawDot = char === ".";
			i++;
			while (i < formula.length) {
				const c = formula[i];
				if (c >= "0" && c <= "9") {
					i++;
				} else if (c === "." && !sawDot) {
					sawDot = true;
					i++;
				} else {
					break;
				}
			}
			// Scientific notation — only if preceded by digits
			if (
				i < formula.length &&
				(formula[i] === "e" || formula[i] === "E") &&
				/[0-9.]/.test(formula[start])
			) {
				const eStart = i;
				let j = i + 1;
				if (j < formula.length && (formula[j] === "+" || formula[j] === "-")) {
					j++;
				}
				let digits = 0;
				while (j < formula.length && formula[j] >= "0" && formula[j] <= "9") {
					j++;
					digits++;
				}
				if (digits > 0) i = j;
				else i = eStart; // bare 'e' is a constant
			}
			const numStr = formula.substring(start, i);
			const value = parseFloat(numStr);
			if (Number.isNaN(value)) {
				throw new FormulaError(`Invalid number: ${numStr}`, start);
			}
			tokens.push({ type: "NUMBER", value, pos: startPos });
			continue;
		}

		// Identifier (function, constant, alias)
		if (/[a-zA-Z_]/.test(char)) {
			let name = "";
			while (i < formula.length && /[a-zA-Z0-9_]/.test(formula[i])) {
				name += formula[i++];
			}
			const lower = name.toLowerCase();

			if (lower === "pi") {
				tokens.push({ type: "CONST", value: Math.PI, pos: startPos });
				continue;
			}
			if (lower === "e") {
				tokens.push({ type: "CONST", value: Math.E, pos: startPos });
				continue;
			}

			// Legacy alias resolution (avg5, avgday, avg1hc, …)
			const alias = resolveLegacyName(lower);
			if (alias) {
				const canonical = alias.canonical;
				const meta = FUNCTION_BY_NAME.get(canonical);
				if (meta?.needsTime) ensureTimeColumn();
				tokens.push({
					type: "FUNC",
					value: canonical,
					id: nextFuncId(),
					constN: alias.constArg,
					pos: startPos,
				});
				continue;
			}

			if (KNOWN_FUNCTION_NAMES.has(lower)) {
				const meta = FUNCTION_BY_NAME.get(lower)!;
				if (meta.needsTime) ensureTimeColumn();
				tokens.push({
					type: "FUNC",
					value: lower,
					id: nextFuncId(),
					pos: startPos,
				});
				continue;
			}

			throw new FormulaError(`Unknown function or constant: ${name}`, startPos);
		}

		// Multi-char and single-char operators
		const two = formula.substring(i, i + 2);
		if (
			two === "==" ||
			two === "!=" ||
			two === "<=" ||
			two === ">=" ||
			two === "&&" ||
			two === "||"
		) {
			tokens.push({
				type: "OP",
				value: two,
				prec: OP_PRECEDENCE[two].prec,
				assoc: OP_PRECEDENCE[two].assoc,
				pos: startPos,
			});
			i += 2;
			continue;
		}

		if (char === "(") {
			tokens.push({ type: "LPAREN", pos: startPos });
			i++;
			continue;
		}
		if (char === ")") {
			tokens.push({ type: "RPAREN", pos: startPos });
			i++;
			continue;
		}
		if (char === ",") {
			tokens.push({ type: "COMMA", pos: startPos });
			i++;
			continue;
		}

		if (OP_PRECEDENCE[char]) {
			// Unary minus and unary not
			const isPrefixContext =
				!prevToken ||
				prevToken.type === "OP" ||
				prevToken.type === "LPAREN" ||
				prevToken.type === "FUNC" ||
				prevToken.type === "COMMA";
			if (char === "-" && isPrefixContext) {
				tokens.push({
					type: "OP",
					value: "u-",
					prec: UNARY_PREC,
					assoc: "R",
					unary: true,
					pos: startPos,
				});
			} else {
				const meta = OP_PRECEDENCE[char];
				tokens.push({
					type: "OP",
					value: char,
					prec: meta.prec,
					assoc: meta.assoc,
					pos: startPos,
				});
			}
			i++;
			continue;
		}

		if (char === "!") {
			tokens.push({
				type: "OP",
				value: "!",
				prec: UNARY_PREC,
				assoc: "R",
				unary: true,
				pos: startPos,
			});
			i++;
			continue;
		}

		throw new FormulaError(`Unexpected character: ${char}`, startPos);
	}
	return tokens;
}

export function shuntingYard(tokens: Token[]): {
	outputQueue: Token[];
	setUsesAllColumns: boolean;
} {
	const outputQueue: Token[] = [];
	const operatorStack: Token[] = [];
	const argCountStack: number[] = [];
	let usesAllColumns = false;

	for (let j = 0; j < tokens.length; j++) {
		const token = tokens[j];
		if (
			token.type === "NUMBER" ||
			token.type === "VAR" ||
			token.type === "CONST"
		) {
			outputQueue.push(token);
		} else if (token.type === "FUNC") {
			operatorStack.push(token);
			argCountStack.push(0);
		} else if (token.type === "COMMA") {
			while (
				operatorStack.length > 0 &&
				operatorStack[operatorStack.length - 1].type !== "LPAREN"
			) {
				outputQueue.push(operatorStack.pop()!);
			}
			if (argCountStack.length > 0) {
				argCountStack[argCountStack.length - 1]++;
			} else {
				throw new FormulaError("Unexpected comma", token.pos);
			}
		} else if (token.type === "OP") {
			while (operatorStack.length > 0) {
				const top = operatorStack[operatorStack.length - 1];
				if (
					top.type === "OP" &&
					((token.assoc === "L" && token.prec <= top.prec) ||
						(token.assoc === "R" && token.prec < top.prec))
				) {
					outputQueue.push(operatorStack.pop()!);
				} else {
					break;
				}
			}
			operatorStack.push(token);
		} else if (token.type === "LPAREN") {
			operatorStack.push(token);
		} else if (token.type === "RPAREN") {
			while (
				operatorStack.length > 0 &&
				operatorStack[operatorStack.length - 1].type !== "LPAREN"
			) {
				outputQueue.push(operatorStack.pop()!);
			}
			if (operatorStack.length === 0)
				throw new FormulaError("Mismatched parentheses", token.pos);
			operatorStack.pop();

			if (
				operatorStack.length > 0 &&
				operatorStack[operatorStack.length - 1].type === "FUNC"
			) {
				const func = operatorStack.pop()! as Extract<Token, { type: "FUNC" }>;
				let args = argCountStack.pop()!;
				const prevWasLparen = tokens[j - 1] && tokens[j - 1].type === "LPAREN";
				if (!prevWasLparen) args++;

				// If the function expects a constant N at constArgIndex and the
				// user wrote it inline (e.g. rolling([col], 5)), lift that NUMBER
				// off the output queue into the FUNC token.
				const meta = FUNCTION_BY_NAME.get(func.value);
				if (
					meta?.constArgIndex !== undefined &&
					func.constN === undefined &&
					args === meta.constArgIndex + 1
				) {
					const lastOut = outputQueue[outputQueue.length - 1];
					if (lastOut?.type !== "NUMBER") {
						throw new FormulaError(
							`${meta.signature}: argument #${meta.constArgIndex + 1} must be a constant number`,
							func.pos,
						);
					}
					func.constN = lastOut.value;
					outputQueue.pop();
					args--;
				}

				// Arity validation
				if (meta) {
					const provided = args + (func.constN !== undefined ? 1 : 0);
					const min = meta.minArgs;
					const max = meta.maxArgs;
					if (provided < min || (max !== -1 && provided > max)) {
						throw new FormulaError(
							`${meta.signature}: expected ${
								max === -1
									? `at least ${min}`
									: min === max
										? `${min}`
										: `${min}–${max}`
							} argument(s), got ${provided}`,
							func.pos,
						);
					}
				}

				func.args = args;
				outputQueue.push(func);

				if (
					args === 0 &&
					(func.value === "avg" ||
						func.value === "sum" ||
						func.value === "min" ||
						func.value === "max" ||
						func.value === "median" ||
						func.value === "std" ||
						func.value === "var")
				) {
					usesAllColumns = true;
				}
			}
		}
	}
	while (operatorStack.length > 0) {
		const top = operatorStack.pop()!;
		if (top.type === "LPAREN")
			throw new FormulaError("Mismatched parentheses", top.pos);
		outputQueue.push(top);
	}
	return { outputQueue, setUsesAllColumns: usesAllColumns };
}
