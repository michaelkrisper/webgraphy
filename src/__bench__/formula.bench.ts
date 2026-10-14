import { describe } from "vitest";
import { benchCase } from "./benchCase";
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
	benchCase("compile a mixed expression", () => {
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

	benchCase(`simple expression x${ROWS} rows`, () => {
		const ctx = simple.createContext?.();
		for (let i = 0; i < ROWS; i++) {
			row[0] = i * 0.001;
			simple.evaluate(row, ctx);
		}
	});

	benchCase(`mixed expression x${ROWS} rows`, () => {
		const ctx = mixed.createContext?.();
		for (let i = 0; i < ROWS; i++) {
			row[0] = i * 0.001;
			mixed.evaluate(row, ctx);
		}
	});
});

describe("binarySearch", () => {
	const targets = [0, 250_000, 500_000, 750_000, 999_999];

	benchCase("findFirstGE x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findFirstGE(x, targets[i % targets.length], 0, x.length);
		}
	});

	benchCase("findLastLE x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findLastLE(x, targets[i % targets.length], 0, x.length);
		}
	});

	benchCase("findClosest x1000", () => {
		for (let i = 0; i < 1000; i++) {
			findClosest(x, targets[i % targets.length], 0);
		}
	});
});
