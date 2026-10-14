import { FUNCTION_BY_NAME } from "../formulaFunctions";

export type RegressionName = "linreg" | "polyreg" | "expreg" | "logreg" | "kde";

export interface RegressionSpec {
	name: RegressionName;
	/** Column name as written between the brackets. */
	column: string;
	/** Optional numeric argument: polyreg degree or kde bandwidth. */
	param?: number;
}

const REGRESSION_PREFIX = /^(linreg|polyreg|expreg|logreg|kde)\s*\(/i;
// The numeric literal mirrors the lexer: decimals and scientific notation.
const REGRESSION_FULL =
	/^(linreg|polyreg|expreg|logreg|kde)\s*\(\s*\[([^\]]+)\]\s*(?:,\s*((?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)\s*)?\)$/i;

/**
 * Single matcher for the whole-column regression formulas, shared by the
 * store (which picks the [x, y] column payload), the worker (which runs the
 * fit) and the editor's live validation. Regressions need the full columns,
 * so they are only valid as the entire formula; anything else that starts
 * with one is rejected rather than falling through to the row-wise compiler.
 *
 * Returns null when the formula is not a regression call at all.
 */
export function matchRegressionFormula(
	formula: string,
): RegressionSpec | { error: string } | null {
	const trimmed = formula.trim();
	const prefix = trimmed.match(REGRESSION_PREFIX);
	if (!prefix) return null;

	const name = prefix[1].toLowerCase() as RegressionName;
	const meta = FUNCTION_BY_NAME.get(name);
	const signature = meta?.signature ?? `${name}([col])`;
	const m = trimmed.match(REGRESSION_FULL);
	if (!m) {
		return {
			error: `${signature}: must be the entire formula, e.g. ${meta?.example ?? signature}`,
		};
	}

	const column = m[2];
	if (m[3] === undefined) return { name, column };

	const param = Number(m[3]);
	if (name === "polyreg") {
		if (!Number.isInteger(param))
			return { error: `${signature}: degree must be a whole number` };
	} else if (name === "kde") {
		if (!(param > 0) || !Number.isFinite(param))
			return { error: `${signature}: bandwidth must be a positive number` };
	} else {
		return { error: `${signature}: expected 1 argument(s), got 2` };
	}
	return { name, column, param };
}
