import { describe, it, expect } from "vitest";
import {
	evaluateAggregate,
	evaluateBucketFunc,
	evaluateRolling,
	evaluateRowRelative,
	evaluateFuncToken,
} from "../evaluate";
import type { Token, FormulaContext } from "../types";

describe("evaluateAggregate", () => {
	it("evaluates aggregates with explicit args", () => {
		expect(evaluateAggregate("sum", [1, 2, 3], [], [])).toBe(6);
		expect(evaluateAggregate("avg", [1, 2, 3], [], [])).toBe(2);
		expect(evaluateAggregate("min", [1, 2, 3], [], [])).toBe(1);
		expect(evaluateAggregate("max", [1, 2, 3], [], [])).toBe(3);
		expect(evaluateAggregate("median", [1, 2, 3], [], [])).toBe(2);
		expect(evaluateAggregate("var", [1, 2, 3], [], [])).toBe(1);
		expect(evaluateAggregate("std", [1, 2, 3], [], [])).toBe(1);
		expect(evaluateAggregate("unknown", [1, 2, 3], [], [])).toBeNaN();
	});

	it("evaluates aggregates with rowValues when args is empty", () => {
		const rowValues = [10, 20, 30, 40];
		const indices = [1, 3];
		expect(evaluateAggregate("sum", [], rowValues, indices)).toBe(60);
		expect(evaluateAggregate("avg", [], rowValues, indices)).toBe(30);
		expect(evaluateAggregate("min", [], rowValues, indices)).toBe(20);
		expect(evaluateAggregate("max", [], rowValues, indices)).toBe(40);
	});

	it("handles empty values", () => {
		expect(evaluateAggregate("sum", [], [], [])).toBe(0);
		expect(evaluateAggregate("avg", [], [], [])).toBe(0);
		expect(evaluateAggregate("min", [], [], [])).toBeNaN();
		expect(evaluateAggregate("max", [], [], [])).toBeNaN();
	});
});

describe("evaluateFuncToken", () => {
	it("evaluates basic math functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});

		expect(evaluateFuncToken(token("pow"), [2, 3], [], [], 0)).toBe(8);
		expect(evaluateFuncToken(token("mod"), [5, 2], [], [], 0)).toBe(1);
		expect(evaluateFuncToken(token("logn"), [10, 100], [], [], 0)).toBe(2);
		expect(evaluateFuncToken(token("atan2"), [1, 1], [], [], 0)).toBe(
			Math.atan2(1, 1),
		);
		expect(evaluateFuncToken(token("hypot"), [3, 4], [], [], 0)).toBe(5);
		expect(evaluateFuncToken(token("clamp"), [10, 0, 5], [], [], 0)).toBe(5);
		expect(evaluateFuncToken(token("clamp"), [-10, 0, 5], [], [], 0)).toBe(0);
		expect(evaluateFuncToken(token("clamp"), [3, 0, 5], [], [], 0)).toBe(3);
	});

	it("evaluates logic functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});

		expect(evaluateFuncToken(token("if"), [1, 10, 20], [], [], 0)).toBe(10);
		expect(evaluateFuncToken(token("if"), [0, 10, 20], [], [], 0)).toBe(20);

		expect(evaluateFuncToken(token("coalesce"), [NaN, 5, 10], [], [], 0)).toBe(5);
		expect(evaluateFuncToken(token("coalesce"), [NaN, NaN], [], [], 0)).toBeNaN();
	});

	it("evaluates unary math functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		expect(evaluateFuncToken(token("abs"), [-5], [], [], 0)).toBe(5);
		expect(evaluateFuncToken(token("sin"), [0], [], [], 0)).toBe(0);
	});

	it("delegates aggregate functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		expect(evaluateFuncToken(token("sum"), [1, 2, 3], [], [], 0)).toBe(6);
	});

	it("returns first argument for unknown function", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		expect(evaluateFuncToken(token("unknown_func"), [42, 10], [], [], 0)).toBe(
			42,
		);
	});
});

describe("evaluateBucketFunc", () => {
	it("returns first argument when context is missing", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "avgday",
			id: 1,
			pos: 0,
		};
		expect(evaluateBucketFunc(token, 42, [], 0)).toBe(42);
	});

	it("evaluates bucket functions with context", () => {
		const tokenAvg: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "avgday",
			id: 1,
			pos: 0,
		};
		const tokenSum: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "sumday",
			id: 2,
			pos: 0,
		};
		const ctx = {
			groupSums: {},
			groupCounts: {},
			groupLastKey: {},
		} as unknown as FormulaContext;

		const ts = 1600000000000;
		const rowValues = [0, ts];

		expect(evaluateBucketFunc(tokenAvg, 10, rowValues, 1, ctx)).toBe(10);
		expect(evaluateBucketFunc(tokenAvg, 20, rowValues, 1, ctx)).toBe(15);

		expect(evaluateBucketFunc(tokenSum, 10, rowValues, 1, ctx)).toBe(10);
		expect(evaluateBucketFunc(tokenSum, 20, rowValues, 1, ctx)).toBe(30);
	});
});

describe("evaluateRolling", () => {
	it("returns first argument when context is missing", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "rolling",
			id: 1,
			pos: 0,
		};
		expect(evaluateRolling(token, [42], [], 0)).toBe(42);
	});

	it("evaluates rolling function", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "rolling",
			id: 1,
			pos: 0,
			constN: 2,
		};
		const ctx = {
			queues: {},
			sums: {},
		} as unknown as FormulaContext;

		expect(evaluateRolling(token, [10], [], 0, ctx)).toBe(10);
		expect(evaluateRolling(token, [20], [], 0, ctx)).toBe(15);
		expect(evaluateRolling(token, [30], [], 0, ctx)).toBe(25);
	});

	it("evaluates rolling time function", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "rollingtime",
			id: 1,
			pos: 0,
			constN: 10,
		};
		const ctx = {
			timeQueues: {},
			timeSums: {},
		} as unknown as FormulaContext;

		const t1 = 1600000000000;
		const t2 = 1600000005000;
		const t3 = 1600000015000; // t3 = t1 + 15000. Both t1 and t2 <= t3 - 10000

		expect(evaluateRolling(token, [10], [0, t1], 1, ctx)).toBe(10);
		expect(evaluateRolling(token, [20], [0, t2], 1, ctx)).toBe(15);
		expect(evaluateRolling(token, [30], [0, t3], 1, ctx)).toBe(30);
	});

	it("evaluates other rolling variants", () => {
		const ctx = { queues: {}, sums: {}, sumsSq: {} } as unknown as FormulaContext;

		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmed", id: 2, pos: 0, constN: 3 },
				[10],
				[],
				0,
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmed", id: 2, pos: 0, constN: 3 },
				[20],
				[],
				0,
				ctx,
			),
		).toBe(15);
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmed", id: 2, pos: 0, constN: 3 },
				[30],
				[],
				0,
				ctx,
			),
		).toBe(20);

		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmin", id: 3, pos: 0, constN: 3 },
				[10],
				[],
				0,
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmin", id: 3, pos: 0, constN: 3 },
				[5],
				[],
				0,
				ctx,
			),
		).toBe(5);

		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmax", id: 4, pos: 0, constN: 3 },
				[10],
				[],
				0,
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingmax", id: 4, pos: 0, constN: 3 },
				[20],
				[],
				0,
				ctx,
			),
		).toBe(20);

		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingstd", id: 5, pos: 0, constN: 3 },
				[10],
				[],
				0,
				ctx,
			),
		).toBe(0);
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rollingstd", id: 5, pos: 0, constN: 3 },
				[20],
				[],
				0,
				ctx,
			),
		).toBeCloseTo(7.071);

		// unknown rolling
		expect(
			evaluateRolling(
				{ type: "FUNC", value: "rolling_unknown", id: 6, pos: 0 },
				[42],
				[],
				0,
				ctx,
			),
		).toBe(42);
	});
});

describe("evaluateRowRelative", () => {
	it("returns first argument when context is missing", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "lag",
			id: 1,
			pos: 0,
		};
		expect(evaluateRowRelative(token, [42])).toBe(42);
	});

	it("evaluates lag", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "lag",
			id: 1,
			pos: 0,
			constN: 1,
		};
		const ctx = { lagBuffers: {} } as unknown as FormulaContext;

		expect(evaluateRowRelative(token, [10], ctx)).toBeNaN();
		expect(evaluateRowRelative(token, [20], ctx)).toBe(10);
		expect(evaluateRowRelative(token, [30], ctx)).toBe(20);
	});

	it("evaluates diff", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "diff",
			id: 2,
			pos: 0,
		};
		const ctx = { hasPrev: {}, prevVals: {} } as unknown as FormulaContext;

		expect(evaluateRowRelative(token, [10], ctx)).toBeNaN();
		expect(evaluateRowRelative(token, [25], ctx)).toBe(15);
		expect(evaluateRowRelative(token, [20], ctx)).toBe(-5);
	});

	it("evaluates cumsum, cumprod, cummax, cummin", () => {
		const ctx = { cumState: {}, cumHas: {} } as unknown as FormulaContext;

		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cumsum", id: 3, pos: 0 },
				[10],
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cumsum", id: 3, pos: 0 },
				[20],
				ctx,
			),
		).toBe(30);

		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cumprod", id: 4, pos: 0 },
				[2],
				ctx,
			),
		).toBe(2);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cumprod", id: 4, pos: 0 },
				[3],
				ctx,
			),
		).toBe(6);

		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummax", id: 5, pos: 0 },
				[10],
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummax", id: 5, pos: 0 },
				[5],
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummax", id: 5, pos: 0 },
				[20],
				ctx,
			),
		).toBe(20);

		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummin", id: 6, pos: 0 },
				[10],
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummin", id: 6, pos: 0 },
				[15],
				ctx,
			),
		).toBe(10);
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "cummin", id: 6, pos: 0 },
				[5],
				ctx,
			),
		).toBe(5);

		// unknown func
		expect(
			evaluateRowRelative(
				{ type: "FUNC", value: "unknown_cum", id: 7, pos: 0 },
				[42],
				ctx,
			),
		).toBe(42);
	});
});

describe("evaluateFuncToken stateful variants", () => {
	it("delegates filter function", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		const ctx = { filterState: {} } as unknown as FormulaContext;

		expect(evaluateFuncToken(token("filter"), [10], [], [], 0, ctx)).toBe(10);
		// Without context, should return first argument
		expect(evaluateFuncToken(token("filter"), [10], [], [], 0)).toBe(10);
	});

	it("delegates bucket functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		const ctx = {
			groupSums: {},
			groupCounts: {},
			groupLastKey: {},
		} as unknown as FormulaContext;
		expect(
			evaluateFuncToken(token("avgday"), [10], [0, 1600000000000], [], 1, ctx),
		).toBe(10);
	});

	it("delegates rolling functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
			constN: 2,
		});
		const ctx = { queues: {}, sums: {} } as unknown as FormulaContext;
		expect(evaluateFuncToken(token("rolling"), [10], [], [], 0, ctx)).toBe(10);
	});

	it("delegates row relative functions", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
			constN: 1,
		});
		const ctx = { lagBuffers: {} } as unknown as FormulaContext;
		expect(evaluateFuncToken(token("lag"), [10], [], [], 0, ctx)).toBeNaN();
	});
});

describe("evaluateRowRelative fallback logic for lag", () => {
	it("uses args[1] if constN is not present", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "lag",
			id: 1,
			pos: 0,
		};
		const ctx = { lagBuffers: {} } as unknown as FormulaContext;
		expect(evaluateRowRelative(token, [10, 2], ctx)).toBeNaN();
		expect(evaluateRowRelative(token, [20, 2], ctx)).toBeNaN();
		expect(evaluateRowRelative(token, [30, 2], ctx)).toBe(10);
	});
});

describe("evaluateRowRelative fallback logic for lag part 2", () => {
	it("uses 1 if neither constN nor args[1] is present", () => {
		const token: Extract<Token, { type: "FUNC" }> = {
			type: "FUNC",
			value: "lag",
			id: 1,
			pos: 0,
		};
		const ctx = { lagBuffers: {} } as unknown as FormulaContext;
		expect(evaluateRowRelative(token, [10], ctx)).toBeNaN();
		expect(evaluateRowRelative(token, [20], ctx)).toBe(10);
	});
});

describe("evaluateFuncToken fallback logic", () => {
	it("returns a if not matched by any block", () => {
		const token = (val: string): Extract<Token, { type: "FUNC" }> => ({
			type: "FUNC",
			value: val,
			id: 1,
			pos: 0,
		});
		expect(evaluateFuncToken(token("unknown_entirely"), [99], [], [], 0)).toBe(
			99,
		);
	});
});
