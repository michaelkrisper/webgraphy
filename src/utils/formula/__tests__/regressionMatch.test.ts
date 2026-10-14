import { describe, expect, it } from "vitest";
import { matchRegressionFormula } from "../regressionMatch";

describe("matchRegressionFormula", () => {
	it("returns null for non-regression formulas", () => {
		expect(matchRegressionFormula("[y] * 2")).toBeNull();
		expect(matchRegressionFormula("2 * linreg([y])")).toBeNull();
		expect(matchRegressionFormula("linear([y])")).toBeNull();
	});

	it.each([
		["linreg([y])", { name: "linreg", column: "y" }],
		["  LINREG ( [y] )  ", { name: "linreg", column: "y" }],
		["polyreg([y])", { name: "polyreg", column: "y" }],
		["polyreg([y], 2)", { name: "polyreg", column: "y", param: 2 }],
		["expreg([a b])", { name: "expreg", column: "a b" }],
		["logreg([y])", { name: "logreg", column: "y" }],
		["kde([y])", { name: "kde", column: "y" }],
		["kde([y], 1.5)", { name: "kde", column: "y", param: 1.5 }],
		["kde([y], 1e3)", { name: "kde", column: "y", param: 1000 }],
		["kde([y], 2.5E-2)", { name: "kde", column: "y", param: 0.025 }],
		["kde([y], .5)", { name: "kde", column: "y", param: 0.5 }],
	])("matches %j", (formula, spec) => {
		expect(matchRegressionFormula(formula)).toEqual(spec);
	});

	it.each([
		["linreg([y])*2", "must be the entire formula"],
		["linreg([y]) + [x]", "must be the entire formula"],
		["kde([y], [x])", "must be the entire formula"],
		["linreg(y)", "must be the entire formula"],
		["polyreg([y], 2.5)", "degree must be a whole number"],
		["kde([y], 0)", "bandwidth must be a positive number"],
		["linreg([y], 2)", "expected 1 argument(s), got 2"],
	])("rejects %j", (formula, error) => {
		const r = matchRegressionFormula(formula);
		expect(r && "error" in r ? r.error : null).toContain(error);
	});
});
