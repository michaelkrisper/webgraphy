import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../../services/persistence";
import { buildStatsRows, visibleColumnStats } from "../visibleStats";

const f32 = (v: number[]) => Float32Array.from(v);

/** Reference: two-pass sample statistics in float64. */
function reference(values: number[]) {
	const n = values.length;
	const mean = values.reduce((s, v) => s + v, 0) / n;
	const variance =
		n > 1 ? values.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
	return {
		n,
		min: Math.min(...values),
		max: Math.max(...values),
		mean,
		std: Math.sqrt(variance),
	};
}

describe("visibleColumnStats", () => {
	it("covers only the samples inside the x range (sorted x)", () => {
		const x = f32([0, 1, 2, 3, 4, 5]);
		const y = f32([10, 2, 4, 4, 6, 100]);
		const s = visibleColumnStats(x, 0, y, 0, 1, 4);
		const ref = reference([2, 4, 4, 6]);
		expect(s?.n).toBe(4);
		expect(s?.min).toBe(2);
		expect(s?.max).toBe(6);
		expect(s?.mean).toBeCloseTo(ref.mean, 12);
		expect(s?.std).toBeCloseTo(ref.std, 12);
	});

	it("scans unsorted x linearly", () => {
		const x = f32([5, 1, 3, 0, 2]);
		const y = f32([50, 10, 30, 0, 20]);
		const s = visibleColumnStats(x, 0, y, 0, 1, 3);
		expect(s).toMatchObject({ n: 3, min: 10, max: 30, mean: 20 });
		expect(s?.std).toBeCloseTo(10, 12);
	});

	it("skips NaN y values and NaN x positions", () => {
		const x = f32([0, 1, Number.NaN, 3]);
		const y = f32([1, Number.NaN, 100, 3]);
		const s = visibleColumnStats(x, 0, y, 0, 0, 3);
		expect(s).toMatchObject({ n: 2, min: 1, max: 3, mean: 2 });
	});

	it("keeps the precision of offset (refPoint) columns", () => {
		// Float32 cannot hold 1.7e9 + 0.25 steps; the offsets can.
		const refX = 1_700_000_000;
		const refY = 1_000_000_000;
		const x = f32([0, 10, 20, 30]);
		const y = f32([0.25, 0.5, 0.75, 1]);
		const s = visibleColumnStats(x, refX, y, refY, refX + 10, refX + 30);
		expect(s?.n).toBe(3);
		expect(s?.min).toBe(refY + 0.5);
		expect(s?.max).toBe(refY + 1);
		expect(s?.mean).toBe(refY + 0.75);
		expect(s?.std).toBeCloseTo(0.25, 12);
	});

	it("counts only positive values on a log y axis", () => {
		const x = f32([1, 10, 100, 1000]);
		const y = f32([-1, 0, 10, 1000]);
		expect(visibleColumnStats(x, 0, y, 0, 1, 1000, true)).toMatchObject({
			n: 2,
			min: 10,
			max: 1000,
		});
		expect(visibleColumnStats(x, 0, y, 0, 1, 1000)?.n).toBe(4);
	});

	it("respects a log x range given in data units", () => {
		const x = f32([1, 10, 100, 1000]);
		const y = f32([1, 2, 3, 4]);
		expect(visibleColumnStats(x, 0, y, 0, 5, 200)).toMatchObject({
			n: 2,
			min: 2,
			max: 3,
		});
	});

	it("returns null when nothing is visible, and std 0 for one sample", () => {
		const x = f32([0, 1, 2]);
		const y = f32([5, 6, 7]);
		expect(visibleColumnStats(x, 0, y, 0, 10, 20)).toBeNull();
		expect(visibleColumnStats(x, 0, y, 0, 1, 1)).toMatchObject({ n: 1, std: 0 });
	});
});

describe("buildStatsRows", () => {
	const ds = {
		id: "ds-1",
		xAxisId: "axis-1",
		xAxisColumn: "t",
		columns: ["t", "v", "c"],
		data: [
			{ data: f32([0, 1, 2, 3]), refPoint: 0 },
			{ data: f32([1, 2, 3, 4]), refPoint: 0 },
			{ data: f32([0, 1, 0, 1]), refPoint: 0, categoryLabels: ["lo", "hi"] },
		],
	} as unknown as Dataset;
	const s = (id: string, yColumn: string, hidden = false) =>
		({
			id,
			sourceId: "ds-1",
			yColumn,
			name: id,
			yAxisId: "axis-1",
			lineColor: "#f00",
			lineStyle: "solid",
			hidden,
		}) as SeriesConfig;
	const xAxes = [{ id: "axis-1", min: 1, max: 2 } as XAxisConfig];
	const yAxes = [{ id: "axis-1", min: 0, max: 10 } as YAxisConfig];

	it("lists visible series over their x axis range", () => {
		const rows = buildStatsRows(
			[s("v", "v"), s("hidden", "v", true), s("cat", "c")],
			[ds],
			xAxes,
			yAxes,
		);
		expect(rows.map((r) => r.seriesId)).toEqual(["v", "cat"]);
		expect(rows[0].stats).toMatchObject({ n: 2, min: 2, max: 3, mean: 2.5 });
		expect(rows[0].categorical).toBe(false);
		expect(rows[1].categorical).toBe(true);
	});
});
