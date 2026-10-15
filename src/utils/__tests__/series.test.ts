import { describe, expect, it } from "vitest";
import { COLOR_PALETTE } from "../../themes";
import type { DataColumn, SeriesConfig } from "../../services/persistence";
import {
	buildSeriesConfig,
	buildSeriesForColumns,
	isDenseSeries,
	pickYAxisId,
} from "../series";

describe("buildSeriesConfig", () => {
	it("returns a SeriesConfig with correct fields", () => {
		const s = buildSeriesConfig("A: Temperature", "ds-1", 0);
		expect(s.sourceId).toBe("ds-1");
		expect(s.yColumn).toBe("A: Temperature");
		expect(s.name).toBe("A: Temperature");
		expect(s.yAxisId).toBe("axis-1");
		expect(s.lineColor).toBe(COLOR_PALETTE[0]);
		expect(s.pointColor).toBe(COLOR_PALETTE[0]);
		expect(s.lineStyle).toBe("solid");
		expect(s.pointStyle).toBe("circle");
		expect(s.hidden).toBe(false);
		expect(typeof s.id).toBe("string");
		expect(s.id.length).toBeGreaterThan(0);
	});

	it("cycles color palette by existingSeriesCount", () => {
		const s0 = buildSeriesConfig("Col", "ds-1", 0);
		const s1 = buildSeriesConfig("Col", "ds-1", 1);
		expect(s0.lineColor).toBe(COLOR_PALETTE[0]);
		expect(s1.lineColor).toBe(COLOR_PALETTE[1]);
	});

	it("uses the given y axis", () => {
		expect(buildSeriesConfig("Col", "ds-1", 3).yAxisId).toBe("axis-1");
		expect(
			buildSeriesConfig("Col", "ds-1", 3, false, { yAxisId: "axis-7" }).yAxisId,
		).toBe("axis-7");
	});

	it("drops markers on dense series but keeps the dash cycle", () => {
		const sparse = buildSeriesConfig("Col", "ds-1", 0, false, {
			pointCount: 400,
		});
		const dense = buildSeriesConfig("Col", "ds-1", 1, false, {
			pointCount: 2000,
		});
		expect(sparse.pointStyle).toBe("circle");
		expect(dense.pointStyle).toBe("none");
		expect(dense.lineStyle).toBe("dashed");
	});

	it("keeps markers on a dense categorical series, which has no line", () => {
		const s = buildSeriesConfig("Col", "ds-1", 3, true, { pointCount: 5000 });
		expect(s.lineStyle).toBe("none");
		expect(s.pointStyle).not.toBe("none");
	});

	it("distinguishes the first twelve series without relying on colour", () => {
		// Colour alone is not a usable cue: cobalt and violet sit at ΔE 6.4
		// under deuteranopia, teal and cyan at ΔE 4.3 under tritanopia. Shape
		// has to carry the identity too, so every one of the twelve
		// combinations of line style and point style must be distinct before
		// any of them repeats.
		const shapes = Array.from({ length: 12 }, (_, i) => {
			const s = buildSeriesConfig("Col", "ds-1", i);
			return `${s.lineStyle}/${s.pointStyle}`;
		});
		expect(new Set(shapes).size).toBe(12);
	});

	it("keeps a categorical series line-free while still varying its points", () => {
		const s = buildSeriesConfig("Col", "ds-1", 1, true);
		expect(s.lineStyle).toBe("none");
		expect(s.pointStyle).not.toBe(
			buildSeriesConfig("Col", "ds-1", 0, true).pointStyle,
		);
	});
});

describe("isDenseSeries", () => {
	it("flags more than one point per 3px of a nominal 1500px plot", () => {
		expect(isDenseSeries(500)).toBe(false);
		expect(isDenseSeries(501)).toBe(true);
	});
});

const axes = (ranges: [number, number][]) =>
	ranges.map(([min, max], i) => ({ id: `axis-${i + 1}`, min, max }));
const on = (...ids: number[]) => ids.map((n) => ({ yAxisId: `axis-${n}` }));

describe("pickYAxisId", () => {
	it("takes the first unused slot, filling gaps", () => {
		expect(pickYAxisId([], [])).toBe("axis-1");
		// The demo puts two series on axis-1 and leaves axis-4 free.
		expect(pickYAxisId(on(1, 1, 2, 3), [])).toBe("axis-4");
		expect(pickYAxisId(on(1, 3), [])).toBe("axis-2");
	});

	it("reuses the axis whose range best overlaps the data once all are used", () => {
		const yAxes = axes([
			[0, 100],
			[0, 10],
			[990, 1030],
			[-5, 5],
			[0, 1],
			[0, 2],
			[0, 3],
			[0, 4],
			[0, 5],
		]);
		const all = on(1, 2, 3, 4, 5, 6, 7, 8, 9);
		expect(pickYAxisId(all, yAxes, { min: 1000, max: 1020 })).toBe("axis-3");
		expect(pickYAxisId(all, yAxes, { min: 10, max: 90 })).toBe("axis-1");
	});

	it("falls back to the least-crowded axis when nothing overlaps", () => {
		const yAxes = axes(Array.from({ length: 9 }, () => [0, 1]));
		const crowded = on(1, 1, 2, 2, 3, 4, 5, 6, 7, 8, 9, 9);
		expect(pickYAxisId(crowded, yAxes, { min: 50, max: 60 })).toBe("axis-3");
		expect(pickYAxisId(crowded, yAxes)).toBe("axis-3");
	});
});

describe("buildSeriesForColumns", () => {
	const col = (min: number, max: number, extra: Partial<DataColumn> = {}) =>
		({
			isFloat64: false,
			refPoint: 0,
			bounds: { min, max },
			data: new Float32Array(0),
			...extra,
		}) as DataColumn;
	const ds = (cols: Record<string, DataColumn>, rowCount = 100) => ({
		id: "ds-1",
		columns: Object.keys(cols),
		data: Object.values(cols),
		rowCount,
	});

	it("puts overlapping columns of similar span on one axis", () => {
		const d = ds({
			TempMin: col(10, 20),
			TempMax: col(15, 30),
			Pressure: col(990, 1030),
			Setpoint: col(18, 18),
		});
		const out = buildSeriesForColumns(d, d.columns, [], []);
		expect(out.map((s) => s.yAxisId)).toEqual([
			"axis-1",
			"axis-1",
			"axis-2",
			"axis-1",
		]);
	});

	it("keeps ranges an order of magnitude apart in span on separate axes", () => {
		const d = ds({ Small: col(0, 1), Large: col(0, 50) });
		const out = buildSeriesForColumns(d, d.columns, [], []);
		expect(out.map((s) => s.yAxisId)).toEqual(["axis-1", "axis-2"]);
	});

	it("never shares an axis between categorical columns", () => {
		const d = ds({
			A: col(0, 2, { categoryLabels: ["a", "b", "c"] }),
			B: col(0, 2, { categoryLabels: ["x", "y", "z"] }),
		});
		const out = buildSeriesForColumns(d, d.columns, [], []);
		expect(out.map((s) => s.yAxisId)).toEqual(["axis-1", "axis-2"]);
	});

	it("continues after existing series and their axes", () => {
		const existing = [
			{ ...buildSeriesConfig("X", "ds-0", 0), yAxisId: "axis-1" },
			{ ...buildSeriesConfig("Y", "ds-0", 1), yAxisId: "axis-3" },
		] as SeriesConfig[];
		const d = ds({ P: col(990, 1030) }, 2000);
		const [s] = buildSeriesForColumns(d, d.columns, existing, []);
		expect(s.yAxisId).toBe("axis-2");
		expect(s.lineColor).toBe(COLOR_PALETTE[2]);
		expect(s.pointStyle).toBe("none");
	});
});
