import { describe, expect, it } from "vitest";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { fitForNewSeries } from "../newSeriesFit";

const col = (min: number, max: number) => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min, max },
	data: new Float32Array(0),
});

const weather: Dataset = {
	id: "weather",
	name: "weather",
	columns: ["t", "temp", "hum"],
	data: [col(0, 1000), col(-5, 30), col(20, 100)],
	rowCount: 10,
	xAxisColumn: "t",
	xAxisId: "axis-1",
};
const pressure: Dataset = {
	id: "pressure",
	name: "pressure",
	columns: ["time", "p"],
	data: [col(5000, 6000), col(1000, 1020)],
	rowCount: 10,
	xAxisColumn: "time",
	xAxisId: "axis-2",
};
const byId = new Map([
	[weather.id, weather],
	[pressure.id, pressure],
]);

const series = (
	id: string,
	sourceId: string,
	yColumn: string,
	yAxisId: string,
): SeriesConfig => ({
	id,
	sourceId,
	yColumn,
	yAxisId,
	name: yColumn,
	pointStyle: "none",
	pointColor: "#000",
	lineStyle: "solid",
	lineColor: "#000",
});

const yAxes = Array.from({ length: 9 }, (_, i) => ({
	id: `axis-${i + 1}`,
	min: 0,
	max: 100,
}));

describe("fitForNewSeries", () => {
	const temp = series("s1", "weather", "temp", "axis-1");

	it("does nothing when no series was added or rebound", () => {
		expect(fitForNewSeries([temp], [temp], byId, yAxes)).toEqual({
			x: {},
			y: {},
		});
		expect(fitForNewSeries([temp], [], byId, yAxes)).toEqual({ x: {}, y: {} });
	});

	it("fits the fresh y axis and fresh x axis of a series added to a non-empty chart", () => {
		const p = series("s2", "pressure", "p", "axis-5");
		const { x, y } = fitForNewSeries([temp], [temp, p], byId, yAxes);
		// 1000..1020 padded by 5% of the span (1) each side.
		expect(y).toEqual({ "axis-5": { min: 999, max: 1021 } });
		expect(x).toEqual({ "axis-2": { min: 4950, max: 6050 } });
	});

	it("fits every new series of a multi-column import, not only the last", () => {
		const hum = series("s2", "weather", "hum", "axis-2");
		const p = series("s3", "pressure", "p", "axis-3");
		const { y } = fitForNewSeries([temp], [temp, hum, p], byId, yAxes);
		expect(Object.keys(y).sort()).toEqual(["axis-2", "axis-3"]);
	});

	it("leaves an in-use axis alone when the new data is already in view", () => {
		const zoomed = yAxes.map((a) =>
			a.id === "axis-1" ? { ...a, min: 10, max: 20 } : a,
		);
		const hum = series("s2", "weather", "hum", "axis-1");
		const { x, y } = fitForNewSeries([temp], [temp, hum], byId, zoomed);
		expect(y).toEqual({});
		// The dataset's x axis was already in use: also untouched.
		expect(x).toEqual({});
	});

	it("widens an unzoomed in-use axis so partly clipped new data fits", () => {
		const fitted = yAxes.map((a) =>
			a.id === "axis-1" ? { ...a, min: -10, max: 40 } : a,
		);
		const hum = series("s2", "weather", "hum", "axis-1");
		const { y } = fitForNewSeries([temp], [temp, hum], byId, fitted);
		expect(y).toEqual({ "axis-1": { min: -10, max: 104 } });
	});

	it("keeps a zoomed in-use axis when new data is only partly clipped", () => {
		const zoomed = yAxes.map((a) =>
			a.id === "axis-1" ? { ...a, min: 0, max: 25 } : a,
		);
		const hum = series("s2", "weather", "hum", "axis-1");
		const { y } = fitForNewSeries([temp], [temp, hum], byId, zoomed);
		expect(y).toEqual({});
	});

	it("widens an in-use axis only as far as needed when the new data is off-screen", () => {
		const p = series("s2", "pressure", "p", "axis-1");
		const { y } = fitForNewSeries([temp], [temp, p], byId, yAxes);
		expect(y).toEqual({ "axis-1": { min: 0, max: 1021 } });
	});

	it("fits an axis freed by a dataset removed in the same step", () => {
		// The demo is replaced: its series are still in prev, its dataset is gone.
		const onlyPressure = new Map([[pressure.id, pressure]]);
		const p = series("s2", "pressure", "p", "axis-1");
		const { y } = fitForNewSeries([temp], [p], onlyPressure, yAxes);
		expect(y).toEqual({ "axis-1": { min: 999, max: 1021 } });
	});

	it("pads a log axis in scale space and ignores non-positive values", () => {
		const logCol = (values: number[]) => ({
			isFloat64: false,
			refPoint: 0,
			bounds: { min: Math.min(...values), max: Math.max(...values) },
			data: new Float32Array(values),
		});
		const ds: Dataset = {
			id: "lg",
			name: "lg",
			columns: ["t", "a", "b"],
			data: [logCol([0, 1, 2]), logCol([1, 10, 1000]), logCol([-3, 2, 5000])],
			rowCount: 3,
			xAxisColumn: "t",
			xAxisId: "axis-1",
		};
		const a = series("a", "lg", "a", "axis-3");
		const b = series("b", "lg", "b", "axis-3");
		const logAxes = yAxes.map((ax) =>
			ax.id === "axis-3"
				? { ...ax, min: 0.8, max: 1200, scale: "log" as const }
				: ax,
		);
		const { y } = fitForNewSeries([a], [a, b], new Map([[ds.id, ds]]), logAxes);
		expect(y["axis-3"].min).toBe(0.8);
		expect(y["axis-3"].max).toBeGreaterThan(5000);

		const fresh = fitForNewSeries([], [b], new Map([[ds.id, ds]]), logAxes).y[
			"axis-3"
		];
		expect(fresh.min).toBeGreaterThan(0);
		expect(fresh.min).toBeLessThan(2);
	});

	it("refits the axis of a series rebound to another column", () => {
		const rebound = { ...temp, yColumn: "hum" };
		const { y } = fitForNewSeries([temp], [rebound], byId, yAxes);
		expect(y).toEqual({ "axis-1": { min: 16, max: 104 } });
	});
});
