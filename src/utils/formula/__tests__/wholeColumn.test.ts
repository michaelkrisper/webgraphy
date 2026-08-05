import { describe, expect, it } from "vitest";
import { evaluateGroupAverage, tryRegressionFormula } from "../wholeColumn";

/**
 * `tryRegressionFormula` and `evaluateGroupAverage` produce columns the user
 * reads as analysis rather than as raw data, so a wrong dispatch or a silently
 * dropped column is invisible in the chart. They are driven directly here
 * instead of through the store.
 */

/** Columns arrive pre-split as Float32 deltas plus a reference point. */
const asColumn = (values: number[]) => ({
	data: Float32Array.from(values),
	refPoint: 0,
});

describe("tryRegressionFormula", () => {
	const columns = ["Time", "Value"];
	// y = 2x + 1 exactly, so every fit has an unambiguous answer.
	const x = [0, 1, 2, 3, 4, 5];
	const y = x.map((v) => 2 * v + 1);
	const columnData = [asColumn(x), asColumn(y)];

	it("returns null for a formula that is not a regression", () => {
		expect(
			tryRegressionFormula("[Value] * 2", columns, x.length, columnData),
		).toBeNull();
	});

	it("returns null when the referenced column is unknown", () => {
		expect(
			tryRegressionFormula("linreg([Missing])", columns, x.length, columnData),
		).toBeNull();
	});

	it("resolves a column given by its bare name after a dataset prefix", () => {
		// Columns are stored as "Dataset: Column"; formulas reference the tail.
		const prefixed = ["Time", "Demo: Value"];
		const result = tryRegressionFormula(
			"linreg([Value])",
			prefixed,
			x.length,
			columnData,
		);
		expect(result).not.toBeNull();
		expect(result?.length).toBe(x.length);
	});

	it("returns null when the positional column data is missing", () => {
		// The caller passes [x, y] positionally; a single column means the
		// regression has nothing to fit against.
		expect(
			tryRegressionFormula("linreg([Value])", columns, x.length, [asColumn(x)]),
		).toBeNull();
	});

	it("fits a linear regression", () => {
		const result = tryRegressionFormula(
			"linreg([Value])",
			columns,
			x.length,
			columnData,
		);
		expect(result).not.toBeNull();
		for (let i = 0; i < x.length; i++) {
			expect(result?.[i]).toBeCloseTo(y[i], 4);
		}
	});

	it("dispatches every regression pattern to a finite result", () => {
		// One case per entry in REGRESSION_PATTERNS: a typo in a pattern or a
		// missing switch arm shows up as a null here.
		const formulas = [
			"linreg([Value])",
			"polyreg([Value], 2)",
			"polyreg([Value])",
			"expreg([Value])",
			"logreg([Value])",
			"kde([Value])",
			"kde([Value], 1.5)",
		];
		for (const formula of formulas) {
			const result = tryRegressionFormula(formula, columns, x.length, columnData);
			expect(result, formula).not.toBeNull();
			expect(result?.length, formula).toBe(x.length);
			for (let i = 0; i < x.length; i++) {
				expect(Number.isFinite(result?.[i]), `${formula} @${i}`).toBe(true);
			}
		}
	});

	it("is case-insensitive and tolerates surrounding whitespace", () => {
		const result = tryRegressionFormula(
			"  LINREG([Value])  ",
			columns,
			x.length,
			columnData,
		);
		expect(result).not.toBeNull();
	});

	it("applies the reference point offset before fitting", () => {
		// Large timestamps are stored as small Float32 deltas plus a refPoint;
		// fitting the deltas alone would silently shift the result.
		const offsetData = [
			{ data: Float32Array.from(x), refPoint: 1_000_000 },
			asColumn(y),
		];
		const result = tryRegressionFormula(
			"linreg([Value])",
			columns,
			x.length,
			offsetData,
		);
		expect(result).not.toBeNull();
		for (let i = 0; i < x.length; i++) {
			expect(result?.[i]).toBeCloseTo(y[i], 3);
		}
	});
});

describe("evaluateGroupAverage", () => {
	const columns = ["Time", "Value"];
	const HOUR_SECONDS = 3600;
	// Four samples spread over two whole hours, two per hour.
	const times = [0, 60, HOUR_SECONDS, HOUR_SECONDS + 60];
	const values = [10, 20, 100, 200];
	// columnData is indexed by compileFormula's usedColumnIndices, i.e. in the
	// order the formula references columns — the referenced value column first,
	// then the time column appended by ensureTimeColumn. Not the global order.
	const columnData = [asColumn(values), asColumn(times)];

	// Same pattern evaluateFormulaSync uses to route into the group pass.
	const matchFor = (formula: string) => {
		const m = formula
			.trim()
			.match(/^avg(day|hour|minute|second)([lcr])?\(\[(.+)\]\)$/i);
		expect(m, `pattern did not match ${formula}`).not.toBeNull();
		return m as RegExpMatchArray;
	};

	it("averages values within each time bucket", () => {
		const formula = "avghour([Value])";
		const result = evaluateGroupAverage(
			matchFor(formula),
			formula,
			columns,
			times.length,
			columnData,
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		// Two hourly buckets -> a compact two-row sub-dataset.
		expect(result.newColumn?.data.length).toBe(2);
		expect(result.sparseXColumn?.data.length).toBe(2);

		const ys = Array.from(result.newColumn!.data).map(
			(v) => v + result.newColumn!.refPoint,
		);
		expect(ys[0]).toBeCloseTo(15, 4);
		expect(ys[1]).toBeCloseTo(150, 4);
	});

	it("reports an unknown value column instead of producing a column", () => {
		const formula = "avghour([Nope])";
		const result = evaluateGroupAverage(
			matchFor(formula),
			formula,
			columns,
			times.length,
			columnData,
		);

		expect(result.type).toBe("error");
		if (result.type !== "error") return;
		expect(result.error).toContain("Nope");
	});

	it("surfaces a compile error from the underlying formula", () => {
		const formula = "avghour([Value])";
		const result = evaluateGroupAverage(
			matchFor(formula),
			// A formula the compiler rejects; the group pass must not swallow it.
			"[Value] +",
			columns,
			times.length,
			columnData,
		);

		expect(result.type).toBe("error");
	});

	it("places the representative point according to the alignment flag", () => {
		const read = (formula: string) => {
			const result = evaluateGroupAverage(
				matchFor(formula),
				formula,
				columns,
				times.length,
				columnData,
			);
			expect(result.type).toBe("success");
			if (result.type !== "success") return [];
			return Array.from(result.sparseXColumn!.data).map(
				(v) => v + result.sparseXColumn!.refPoint,
			);
		};

		const left = read("avghourl([Value])");
		const right = read("avghourr([Value])");
		const centre = read("avghour([Value])");

		// Left anchors on the first sample of the bucket, right on the last,
		// and the default sits between them.
		expect(left[0]).toBe(times[0]);
		expect(right[0]).toBe(times[1]);
		expect(centre[0]).toBeGreaterThanOrEqual(left[0]);
		expect(centre[0]).toBeLessThanOrEqual(right[0]);
	});

	it("buckets by the requested granularity", () => {
		const formula = "avgminute([Value])";
		const result = evaluateGroupAverage(
			matchFor(formula),
			formula,
			columns,
			times.length,
			columnData,
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		// Minute buckets keep all four samples apart, unlike the hourly case.
		expect(result.newColumn?.data.length).toBe(4);
	});

	it("passes the dataset id and name through to the result", () => {
		const formula = "avghour([Value])";
		const result = evaluateGroupAverage(
			matchFor(formula),
			formula,
			columns,
			times.length,
			columnData,
			"ds-1",
			"Hourly",
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		expect(result.datasetId).toBe("ds-1");
		expect(result.name).toBe("Hourly");
	});

	it("emits rows in ascending x even when the input is unordered", () => {
		const unorderedTimes = [HOUR_SECONDS, 0, HOUR_SECONDS + 60, 60];
		const unorderedValues = [100, 10, 200, 20];
		const formula = "avghour([Value])";

		const result = evaluateGroupAverage(
			matchFor(formula),
			formula,
			columns,
			unorderedTimes.length,
			[asColumn(unorderedValues), asColumn(unorderedTimes)],
		);

		expect(result.type).toBe("success");
		if (result.type !== "success") return;
		const xs = Array.from(result.sparseXColumn!.data).map(
			(v) => v + result.sparseXColumn!.refPoint,
		);
		for (let i = 1; i < xs.length; i++) {
			expect(xs[i]).toBeGreaterThanOrEqual(xs[i - 1]);
		}
	});
});
