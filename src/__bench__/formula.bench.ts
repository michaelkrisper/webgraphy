import { bench, describe } from "vitest";
import { findClosest, findFirstGE, findLastLE } from "../utils/binarySearch";
import { compileFormula } from "../utils/formula";
import { LARGE, makeSeries } from "./fixtures";

/**
 * Formula evaluation runs once per row over a whole column, so its per-row
 * cost is multiplied by the dataset size. Binary search sits underneath the
 * decimation and crosshair paths and runs several times per frame.
 */

const { x } = makeSeries(LARGE);
const columns = ["Time", "Value"];
const ROWS = 100_000;

describe("formula — compile", () => {
	bench("compile a mixed expression", () => {
		compileFormula(
			"([Value] * 2 + sqrt(abs([Time]))) / max(1, [Value])",
			columns,
		);
	});
});

describe("formula — evaluate", () => {
	const simple = compileFormula("[Value] * 2 + 1", columns);
	const mixed = compileFormula(
		"([Value] * 2 + sqrt(abs([Time]))) / max(1, [Value])",
		columns,
	);
	const row = [1.5, 2.5];

	bench(`simple expression x${ROWS} rows`, () => {
		const ctx = simple.createContext?.();
		for (let i = 0; i < ROWS; i++) {
			row[0] = i * 0.001;
			simple.evaluate(row, ctx);
		}
	});

	bench(`mixed expression x${ROWS} rows`, () => {
		const ctx = mixed.createContext?.();
		for (let i = 0; i < ROWS; i++) {
			row[0] = i * 0.001;
			mixed.evaluate(row, ctx);
		}
	});
});

describe("binarySearch", () => {
	const targets = [0, 250_000, 500_000, 750_000, 999_999];

	bench("findFirstGE x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findFirstGE(x, targets[i % targets.length], 0, x.length);
		}
	});

	bench("findLastLE x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findLastLE(x, targets[i % targets.length], 0, x.length);
		}
	});

	bench("findClosest x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findClosest(x, targets[i % targets.length], 0);
		}
	});
});
