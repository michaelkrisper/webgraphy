import { describe, expect, it } from "vitest";
import {
	buildReadout,
	DASH,
	formatDuration,
	formatNumber,
	formatRatio,
	formatSlope,
} from "../measureFormat";
import type { Pin, PinPoint } from "../pins";

describe("formatNumber", () => {
	it("rounds to six significant digits and signs deltas", () => {
		expect(formatNumber(1234.56789)).toBe("1,234.57");
		expect(formatNumber(2.5, true)).toBe("+2.5");
		expect(formatNumber(-2.5, true)).toBe("-2.5");
		expect(formatNumber(0, true)).toBe("0");
	});

	it("switches to exponent form for tiny and huge magnitudes", () => {
		expect(formatNumber(0.0000123)).toBe("1.23e-5");
		expect(formatNumber(2e13, true)).toBe("+2e+13");
	});

	it("shows a dash for non-finite values", () => {
		expect(formatNumber(Number.NaN)).toBe(DASH);
		expect(formatNumber(Infinity)).toBe(DASH);
	});
});

describe("formatDuration", () => {
	it("formats sub-second, seconds, minutes, hours and days", () => {
		expect(formatDuration(0.25)).toBe("+250 ms");
		expect(formatDuration(42.5)).toBe("+42.5 s");
		expect(formatDuration(303)).toBe("+5m 03s");
		expect(formatDuration(2 * 3600 + 5 * 60 + 7)).toBe("+2h 05m 07s");
		expect(formatDuration(3 * 86400 + 4 * 3600 + 5 * 60 + 9)).toBe("+3d 04h 05m");
	});

	it("keeps the sign of a backwards span", () => {
		expect(formatDuration(-90)).toBe("-1m 30s");
		expect(formatDuration(0)).toBe("0 ms");
	});
});

describe("formatSlope", () => {
	it("divides on numeric axes", () => {
		expect(formatSlope(10, 4, false)).toBe("+2.5");
		expect(formatSlope(-3, 2, false)).toBe("-1.5");
	});

	it("uses the largest time unit the span covers on date axes", () => {
		expect(formatSlope(6, 3 * 3600, true)).toBe("+2/h");
		expect(formatSlope(1, 30, true)).toBe("+0.0333333/s");
		expect(formatSlope(10, 2 * 86400, true)).toBe("+5/d");
		expect(formatSlope(5, 300, true)).toBe("+1/min");
	});

	it("is undefined for a zero span", () => {
		expect(formatSlope(1, 0, false)).toBe(DASH);
		expect(formatSlope(1, 0, true)).toBe(DASH);
	});
});

describe("formatRatio", () => {
	it("is B / A for positive values only", () => {
		expect(formatRatio(10, 1000)).toBe("×100");
		expect(formatRatio(4, 1)).toBe("×0.25");
		expect(formatRatio(0, 5)).toBe(DASH);
		expect(formatRatio(-1, 5)).toBe(DASH);
	});
});

const point = (over: Partial<PinPoint>): PinPoint => ({
	seriesId: "s1",
	label: "Temp",
	color: "#f00",
	lineStyle: "solid",
	pointStyle: "circle",
	xAxisId: "axis-1",
	yAxisId: "axis-1",
	x: 0,
	y: 0,
	xLabel: "0",
	...over,
});

const pin = (...points: PinPoint[]): Pin => ({
	xAxisId: "axis-1",
	x: points[0]?.x ?? 0,
	points,
});

describe("buildReadout", () => {
	const xAxes = [{ id: "axis-1", xMode: "numeric" as const }];
	const yAxes = [{ id: "axis-1" }, { id: "axis-2", scale: "log" as const }];
	const names = { "axis-1": "Time" };

	it("shows only A values before B is set", () => {
		const r = buildReadout(
			pin(point({ x: 2, y: 5, xLabel: "2" })),
			null,
			xAxes,
			yAxes,
			names,
		);
		expect(r.hasB).toBe(false);
		expect(r.xRows).toEqual([{ xAxisId: "axis-1", name: "Time", a: "2" }]);
		expect(r.seriesRows[0]).toMatchObject({ label: "Temp", a: "5" });
		expect(r.seriesRows[0].delta).toBeUndefined();
	});

	it("computes Δx, Δy and slope per series", () => {
		const r = buildReadout(
			pin(point({ x: 2, y: 5, xLabel: "2" })),
			pin(point({ x: 6, y: 13, xLabel: "6" })),
			xAxes,
			yAxes,
			names,
		);
		expect(r.xRows[0]).toMatchObject({ a: "2", b: "6", delta: "+4" });
		expect(r.seriesRows[0]).toMatchObject({
			a: "5",
			b: "13",
			delta: "+8",
			slope: "+2",
		});
		expect(r.showRatio).toBe(false);
	});

	it("shows durations on date axes", () => {
		const r = buildReadout(
			pin(point({ x: 0, y: 0 })),
			pin(point({ x: 7200, y: 4 })),
			[{ id: "axis-1", xMode: "date" }],
			yAxes,
			names,
		);
		expect(r.xRows[0].delta).toBe("+2h 00m 00s");
		expect(r.seriesRows[0].slope).toBe("+2/h");
	});

	it("adds the ratio on log axes and groups series by y axis", () => {
		const a = pin(
			point({ seriesId: "lin1", y: 1 }),
			point({ seriesId: "log", yAxisId: "axis-2", y: 10 }),
			point({ seriesId: "lin2", y: 2 }),
		);
		const b = pin(
			point({ seriesId: "lin1", x: 1, y: 3 }),
			point({ seriesId: "log", yAxisId: "axis-2", x: 1, y: 1000 }),
			point({ seriesId: "lin2", x: 1, y: 2 }),
		);
		const r = buildReadout(a, b, xAxes, yAxes, names);
		expect(r.seriesRows.map((s) => s.seriesId)).toEqual(["lin1", "lin2", "log"]);
		expect(r.showRatio).toBe(true);
		expect(r.seriesRows[2].ratio).toBe("×100");
		expect(r.seriesRows[0].ratio).toBeUndefined();
	});

	it("leaves deltas empty for a series missing from one pin or categorical", () => {
		const r = buildReadout(
			pin(point({ seriesId: "s1" }), point({ seriesId: "cat", valueLabel: "lo" })),
			pin(
				point({ seriesId: "s2", x: 1 }),
				point({ seriesId: "cat", x: 1, y: 1, valueLabel: "hi" }),
			),
			xAxes,
			yAxes,
			names,
		);
		const byId = Object.fromEntries(r.seriesRows.map((s) => [s.seriesId, s]));
		expect(byId.s1).toMatchObject({ b: DASH });
		expect(byId.s2).toMatchObject({ a: DASH, b: "0" });
		expect(byId.cat).toMatchObject({ a: "lo", b: "hi" });
		for (const id of ["s1", "s2", "cat"]) {
			expect(byId[id].delta).toBeUndefined();
		}
	});
});
