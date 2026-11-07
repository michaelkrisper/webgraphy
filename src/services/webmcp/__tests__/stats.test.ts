import { describe, expect, it } from "vitest";
import { columnStatistics } from "../stats";

const col = (values: number[], refPoint = 0) => ({
	data: new Float32Array(values),
	refPoint,
});

describe("columnStatistics", () => {
	it("skips non-finite values", () => {
		const st = columnStatistics(col([1, Number.NaN, 3, Infinity, 5]));
		expect(st).toEqual({ rows: 5, n: 3, min: 1, max: 5, mean: 3, std: 2 });
	});

	it("keeps precision under a large refPoint", () => {
		const ref = 1_700_000_000;
		const st = columnStatistics(col([0.25, 0.5, 0.75], ref));
		expect(st.mean).toBe(ref + 0.5);
		expect(st.min).toBe(ref + 0.25);
		expect(st.std).toBeCloseTo(0.25, 12);
	});

	it("filters by an unsorted x column, offset by its refPoint", () => {
		const x = col([3, 1, 2, 0, Number.NaN], 100);
		const y = col([30, 10, 20, 0, 99]);
		expect(columnStatistics(y, x, { min: 101, max: 102 })).toMatchObject({
			rows: 2,
			n: 2,
			min: 10,
			max: 20,
		});
	});

	it("reports an empty selection", () => {
		const st = columnStatistics(col([1, 2]), col([0, 1]), { min: 5, max: 6 });
		expect(st.rows).toBe(0);
		expect(st.n).toBe(0);
		expect(st.mean).toBeNaN();
		expect(st.std).toBeNull();
		expect(columnStatistics(col([4])).std).toBeNull();
	});
});
