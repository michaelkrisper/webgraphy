/**
 * Formula engine for calculated columns.
 *
 * Pipeline: text → tokens (lexer) → RPN (shunting-yard) → row-wise interpreter
 * over a pre-allocated Float64Array stack. No eval/new Function — column
 * references and function names are validated against the dataset and a
 * single source of truth (formulaFunctions.ts).
 *
 * Top-level regression and group-average formulas take a separate path in
 * evaluateFormulaSync that needs full-column access.
 */

export * from "./formula/types";
export { compileFormula } from "./formula/compile";
export { evaluateFormulaSync } from "./formula/wholeColumn";
