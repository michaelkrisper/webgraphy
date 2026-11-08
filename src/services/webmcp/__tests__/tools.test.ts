import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearHistory,
	useGraphHistory,
	useGraphStore,
} from "../../../store/useGraphStore";
import { useNotificationStore } from "../../../store/useNotificationStore";
import { registerViewportCommands } from "../../../utils/viewportCommands";
import * as formulaClient from "../../../workers/formulaClient";
import type { Dataset, SeriesConfig } from "../../persistence";
import { createTools } from "../tools";

vi.mock("../../persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		clearAppState: vi.fn().mockResolvedValue(undefined),
	},
}));

const T0 = 1_700_000_000;
// A value in the middle of a column: no read tool may ever return it.
const SENTINEL = 13.375;

const sensor = (): Dataset => ({
	id: "ds-1",
	name: "Sensor",
	columns: ["Time", "Temp", "Flow", "Mode", "Empty"],
	data: [
		{
			isFloat64: true,
			refPoint: T0,
			bounds: { min: T0, max: T0 + 240 },
			data: new Float32Array([0, 60, 120, 180, 240]),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 10, max: 18 },
			data: new Float32Array([10, SENTINEL, Number.NaN, 16, 18]),
		},
		{
			isFloat64: false,
			refPoint: 1000,
			bounds: { min: 1001, max: 1005 },
			data: new Float32Array([1, 2, 3, 4, 5]),
			formula: "[Temp] + 1000",
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 1 },
			data: new Float32Array([0, 1, 0, 1, 0]),
			categoryLabels: ["on", "off"],
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: Infinity, max: -Infinity },
			data: new Float32Array(5).fill(Number.NaN),
		},
	],
	rowCount: 5,
	xAxisColumn: "Time",
	xAxisId: "axis-1",
});

const lab = (id = "ds-2", name = "Lab"): Dataset => ({
	id,
	name,
	columns: ["x", "y"],
	data: [
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 3 },
			data: new Float32Array([0, 1, 2, 3]),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 1, max: 8 },
			data: new Float32Array([1, 2, 4, 8]),
		},
	],
	rowCount: 4,
	xAxisColumn: "x",
	xAxisId: "axis-2",
});

const series = (
	id: string,
	yColumn: string,
	yAxisId = "axis-1",
	sourceId = "ds-1",
): SeriesConfig => ({
	id,
	sourceId,
	name: yColumn,
	yColumn,
	yAxisId,
	pointStyle: "circle",
	pointColor: "#ff0000",
	lineStyle: "solid",
	lineColor: "#ff0000",
	hidden: false,
});

const axes = () => ({
	xAxes: Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: "",
		min: i === 0 ? T0 : 0,
		max: i === 0 ? T0 + 240 : 3,
		showGrid: i === 0,
		xMode: i === 0 ? ("date" as const) : ("numeric" as const),
		scale: "linear" as const,
	})),
	yAxes: Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: `Axis ${i + 1}`,
		min: 0,
		max: 20,
		position: i % 2 === 0 ? ("left" as const) : ("right" as const),
		color: "#475569",
		showGrid: i === 0,
		scale: "linear" as const,
	})),
});

const tools = createTools();
const actions = (({ undo, addCalculatedColumn }) => ({
	undo,
	addCalculatedColumn,
}))(useGraphStore.getState());
const call = (name: string, input?: unknown) => {
	const tool = tools.find((t) => t.name === name);
	if (!tool) throw new Error(`no tool ${name}`);
	return tool.execute(input);
};
const textOf = async (name: string, input?: unknown) =>
	(await call(name, input)).content[0].text;
const jsonOf = async (name: string, input?: unknown) =>
	JSON.parse(await textOf(name, input));
const store = () => useGraphStore.getState();
const toasts = () => useNotificationStore.getState().notifications;

const expectError = async (name: string, input: unknown, match: RegExp) => {
	const result = await call(name, input);
	expect(result.isError).toBe(true);
	expect(result.content[0].text).toMatch(/^Error: /);
	expect(result.content[0].text).toMatch(match);
};

let unmountChart: (() => void) | null = null;
const mountChart = () => {
	const commands = { applyRange: vi.fn(), fitAll: vi.fn() };
	unmountChart = registerViewportCommands(commands);
	return commands;
};

beforeEach(() => {
	useGraphStore.setState({
		datasets: [sensor(), lab()],
		series: [series("s-temp", "Temp"), series("s-y", "y", "axis-2", "ds-2")],
		...axes(),
		legendVisible: true,
		crosshairVisible: true,
		isLoaded: true,
	});
	clearHistory();
	useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
	useGraphStore.setState(actions);
	unmountChart?.();
	unmountChart = null;
	vi.restoreAllMocks();
});

describe("tool definitions", () => {
	it("are snake_case with strict object schemas", () => {
		expect(tools.map((t) => t.name)).toEqual([
			"get_workspace",
			"get_column_statistics",
			"list_formula_functions",
			"plot_column",
			"remove_series",
			"set_series_style",
			"set_axis",
			"fit_all",
			"add_calculated_column",
			"undo",
			"redo",
		]);
		for (const t of tools) {
			expect(t.name).toMatch(/^[a-z]+(_[a-z]+)*$/);
			expect(t.description.length).toBeGreaterThan(40);
			expect(t.inputSchema).toMatchObject({
				type: "object",
				additionalProperties: false,
			});
		}
	});

	it("mark exactly the read-only tools and state the privacy rule", () => {
		const readOnly = tools
			.filter((t) => t.annotations?.readOnlyHint)
			.map((t) => t.name);
		expect(readOnly).toEqual([
			"get_workspace",
			"get_column_statistics",
			"list_formula_functions",
		]);
		for (const name of ["get_workspace", "get_column_statistics"]) {
			const t = tools.find((x) => x.name === name);
			expect(t?.description).toMatch(/never individual row values/);
			expect(t?.annotations?.untrustedContentHint).toBe(true);
		}
		expect(
			tools.find((x) => x.name === "get_column_statistics")?.description,
		).toMatch(/must hold at least 5 values/);
	});
});

describe("input validation", () => {
	it("rejects unknown properties, missing and mistyped arguments", async () => {
		await expectError("get_workspace", { verbose: true }, /takes no input/);
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Temp", axis: 2 },
			/Unknown property "axis". Allowed: dataset, column, yAxis/,
		);
		await expectError(
			"plot_column",
			{ dataset: "ds-1" },
			/Missing required property "column"/,
		);
		await expectError(
			"plot_column",
			{ dataset: 7, column: "Temp" },
			/"dataset" must be a string/,
		);
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Flow", yAxis: 10 },
			/"yAxis" must be an integer from 1 to 9 or one of "new"/,
		);
		await expectError("plot_column", "Temp", /must be a JSON object/);
	});

	it("refuses to run before the workspace has loaded", async () => {
		useGraphStore.setState({ isLoaded: false });
		await expectError("get_workspace", {}, /still loading/);
	});

	it("turns unexpected exceptions into error text", async () => {
		await call("plot_column", { dataset: "ds-1", column: "Flow" });
		useGraphStore.setState({
			undo: () => {
				throw new Error("boom");
			},
		});
		await expectError("undo", {}, /boom/);
		useGraphStore.setState({
			undo: () => {
				throw "kaput";
			},
		});
		await expectError("undo", undefined, /kaput/);
	});
});

describe("get_workspace", () => {
	it("describes datasets, series and the axes in use", async () => {
		store().setLegendVisible(false);
		const ws = await jsonOf("get_workspace", {});
		expect(ws.summary).toMatch(/2 dataset\(s\), 2 series\./);
		expect(ws.datasets).toHaveLength(2);
		const [ds] = ws.datasets;
		expect(ds).toMatchObject({
			id: "ds-1",
			name: "Sensor",
			rows: 5,
			xColumn: "Time",
			xAxis: 1,
		});
		expect(ds.columns).toEqual([
			{
				name: "Time",
				kind: "date",
				min: T0,
				max: T0 + 240,
				minDate: new Date(T0 * 1000).toISOString(),
				maxDate: new Date((T0 + 240) * 1000).toISOString(),
			},
			{ name: "Temp", kind: "numeric", min: 10, max: 18 },
			{
				name: "Flow",
				kind: "numeric",
				min: 1001,
				max: 1005,
				formula: "[Temp] + 1000",
			},
			{ name: "Mode", kind: "categorical", categories: 2 },
			{ name: "Empty", kind: "numeric", min: null, max: null },
		]);
		expect(ws.series[0]).toEqual({
			id: "s-temp",
			name: "Temp",
			dataset: "ds-1",
			column: "Temp",
			yAxis: 1,
			color: "#ff0000",
			lineStyle: "solid",
			pointStyle: "circle",
			visible: true,
		});
		expect(ws.xAxes.map((a: { slot: number }) => a.slot)).toEqual([1, 2]);
		expect(ws.xAxes[0]).toMatchObject({
			title: "Time",
			mode: "date",
			scale: "linear",
			datasets: ["ds-1"],
			minDate: new Date(T0 * 1000).toISOString(),
		});
		expect(ws.yAxes).toEqual([
			{
				slot: 1,
				title: "Temp",
				min: 0,
				max: 20,
				scale: "linear",
				side: "left",
				series: ["s-temp"],
			},
			{
				slot: 2,
				title: "y",
				min: 0,
				max: 20,
				scale: "linear",
				side: "right",
				series: ["s-y"],
			},
		]);
		expect(ws.freeYAxisSlots).toEqual([3, 4, 5, 6, 7, 8, 9]);
		expect(ws.undo).toBe("hide legend");
		expect(ws.redo).toBeNull();
	});

	it("reports a differing point color and a hidden series", async () => {
		useGraphStore.setState({
			series: [{ ...series("s1", "Temp"), pointColor: "#00ff00", hidden: true }],
		});
		const ws = await jsonOf("get_workspace");
		expect(ws.series[0]).toMatchObject({ pointColor: "#00ff00", visible: false });
	});

	it("never returns a row value", async () => {
		const outputs = await Promise.all([
			textOf("get_workspace", {}),
			textOf("get_column_statistics", { dataset: "ds-1", column: "Temp" }),
			textOf("get_column_statistics", { dataset: "ds-1", column: "Mode" }),
		]);
		for (const out of outputs) {
			expect(out).not.toContain(String(SENTINEL));
			expect(out).not.toMatch(/"on"|"off"/);
		}
	});
});

describe("get_column_statistics", () => {
	it("computes n, missing, min, max, mean and sample std", async () => {
		const st = await jsonOf("get_column_statistics", {
			dataset: "Sensor",
			column: "Temp",
		});
		const values = [10, SENTINEL, 16, 18];
		const mean = values.reduce((a, b) => a + b) / 4;
		const std = Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / 3);
		expect(st).toMatchObject({
			dataset: "Sensor",
			column: "Temp",
			kind: "numeric",
			xRange: "all rows",
			rows: 5,
			n: 4,
			missing: 1,
			min: 10,
			max: 18,
		});
		expect(st.mean).toBeCloseTo(mean, 9);
		expect(st.std).toBeCloseTo(std, 9);
	});

	it("adds the column's refPoint offset", async () => {
		const st = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Flow",
		});
		expect(st).toMatchObject({ min: 1001, max: 1005, mean: 1003 });
		expect(st.std).toBeCloseTo(Math.sqrt(2.5), 9);
	});

	it("restricts to an X range given as dates or epoch seconds", async () => {
		const ramp: Dataset = {
			id: "ds-3",
			name: "Ramp",
			columns: ["t", "v"],
			data: [
				{
					isFloat64: true,
					refPoint: T0,
					bounds: { min: T0, max: T0 + 540 },
					data: Float32Array.from({ length: 10 }, (_, i) => i * 60),
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 9 },
					data: Float32Array.from({ length: 10 }, (_, i) => i),
				},
			],
			rowCount: 10,
			xAxisColumn: "t",
			xAxisId: "axis-3",
		};
		useGraphStore.setState({ datasets: [sensor(), lab(), ramp] });
		const byDate = await jsonOf("get_column_statistics", {
			dataset: "ds-3",
			column: "v",
			xMin: new Date((T0 + 60) * 1000).toISOString(),
			xMax: T0 + 300,
		});
		expect(byDate).toMatchObject({ rows: 5, n: 5, min: 1, max: 5, mean: 3 });
		expect(byDate.xRange.minDate).toBe(new Date((T0 + 60) * 1000).toISOString());

		const open = await jsonOf("get_column_statistics", {
			dataset: "ds-3",
			column: "v",
			xMin: T0 + 240,
		});
		expect(open).toMatchObject({ rows: 6, n: 6, min: 4, max: 9 });
		expect(open.xRange).toMatchObject({ min: T0 + 240, max: null });
	});

	it("gives only counts over an X range of fewer than 5 values", async () => {
		// One row: min = max = mean would be that row's value.
		const one = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Temp",
			xMin: T0 + 60,
			xMax: T0 + 60,
		});
		expect(one).toMatchObject({ rows: 1, n: 1, missing: 0 });
		expect(one.note).toMatch(/Fewer than 5 values/);
		for (const key of ["min", "max", "mean", "std"]) {
			expect(one).not.toHaveProperty(key);
		}
		expect(JSON.stringify(one)).not.toContain(String(SENTINEL));

		// It counts values, not rows: five rows, but one of them is missing.
		const four = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Temp",
			xMin: T0,
		});
		expect(four).toMatchObject({ rows: 5, n: 4, missing: 1 });
		expect(four).not.toHaveProperty("mean");
	});

	it("reports date statistics as dates too", async () => {
		const st = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Time",
		});
		expect(st).toMatchObject({ kind: "date", mean: T0 + 120 });
		expect(st.meanDate).toBe(new Date((T0 + 120) * 1000).toISOString());
	});

	it("gives counts only for categorical and empty columns", async () => {
		const cat = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Mode",
		});
		expect(cat).toMatchObject({ kind: "categorical", categories: 2, n: 5 });
		expect(cat).not.toHaveProperty("mean");
		const empty = await jsonOf("get_column_statistics", {
			dataset: "ds-1",
			column: "Empty",
		});
		expect(empty).toMatchObject({
			n: 0,
			missing: 5,
			min: null,
			mean: null,
			std: null,
		});
	});

	it("explains bad references and bounds", async () => {
		await expectError(
			"get_column_statistics",
			{ dataset: "nope", column: "Temp" },
			/No dataset "nope". Datasets: "Sensor" \(id ds-1\), "Lab" \(id ds-2\)/,
		);
		await expectError(
			"get_column_statistics",
			{ dataset: "ds-1", column: "Pressure" },
			/no column "Pressure". Columns: Time, Temp, Flow, Mode, Empty/,
		);
		await expectError(
			"get_column_statistics",
			{ dataset: "ds-1", column: "Temp", xMin: "yesterday" },
			/epoch seconds or a date string; got "yesterday"/,
		);
		await expectError(
			"get_column_statistics",
			{ dataset: "ds-2", column: "y", xMax: "abc" },
			/must be numbers/,
		);
		await expectError(
			"get_column_statistics",
			{ dataset: "ds-2", column: "y", xMin: 3, xMax: 1 },
			/xMin must not be greater than xMax/,
		);
	});

	it("resolves unique dataset names and refuses ambiguous ones", async () => {
		useGraphStore.setState({ datasets: [lab("a"), lab("b")] });
		await expectError(
			"get_column_statistics",
			{ dataset: "Lab", column: "y" },
			/Several datasets are named "Lab"; pass the id instead: a, b/,
		);
		useGraphStore.setState({ datasets: [] });
		await expectError(
			"get_column_statistics",
			{ dataset: "Lab", column: "y" },
			/no datasets/,
		);
	});
});

describe("list_formula_functions", () => {
	it("lists syntax, functions and constants, optionally by category", async () => {
		const all = await jsonOf("list_formula_functions", {});
		expect(all.syntax.join(" ")).toMatch(/\[Temperature\]/);
		expect(all.functions.length).toBeGreaterThan(30);
		expect(all.functions[0]).toEqual({
			signature: "sqrt(x)",
			description: "Square root",
			category: "math",
			example: "sqrt([dist]^2)",
		});
		expect(all.constants.map((c: { name: string }) => c.name)).toEqual([
			"pi",
			"e",
		]);

		const reg = await jsonOf("list_formula_functions", {
			category: "regression",
		});
		expect(
			reg.functions.every(
				(f: { category: string }) => f.category === "regression",
			),
		).toBe(true);
		expect(reg.functions.length).toBeGreaterThan(0);
		await expectError(
			"list_formula_functions",
			{ category: "magic" },
			/must be one of/,
		);
	});
});

describe("plot_column", () => {
	it("plots on the first free Y axis, undoably, with a toast", async () => {
		const out = await jsonOf("plot_column", { dataset: "ds-1", column: "Flow" });
		expect(out.message).toBe('Plotted "Flow" from "Sensor" on Y axis 3.');
		const added = store().series.at(-1);
		expect(added).toMatchObject({
			sourceId: "ds-1",
			yColumn: "Flow",
			yAxisId: "axis-3",
		});
		expect(out.series.id).toBe(added?.id);
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe(
			"add series 'Flow'",
		);

		const toast = toasts()[0];
		expect(toast.message).toBe("AI agent: add series 'Flow'");
		toast.action?.onAction();
		expect(store().series).toHaveLength(2);
	});

	it('honours an explicit slot and "new"', async () => {
		await call("plot_column", { dataset: "ds-1", column: "Flow", yAxis: 1 });
		expect(store().series.at(-1)?.yAxisId).toBe("axis-1");
		await call("plot_column", { dataset: "ds-1", column: "Flow", yAxis: "new" });
		expect(store().series.at(-1)?.yAxisId).toBe("axis-3");
	});

	it("draws categorical columns as points", async () => {
		await call("plot_column", { dataset: "ds-1", column: "Mode" });
		expect(store().series.at(-1)).toMatchObject({ lineStyle: "none" });
		expect(store().series.at(-1)?.pointStyle).not.toBe("none");
	});

	it("refuses the X column, duplicates and a full set of axes", async () => {
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Time" },
			/is the X column/,
		);
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Temp" },
			/already plotted on Y axis 1 as series s-temp/,
		);
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Temp", yAxis: 1 },
			/already plotted/,
		);
		useGraphStore.setState({
			series: Array.from({ length: 9 }, (_, i) =>
				series(`s${i}`, "Temp", `axis-${i + 1}`),
			),
		});
		await expectError(
			"plot_column",
			{ dataset: "ds-1", column: "Flow", yAxis: "new" },
			/All nine Y axes are in use/,
		);
		expect(store().series).toHaveLength(9);
	});
});

describe("remove_series", () => {
	it("removes by id or unique name", async () => {
		expect(await textOf("remove_series", { series: "s-temp" })).toBe(
			'Removed series "Temp".',
		);
		await call("remove_series", { series: "y" });
		expect(store().series).toHaveLength(0);
		expect(toasts().at(-1)?.message).toMatch(/^AI agent: delete series/);
		await expectError("remove_series", { series: "y" }, /Nothing is plotted/);
	});

	it("explains unknown and ambiguous series", async () => {
		await expectError(
			"remove_series",
			{ series: "nope" },
			/No series "nope". Series: "Temp" \(id s-temp\), "y" \(id s-y\)/,
		);
		useGraphStore.setState({
			series: [series("a", "Temp"), series("b", "Temp", "axis-2")],
		});
		await expectError(
			"remove_series",
			{ series: "Temp" },
			/pass the id instead: a, b/,
		);
	});
});

describe("set_series_style", () => {
	it("sets color, line and point style as one step", async () => {
		const out = await jsonOf("set_series_style", {
			series: "s-temp",
			color: "#AbC",
			lineStyle: "dashed",
			pointStyle: "none",
		});
		expect(out.series).toMatchObject({
			color: "#aabbcc",
			lineStyle: "dashed",
			pointStyle: "none",
		});
		expect(store().series[0]).toMatchObject({
			lineColor: "#aabbcc",
			pointColor: "#aabbcc",
		});
		expect(useGraphHistory.getState().past).toHaveLength(1);
	});

	it("hides and shows, folding a restyle into the same step", async () => {
		await call("set_series_style", { series: "s-temp", visible: false });
		expect(store().series[0].hidden).toBe(true);
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe(
			"hide series 'Temp'",
		);

		await call("set_series_style", {
			series: "s-temp",
			visible: true,
			color: "#123456",
		});
		expect(store().series[0]).toMatchObject({
			hidden: false,
			lineColor: "#123456",
		});
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe(
			"restyle series 'Temp'",
		);

		// Already visible: no visibility step is recorded.
		const n = useGraphHistory.getState().past.length;
		await call("set_series_style", { series: "s-temp", visible: true });
		expect(useGraphHistory.getState().past).toHaveLength(n);
	});

	it("refuses an empty change, an invisible style and bad colors", async () => {
		await expectError(
			"set_series_style",
			{ series: "s-temp" },
			/at least one of/,
		);
		await expectError(
			"set_series_style",
			{ series: "s-temp", lineStyle: "none", pointStyle: "none" },
			/cannot both be "none"/,
		);
		await expectError(
			"set_series_style",
			{ series: "s-temp", color: "red" },
			/"color" has an invalid format: Hex color/,
		);
		await expectError(
			"set_series_style",
			{ series: "s-temp", lineWidth: 3 },
			/Unknown property "lineWidth"/,
		);
	});
});

describe("set_axis", () => {
	it("sets a range through the mounted chart", async () => {
		const chart = mountChart();
		await call("set_axis", { axis: "y", slot: 1, min: -5, max: "25" });
		expect(chart.applyRange).toHaveBeenCalledWith("y", "axis-1", {
			min: -5,
			max: 25,
		});

		await call("set_axis", {
			axis: "x",
			slot: 1,
			min: new Date((T0 + 20) * 1000).toISOString(),
			max: T0 + 100,
		});
		expect(chart.applyRange).toHaveBeenLastCalledWith("x", "axis-1", {
			min: T0 + 20,
			max: T0 + 100,
		});
		// A view change, not an undo step.
		expect(useGraphHistory.getState().past).toHaveLength(0);
	});

	it("changes nothing when the chart is not mounted", async () => {
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1, scale: "log", min: 1, max: 10 },
			/chart is not on screen/,
		);
		expect(store().yAxes[0].scale).toBe("linear");
	});

	it("switches the scale and sets an X title, undoably", async () => {
		const out = await jsonOf("set_axis", { axis: "y", slot: 2, scale: "log" });
		expect(out.axis).toMatchObject({ slot: 2, scale: "log" });
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe(
			"set Y axis 2 to log scale",
		);
		expect(toasts().at(-1)?.message).toBe("AI agent: set Y axis 2 to log scale");

		await call("set_axis", {
			axis: "x",
			slot: 2,
			scale: "log",
			title: " Depth ",
		});
		expect(store().xAxes[1]).toMatchObject({ scale: "log", name: "Depth" });
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe("edit X axis 2");

		const reset = await jsonOf("set_axis", { axis: "x", slot: 2, title: "" });
		expect(reset.axis.title).toBe("x");
	});

	it("sets and resets a custom Y title", async () => {
		const before = await jsonOf("set_axis", {
			axis: "y",
			slot: 1,
			title: " Level (m) ",
		});
		expect(before.axis.title).toBe("Level (m)");
		expect(store().yAxes[0].title).toBe("Level (m)");

		const reset = await jsonOf("set_axis", { axis: "y", slot: 1, title: "" });
		expect(store().yAxes[0].title).toBeUndefined();
		expect(reset.axis.title).not.toBe("Level (m)");
	});

	it("checks the log range against the scale being set", async () => {
		mountChart();
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1, scale: "log", min: 0, max: 10 },
			/greater than 0 on a log axis/,
		);
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1, min: 5, max: 5 },
			/Max must be greater than Min/,
		);
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1, min: "low", max: 5 },
			/Min must be a number/,
		);
	});

	it("explains what cannot be set", async () => {
		await expectError(
			"set_axis",
			{ axis: "y", slot: 5, scale: "log" },
			/Y axis 5 shows no data/,
		);
		await expectError(
			"set_axis",
			{ axis: "x", slot: 3, title: "t" },
			/X axis 3 shows no data/,
		);
		await expectError("set_axis", { axis: "y", slot: 1 }, /at least one of/);
		await expectError(
			"set_axis",
			{ axis: "x", slot: 1, scale: "log" },
			/shows date values/,
		);
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1, min: 1 },
			/min and max together/,
		);
		await expectError(
			"set_axis",
			{ axis: "z", slot: 1, min: 1 },
			/"axis" must be one of "x", "y"/,
		);
		await expectError(
			"set_axis",
			{ axis: "y", slot: 1.5 },
			/"slot" must be an integer/,
		);
	});
});

describe("fit_all", () => {
	it("fits through the mounted chart", async () => {
		await expectError("fit_all", {}, /chart is not on screen/);
		const chart = mountChart();
		expect(await textOf("fit_all", {})).toMatch(/Fitting all axes/);
		expect(chart.fitAll).toHaveBeenCalledOnce();
	});

	it("needs something plotted", async () => {
		mountChart();
		useGraphStore.setState({ series: [] });
		await expectError("fit_all", {}, /Nothing is plotted/);
	});

	it("stops calling an unmounted chart", async () => {
		const chart = mountChart();
		unmountChart?.();
		await expectError("fit_all", {}, /chart is not on screen/);
		expect(chart.fitAll).not.toHaveBeenCalled();
	});
});

describe("add_calculated_column", () => {
	const success = (data: number[]) =>
		({
			type: "success",
			newColumn: {
				isFloat64: false,
				refPoint: 0,
				bounds: {
					min: Math.min(...data.filter(Number.isFinite)),
					max: Math.max(...data.filter(Number.isFinite)),
				},
				data: new Float32Array(data),
			},
		}) as Awaited<ReturnType<typeof formulaClient.evaluateFormulaInWorker>>;

	it("returns parse errors verbatim with their position", async () => {
		const evalSpy = vi.spyOn(formulaClient, "evaluateFormulaInWorker");
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "Bad", formula: "[Temp] * [Nope]" },
			/^Error: Formula error: .*Nope.*\(at character \d+\)$/,
		);
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "Fit", formula: "linreg([Temp]) + 1" },
			/Formula error: linreg\(\[col\]\): must be the entire formula/,
		);
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "Fit", formula: "linreg([Nope])" },
			/no column "Nope"/,
		);
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: " Temp ", formula: "[Flow]" },
			/already has a column "Temp"/,
		);
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "  ", formula: "[Flow]" },
			/"name" must not be empty/,
		);
		expect(evalSpy).not.toHaveBeenCalled();
	});

	it("computes the column through the store, undoably", async () => {
		const evalSpy = vi
			.spyOn(formulaClient, "evaluateFormulaInWorker")
			.mockResolvedValue(success([20, 26, Number.NaN, 32, 36]));
		const out = await jsonOf("add_calculated_column", {
			dataset: "Sensor",
			name: "Double",
			formula: "[Temp] * 2",
		});
		expect(evalSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				datasetId: "ds-1",
				name: "Double",
				formula: "[Temp] * 2",
			}),
		);
		expect(out.column).toEqual({
			name: "Double",
			kind: "numeric",
			min: 20,
			max: 36,
			formula: "[Temp] * 2",
		});
		expect(store().datasets[0].columns).toContain("Double");
		expect(toasts().at(-1)?.message).toBe(
			"AI agent: add calculated column 'Double'",
		);
	});

	it("accepts a regression formula", async () => {
		vi
			.spyOn(formulaClient, "evaluateFormulaInWorker")
			.mockResolvedValue(success([1, 2, 3, 4]));
		const out = await jsonOf("add_calculated_column", {
			dataset: "ds-2",
			name: "Trend",
			formula: "linreg([y])",
		});
		expect(out.column.name).toBe("Trend");
	});

	it("reports a time-bucket result as a new dataset", async () => {
		vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValue({
			...success([12, 17]),
			sparseXColumn: {
				isFloat64: true,
				refPoint: T0,
				bounds: { min: T0, max: T0 + 86400 },
				data: new Float32Array([0, 86400]),
			},
		} as Awaited<ReturnType<typeof formulaClient.evaluateFormulaInWorker>>);
		const out = await jsonOf("add_calculated_column", {
			dataset: "ds-1",
			name: "Daily",
			formula: "avgDay([Temp])",
		});
		expect(out.message).toMatch(/became a new dataset/);
		expect(out.dataset).toMatchObject({ name: "Daily", rows: 2 });
	});

	it("relays a failed calculation", async () => {
		vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValue({
			type: "error",
			error: "Division by zero everywhere",
		} as Awaited<ReturnType<typeof formulaClient.evaluateFormulaInWorker>>);
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "Ratio", formula: "[Temp] / 0" },
			/Division by zero everywhere/,
		);
		useGraphStore.setState({
			addCalculatedColumn: vi.fn().mockResolvedValue({ success: false }),
		});
		await expectError(
			"add_calculated_column",
			{ dataset: "ds-1", name: "Ratio", formula: "[Temp] / 2" },
			/Calculation failed/,
		);
	});
});

describe("undo and redo", () => {
	it("undo and redo the latest change and say which", async () => {
		expect(await textOf("undo", {})).toBe("Nothing to undo.");
		expect(await textOf("redo", {})).toBe("Nothing to redo.");
		await call("plot_column", { dataset: "ds-1", column: "Flow" });
		expect(await textOf("undo", {})).toBe("Undid \"add series 'Flow'\".");
		expect(store().series).toHaveLength(2);
		expect(toasts().at(-1)?.message).toBe("AI agent undid: add series 'Flow'");
		expect(await textOf("redo", {})).toBe("Redid \"add series 'Flow'\".");
		expect(store().series).toHaveLength(3);
	});
});
