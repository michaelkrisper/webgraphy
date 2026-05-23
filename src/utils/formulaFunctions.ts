/**
 * Single source of truth for all formula-engine functions and constants.
 *
 * Consumed by:
 *   - utils/formula.ts          → lexer keyword recognition + runtime
 *   - hooks/useFormulaEditor.ts → autocomplete entries
 *   - components/.../FormulaReference.tsx → searchable in-modal help panel
 *
 * Keep this list authoritative — do not add functions in the lexer
 * without an entry here.
 */

export type FormulaCategory =
	| "math"
	| "trig"
	| "stat"
	| "rolling"
	| "row"
	| "time"
	| "logic"
	| "regression"
	| "constant";

export interface FormulaFunctionMeta {
	name: string;
	signature: string;
	description: string;
	category: FormulaCategory;
	example: string;
	minArgs: number;
	/** -1 = unlimited */
	maxArgs: number;
	/** Stateful per call site (uses ctx + FUNC id). */
	isStateful?: boolean;
	/** Function reads the time column implicitly. */
	needsTime?: boolean;
	/** Second argument must be a compile-time numeric literal (window size, lag, etc). */
	constArgIndex?: number;
}

export const CONSTANTS = [
	{ name: "pi", description: "π ≈ 3.14159", value: Math.PI },
	{ name: "e", description: "Euler's number ≈ 2.71828", value: Math.E },
] as const;

export const FUNCTIONS: FormulaFunctionMeta[] = [
	// ── Basic math ──────────────────────────────────────────────
	{ name: "sqrt", signature: "sqrt(x)", description: "Square root", category: "math", example: "sqrt([dist]^2)", minArgs: 1, maxArgs: 1 },
	{ name: "abs", signature: "abs(x)", description: "Absolute value", category: "math", example: "abs([err])", minArgs: 1, maxArgs: 1 },
	{ name: "exp", signature: "exp(x)", description: "eˣ", category: "math", example: "exp([t]/tau)", minArgs: 1, maxArgs: 1 },
	{ name: "log", signature: "log(x)", description: "Base-10 logarithm", category: "math", example: "log([power])", minArgs: 1, maxArgs: 1 },
	{ name: "log2", signature: "log2(x)", description: "Base-2 logarithm", category: "math", example: "log2([count])", minArgs: 1, maxArgs: 1 },
	{ name: "ln", signature: "ln(x)", description: "Natural logarithm (base e)", category: "math", example: "ln([conc])", minArgs: 1, maxArgs: 1 },
	{ name: "logn", signature: "logn(base, x)", description: "Logarithm with arbitrary base", category: "math", example: "logn(3, [n])", minArgs: 2, maxArgs: 2 },
	{ name: "pow", signature: "pow(x, n)", description: "x raised to the n-th power", category: "math", example: "pow([v], 3)", minArgs: 2, maxArgs: 2 },
	{ name: "round", signature: "round(x)", description: "Round to nearest integer", category: "math", example: "round([t]*10)/10", minArgs: 1, maxArgs: 1 },
	{ name: "floor", signature: "floor(x)", description: "Round down to integer", category: "math", example: "floor([t])", minArgs: 1, maxArgs: 1 },
	{ name: "ceil", signature: "ceil(x)", description: "Round up to integer", category: "math", example: "ceil([t])", minArgs: 1, maxArgs: 1 },
	{ name: "trunc", signature: "trunc(x)", description: "Truncate toward zero", category: "math", example: "trunc([t])", minArgs: 1, maxArgs: 1 },
	{ name: "sign", signature: "sign(x)", description: "Returns −1, 0 or 1 depending on sign", category: "math", example: "sign([dx])", minArgs: 1, maxArgs: 1 },
	{ name: "mod", signature: "mod(a, b)", description: "Mathematical modulo (matches floor division)", category: "math", example: "mod([i], 10)", minArgs: 2, maxArgs: 2 },
	{ name: "clamp", signature: "clamp(x, lo, hi)", description: "Clamp x into [lo, hi]", category: "math", example: "clamp([t], 0, 100)", minArgs: 3, maxArgs: 3 },
	{ name: "hypot", signature: "hypot(...)", description: "Pythagorean: √(x²+y²+…)", category: "math", example: "hypot([x], [y])", minArgs: 1, maxArgs: -1 },

	// ── Trigonometry ────────────────────────────────────────────
	{ name: "sin", signature: "sin(x)", description: "Sine (radians)", category: "trig", example: "sin([phase])", minArgs: 1, maxArgs: 1 },
	{ name: "cos", signature: "cos(x)", description: "Cosine (radians)", category: "trig", example: "cos([phase])", minArgs: 1, maxArgs: 1 },
	{ name: "tan", signature: "tan(x)", description: "Tangent (radians)", category: "trig", example: "tan([phase])", minArgs: 1, maxArgs: 1 },
	{ name: "asin", signature: "asin(x)", description: "Inverse sine (returns radians)", category: "trig", example: "asin([ratio])", minArgs: 1, maxArgs: 1 },
	{ name: "acos", signature: "acos(x)", description: "Inverse cosine (returns radians)", category: "trig", example: "acos([ratio])", minArgs: 1, maxArgs: 1 },
	{ name: "atan", signature: "atan(x)", description: "Inverse tangent (returns radians)", category: "trig", example: "atan([slope])", minArgs: 1, maxArgs: 1 },
	{ name: "atan2", signature: "atan2(y, x)", description: "Two-argument arctangent (handles quadrants)", category: "trig", example: "atan2([dy], [dx])", minArgs: 2, maxArgs: 2 },
	{ name: "sinh", signature: "sinh(x)", description: "Hyperbolic sine", category: "trig", example: "sinh([x])", minArgs: 1, maxArgs: 1 },
	{ name: "cosh", signature: "cosh(x)", description: "Hyperbolic cosine", category: "trig", example: "cosh([x])", minArgs: 1, maxArgs: 1 },
	{ name: "tanh", signature: "tanh(x)", description: "Hyperbolic tangent", category: "trig", example: "tanh([x])", minArgs: 1, maxArgs: 1 },

	// ── Aggregates over the current row ────────────────────────
	{ name: "min", signature: "min(a, b, …)", description: "Minimum of arguments. Empty args = min over all numeric columns in the row.", category: "stat", example: "min([a], [b])", minArgs: 0, maxArgs: -1 },
	{ name: "max", signature: "max(a, b, …)", description: "Maximum of arguments. Empty args = max over all numeric columns in the row.", category: "stat", example: "max([a], [b])", minArgs: 0, maxArgs: -1 },
	{ name: "sum", signature: "sum(a, b, …)", description: "Sum of arguments. Empty args = sum over all numeric columns in the row.", category: "stat", example: "sum()", minArgs: 0, maxArgs: -1 },
	{ name: "avg", signature: "avg(a, b, …)", description: "Mean of arguments. Empty args = mean across all numeric columns in the row.", category: "stat", example: "avg()", minArgs: 0, maxArgs: -1 },
	{ name: "median", signature: "median(a, b, …)", description: "Median of arguments. Empty args = median across the row.", category: "stat", example: "median([a],[b],[c])", minArgs: 0, maxArgs: -1 },
	{ name: "std", signature: "std(a, b, …)", description: "Sample standard deviation. Empty args = std across the row.", category: "stat", example: "std()", minArgs: 0, maxArgs: -1 },
	{ name: "var", signature: "var(a, b, …)", description: "Sample variance. Empty args = variance across the row.", category: "stat", example: "var()", minArgs: 0, maxArgs: -1 },

	// ── Rolling windows (legacy ergonomic forms are aliased in lexer) ──
	{ name: "rolling", signature: "rolling(expr, n)", description: "Rolling mean over the last n rows (left/trailing). Aliases: avgN, avgNl.", category: "rolling", example: "rolling([t], 5)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingc", signature: "rollingC(expr, n)", description: "Rolling mean, centered. Aliases: avgNc.", category: "rolling", example: "rollingC([t], 5)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingr", signature: "rollingR(expr, n)", description: "Rolling mean, right-aligned (leading). Aliases: avgNr.", category: "rolling", example: "rollingR([t], 5)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingtime", signature: "rollingTime(expr, seconds)", description: "Rolling mean over a time window (left/trailing). Aliases: avgNs/m/h/d.", category: "rolling", example: "rollingTime([t], 3600)", minArgs: 2, maxArgs: 2, isStateful: true, needsTime: true, constArgIndex: 1 },
	{ name: "rollingtimec", signature: "rollingTimeC(expr, seconds)", description: "Rolling time-window mean, centered. Aliases: avgNsc.", category: "rolling", example: "rollingTimeC([t], 3600)", minArgs: 2, maxArgs: 2, isStateful: true, needsTime: true, constArgIndex: 1 },
	{ name: "rollingtimer", signature: "rollingTimeR(expr, seconds)", description: "Rolling time-window mean, right-aligned.", category: "rolling", example: "rollingTimeR([t], 3600)", minArgs: 2, maxArgs: 2, isStateful: true, needsTime: true, constArgIndex: 1 },
	{ name: "rollingmed", signature: "rollingMed(expr, n)", description: "Rolling median over the last n rows.", category: "rolling", example: "rollingMed([t], 11)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingstd", signature: "rollingStd(expr, n)", description: "Rolling sample standard deviation over the last n rows.", category: "rolling", example: "rollingStd([t], 20)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingmin", signature: "rollingMin(expr, n)", description: "Rolling minimum over the last n rows.", category: "rolling", example: "rollingMin([t], 60)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "rollingmax", signature: "rollingMax(expr, n)", description: "Rolling maximum over the last n rows.", category: "rolling", example: "rollingMax([t], 60)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },

	// ── Time-bucket cumulative ─────────────────────────────────
	{ name: "avgday", signature: "avgDay(expr)", description: "Cumulative mean within each calendar day, resets at midnight.", category: "time", example: "avgDay([temp])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "avghour", signature: "avgHour(expr)", description: "Cumulative mean within each hour, resets at the top of the hour.", category: "time", example: "avgHour([temp])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "avgminute", signature: "avgMinute(expr)", description: "Cumulative mean within each minute.", category: "time", example: "avgMinute([temp])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "avgsecond", signature: "avgSecond(expr)", description: "Cumulative mean within each second.", category: "time", example: "avgSecond([temp])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "sumday", signature: "sumDay(expr)", description: "Cumulative sum within each calendar day.", category: "time", example: "sumDay([flow])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "sumhour", signature: "sumHour(expr)", description: "Cumulative sum within each hour.", category: "time", example: "sumHour([flow])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "summinute", signature: "sumMinute(expr)", description: "Cumulative sum within each minute.", category: "time", example: "sumMinute([flow])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },
	{ name: "sumsecond", signature: "sumSecond(expr)", description: "Cumulative sum within each second.", category: "time", example: "sumSecond([flow])", minArgs: 1, maxArgs: 1, isStateful: true, needsTime: true },

	// ── Row-relative ───────────────────────────────────────────
	{ name: "lag", signature: "lag(expr, n)", description: "Value of expr from n rows back. First n rows return NaN.", category: "row", example: "lag([t], 1)", minArgs: 2, maxArgs: 2, isStateful: true, constArgIndex: 1 },
	{ name: "diff", signature: "diff(expr)", description: "First difference: current value minus previous value. First row returns NaN.", category: "row", example: "diff([odo])", minArgs: 1, maxArgs: 1, isStateful: true },
	{ name: "cumsum", signature: "cumsum(expr)", description: "Cumulative sum across all rows.", category: "row", example: "cumsum([dt])", minArgs: 1, maxArgs: 1, isStateful: true },
	{ name: "cumprod", signature: "cumprod(expr)", description: "Cumulative product across all rows.", category: "row", example: "cumprod([gain])", minArgs: 1, maxArgs: 1, isStateful: true },
	{ name: "cummax", signature: "cummax(expr)", description: "Running maximum across all rows.", category: "row", example: "cummax([t])", minArgs: 1, maxArgs: 1, isStateful: true },
	{ name: "cummin", signature: "cummin(expr)", description: "Running minimum across all rows.", category: "row", example: "cummin([t])", minArgs: 1, maxArgs: 1, isStateful: true },

	// ── Logic ──────────────────────────────────────────────────
	{ name: "if", signature: "if(cond, a, b)", description: "Returns a when cond is truthy (non-zero, non-NaN), otherwise b. All three arguments are evaluated.", category: "logic", example: "if([t] > 100, 1, 0)", minArgs: 3, maxArgs: 3 },
	{ name: "isnan", signature: "isnan(x)", description: "Returns 1 if x is NaN, otherwise 0.", category: "logic", example: "isnan([t])", minArgs: 1, maxArgs: 1 },
	{ name: "coalesce", signature: "coalesce(a, b, …)", description: "Returns the first non-NaN argument.", category: "logic", example: "coalesce([t], 0)", minArgs: 1, maxArgs: -1 },

	// ── Smoothing ──────────────────────────────────────────────
	{ name: "filter", signature: "filter(expr [, processNoise])", description: "Adaptive Kalman filter. Optional process-noise tuning (default 1e-3; higher = follows signal faster).", category: "rolling", example: "filter([raw], 1e-3)", minArgs: 1, maxArgs: 2, isStateful: true },

	// ── Regression (whole-column, handled in evaluateFormulaSync) ──
	{ name: "linreg", signature: "linreg([col])", description: "Linear regression fit of [col] against the x-axis column.", category: "regression", example: "linreg([y])", minArgs: 1, maxArgs: 1 },
	{ name: "polyreg", signature: "polyreg([col] [, degree])", description: "Polynomial regression fit (default degree 3).", category: "regression", example: "polyreg([y], 2)", minArgs: 1, maxArgs: 2 },
	{ name: "expreg", signature: "expreg([col])", description: "Exponential regression fit.", category: "regression", example: "expreg([y])", minArgs: 1, maxArgs: 1 },
	{ name: "logreg", signature: "logreg([col])", description: "Logistic regression fit.", category: "regression", example: "logreg([y])", minArgs: 1, maxArgs: 1 },
	{ name: "kde", signature: "kde([col] [, bandwidth])", description: "Kernel-density-estimated smoothed fit.", category: "regression", example: "kde([y])", minArgs: 1, maxArgs: 2 },
];

/** Canonical name → metadata. */
export const FUNCTION_BY_NAME: Map<string, FormulaFunctionMeta> = new Map(
	FUNCTIONS.map((f) => [f.name, f]),
);

/** Functions whose names are recognised verbatim (lowercased) by the lexer. */
export const KNOWN_FUNCTION_NAMES: Set<string> = new Set(
	FUNCTIONS.map((f) => f.name),
);

/**
 * Aliases legacy names (avg5, avg5c, avgday, avg1h, …) to a canonical
 * function name. The lexer applies these before keyword lookup.
 *
 * Returns { canonical, constArg? } where constArg, if present, must be
 * synthesised at parse time (the legacy name encoded n + unit).
 */
export function resolveLegacyName(
	raw: string,
): { canonical: string; constArg?: number } | null {
	const lower = raw.toLowerCase();

	// avgN, avgNc, avgNl, avgNr  →  rolling/rollingC/rollingR(expr, N)
	const m1 = /^avg(\d+)([lcr])?$/.exec(lower);
	if (m1) {
		const n = parseInt(m1[1], 10);
		const align = m1[2] ?? "l";
		const canonical =
			align === "c" ? "rollingc" : align === "r" ? "rollingr" : "rolling";
		return { canonical, constArg: n };
	}

	// avgNs / avgNm / avgNh / avgNd (with optional c/l/r) → rollingTime[CR](expr, seconds)
	const m2 = /^avg(\d+)(s|m|h|d)([lcr])?$/.exec(lower);
	if (m2) {
		const n = parseInt(m2[1], 10);
		const unit = m2[2];
		const align = m2[3] ?? "l";
		const seconds =
			unit === "s" ? n : unit === "m" ? n * 60 : unit === "h" ? n * 3600 : n * 86400;
		const canonical =
			align === "c"
				? "rollingtimec"
				: align === "r"
					? "rollingtimer"
					: "rollingtime";
		return { canonical, constArg: seconds };
	}

	// avgday/avghour/avgminute/avgsecond with alignment suffix → strip suffix
	// (alignment is applied via the top-level post-pass in evaluateFormulaSync).
	const m3 = /^(avg|sum)(day|hour|minute|second)[lcr]?$/.exec(lower);
	if (m3) return { canonical: `${m3[1]}${m3[2]}` };

	return null;
}
