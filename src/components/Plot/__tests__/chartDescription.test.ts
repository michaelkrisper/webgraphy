import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import { describeChart } from "../chartDescription";

/**
 * This string is the only thing a screen reader gets from the plot, so it is
 * asserted on content rather than on shape.
 */

const series = (over: Partial<SeriesConfig> = {}): SeriesConfig =>
	({
		id: "s1",
		name: "Temperature",
		yColumn: "temp",
		sourceId: "ds-1",
		yAxisId: "axis-1",
		lineColor: "#f00",
		hidden: false,
		...over,
	}) as SeriesConfig;

const dataset = (over: Partial<Dataset> = {}): Dataset =>
	({ id: "ds-1", xAxisId: "axis-1", ...over }) as Dataset;

const xAxis = (over: Partial<XAxisConfig> = {}): XAxisConfig =>
	({
		id: "axis-1",
		name: "Time",
		min: 0,
		max: 100,
		xMode: "numeric",
		...over,
	}) as XAxisConfig;

const yAxis = (over: Partial<YAxisConfig> = {}): YAxisConfig =>
	({ id: "axis-1", name: "Celsius", min: -5, max: 40, ...over }) as YAxisConfig;

const base = {
	series: [series()],
	datasets: [dataset()],
	xAxes: [xAxis()],
	yAxes: [yAxis()],
};

describe("describeChart", () => {
	it("says the chart is empty when nothing is plotted", () => {
		expect(describeChart({ ...base, series: [] })).toBe(
			"Empty chart. No data series are displayed.",
		);
	});

	it("treats a chart of only hidden series as empty", () => {
		expect(
			describeChart({ ...base, series: [series({ hidden: true })] }),
		).toContain("Empty chart");
	});

	it("names the series and both axis ranges", () => {
		const label = describeChart(base);

		expect(label).toContain("1 data series: Temperature.");
		expect(label).toContain("Time from 0 to 100.");
		expect(label).toContain("Celsius from -5 to 40.");
	});

	it("excludes hidden series from the list", () => {
		const label = describeChart({
			...base,
			series: [series(), series({ id: "s2", name: "Humidity", hidden: true })],
		});

		expect(label).toContain("Temperature");
		expect(label).not.toContain("Humidity");
	});

	it("falls back to the column name for an unnamed series", () => {
		const label = describeChart({
			...base,
			series: [series({ name: "", yColumn: "raw_value" })],
		});
		expect(label).toContain("raw_value");
	});

	it("switches to a count once there are many series", () => {
		const many = Array.from({ length: 9 }, (_, i) =>
			series({ id: `s${i}`, name: `Series ${i}` }),
		);
		const label = describeChart({ ...base, series: many });

		expect(label).toContain("9 data series, including");
		expect(label).toContain("Series 0");
		// The tail is summarised rather than read out in full.
		expect(label).not.toContain("Series 8");
	});

	it("only mentions axes that carry a visible series", () => {
		const label = describeChart({
			...base,
			xAxes: [xAxis(), xAxis({ id: "axis-2", name: "Distance" })],
			yAxes: [yAxis(), yAxis({ id: "axis-2", name: "Percent" })],
		});

		expect(label).toContain("Time");
		expect(label).not.toContain("Distance");
		expect(label).not.toContain("Percent");
	});

	it("resolves the x axis through the series' dataset", () => {
		// The series does not reference an x axis itself — its dataset does.
		const label = describeChart({
			...base,
			datasets: [dataset({ xAxisId: "axis-2" })],
			xAxes: [xAxis(), xAxis({ id: "axis-2", name: "Distance" })],
		});

		expect(label).toContain("Distance");
		expect(label).not.toContain("Time");
	});

	it("formats a date axis as a date", () => {
		const t0 = Math.floor(new Date(2026, 0, 1).getTime() / 1000);
		const label = describeChart({
			...base,
			xAxes: [xAxis({ xMode: "date", min: t0, max: t0 + 86400 })],
		});

		// A raw epoch second count would be useless read aloud.
		expect(label).not.toContain(String(t0));
	});

	it("names an unlabelled axis by orientation", () => {
		const label = describeChart({
			...base,
			xAxes: [xAxis({ name: "" })],
			yAxes: [yAxis({ name: "" })],
		});

		expect(label).toContain("Horizontal axis from");
		expect(label).toContain("Vertical axis from");
	});

	it("reports a non-finite bound instead of announcing Infinity", () => {
		const label = describeChart({
			...base,
			yAxes: [yAxis({ min: Number.NEGATIVE_INFINITY, max: Number.NaN })],
		});

		expect(label).toContain("from unknown to unknown");
		expect(label).not.toContain("Infinity");
		expect(label).not.toContain("NaN");
	});

	it("keeps long floats short", () => {
		const label = describeChart({
			...base,
			yAxes: [yAxis({ min: 0.123456789012, max: 1234.56789012 })],
		});

		expect(label).not.toContain("0.123456789012");
		expect(label).toContain("0.123457");
	});

	it("does not round a narrow axis away to zero", () => {
		// toLocaleString defaults to three fraction digits, which would turn a
		// microscopic range into "0 to 0" and make the label useless.
		const label = describeChart({
			...base,
			yAxes: [yAxis({ min: 0.000123, max: 0.000456 })],
		});

		expect(label).toContain("0.000123");
		expect(label).toContain("0.000456");
	});
});
