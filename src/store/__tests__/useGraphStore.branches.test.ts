import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
} from "../../services/persistence";
import { persistence } from "../../services/persistence";
import * as formulaClient from "../../workers/formulaClient";
import {
	clearHistory,
	flushPendingSaves,
	useGraphHistory,
	useGraphStore,
} from "../useGraphStore";

vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		saveAppState: vi.fn().mockResolvedValue(undefined),
		flushAll: vi.fn().mockResolvedValue(undefined),
		clearAppState: vi.fn().mockResolvedValue(undefined),
		loadAppState: vi.fn().mockResolvedValue(null),
		getAllDatasets: vi.fn().mockResolvedValue([]),
		disable: vi.fn(),
	},
}));

const col = (
	values: number[],
	extra: Partial<DataColumn> = {},
): DataColumn => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min: Math.min(...values), max: Math.max(...values) },
	data: new Float32Array(values),
	...extra,
});

const makeDataset = (
	id: string,
	over: Partial<Dataset> = {},
): Dataset & { xAxisId?: string } => ({
	id,
	name: id,
	columns: ["Time", "Value"],
	data: [col([0, 10]), col([-5, 20])],
	rowCount: 2,
	xAxisColumn: "Time",
	xAxisId: "axis-1",
	...over,
});

const makeSeries = (
	id: string,
	over: Partial<SeriesConfig> = {},
): SeriesConfig => ({
	id,
	sourceId: "ds-1",
	name: id,
	yColumn: "Value",
	yAxisId: "axis-1",
	pointStyle: "circle",
	pointColor: "#ff0000",
	lineStyle: "solid",
	lineColor: "#ff0000",
	hidden: false,
	...over,
});

const store = () => useGraphStore.getState();
const lastLabel = () => useGraphHistory.getState().past.at(-1)?.label;
const xAxis = (id: string) => store().xAxes.find((a) => a.id === id)!;
const yAxis = (id: string) => store().yAxes.find((a) => a.id === id)!;

type EvalResult = Awaited<
	ReturnType<typeof formulaClient.evaluateFormulaInWorker>
>;

describe("useGraphStore branches", () => {
	beforeEach(() => {
		useGraphStore.setState({
			datasets: [],
			series: [],
			xAxes: Array.from({ length: 9 }, (_, i) => ({
				id: `axis-${i + 1}`,
				name: "",
				min: 0,
				max: 100,
				showGrid: i === 0,
				xMode: "numeric" as const,
				scale: "linear" as const,
			})),
			yAxes: Array.from({ length: 9 }, (_, i) => ({
				id: `axis-${i + 1}`,
				name: `Axis ${i + 1}`,
				min: 0,
				max: 100,
				position: i % 2 === 0 ? ("left" as const) : ("right" as const),
				color: "#475569",
				showGrid: i === 0,
				scale: "linear" as const,
			})),
			legendVisible: true,
			crosshairVisible: true,
			previewColor: null,
			previewStyle: null,
			isLoaded: true,
		});
		clearHistory();
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	describe("UI toggles and previews", () => {
		it("labels showing and hiding the crosshair", () => {
			store().setCrosshairVisible(false);
			expect(lastLabel()).toBe("hide crosshair");
			store().setCrosshairVisible(true);
			expect(lastLabel()).toBe("show crosshair");
		});

		it("sets and clears colour and style previews without history", () => {
			store().setPreviewColor({ seriesId: "s1", color: "#00ff00" });
			expect(store().previewColor).toEqual({
				seriesId: "s1",
				color: "#00ff00",
			});
			store().setPreviewStyle({
				seriesId: "s1",
				lineStyle: "dashed",
			} as never);
			expect(store().previewStyle).toMatchObject({ seriesId: "s1" });
			store().setPreviewColor(null);
			store().setPreviewStyle(null);
			expect(store().previewColor).toBeNull();
			expect(store().previewStyle).toBeNull();
			expect(useGraphHistory.getState().past).toHaveLength(0);
		});
	});

	describe("addDataset x column resolution", () => {
		it("prefers a date-like column when none is given", () => {
			store().addDataset({
				...makeDataset("d"),
				columns: ["a", "Date", "b"],
				data: [col([1]), col([2]), col([3])],
				xAxisColumn: undefined,
			} as never);
			expect(store().datasets[0].xAxisColumn).toBe("Date");
		});

		it("falls back to the first column", () => {
			store().addDataset({
				...makeDataset("d"),
				columns: ["a", "b"],
				xAxisColumn: "",
			});
			expect(store().datasets[0].xAxisColumn).toBe("a");
		});
	});

	describe("x axis fitting with log scale", () => {
		it("falls back to linear when a log x axis gets a date column", () => {
			useGraphStore.setState({
				xAxes: store().xAxes.map((a) =>
					a.id === "axis-1" ? { ...a, scale: "log", min: 1, max: 10 } : a,
				),
			});
			store().addDataset(
				makeDataset("d", {
					data: [col([0, 1e12], { isFloat64: true }), col([1, 2])],
				}),
			);
			expect(xAxis("axis-1")).toMatchObject({ scale: "linear", xMode: "date" });
		});

		it("switches a bound x axis to log, fitted to its positive values", () => {
			store().addDataset(
				makeDataset("d", { data: [col([-3, 0, 2, 50]), col([1, 2, 3, 4])] }),
			);
			store().setAxisScale("x", "axis-1", "log");
			const a = xAxis("axis-1");
			expect(a.scale).toBe("log");
			expect(a.min).toBeGreaterThan(0);
			expect(lastLabel()).toBe("set X-axis 1 to log scale");
		});

		it("ignores scale switches of unknown axes", () => {
			store().setAxisScale("y", "axis-42", "log");
			expect(useGraphHistory.getState().past).toHaveLength(0);
		});

		it("switches a y axis to log even when no plotted column has positive data", () => {
			store().addDataset(
				makeDataset("ds-1", { data: [col([0, 1]), col([-2, -1])] }),
			);
			store().addSeries(makeSeries("s1"));
			store().addSeries(makeSeries("orphan", { sourceId: "gone" }));
			store().setAxisScale("y", "axis-1", "log");
			expect(yAxis("axis-1").scale).toBe("log");
			expect(yAxis("axis-1").min).toBeGreaterThan(0);
		});
	});

	describe("renameColumn", () => {
		beforeEach(() => {
			store().addDataset(makeDataset("ds-1"));
			store().addDataset(makeDataset("ds-2", { xAxisId: "axis-2" }));
			store().addSeries(makeSeries("s1", { name: "custom" }));
			store().addSeries(makeSeries("s2", { sourceId: "ds-2" }));
			vi.clearAllMocks();
		});

		it("is a no-op for an empty, unchanged, duplicate name or unknown dataset", () => {
			const before = store().datasets;
			store().renameColumn("ds-1", "Value", "   ");
			store().renameColumn("ds-1", "Value", "Value");
			store().renameColumn("ds-1", "Value", "Time");
			store().renameColumn("nope", "Value", "X");
			expect(store().datasets).toBe(before);
			expect(persistence.saveDataset).not.toHaveBeenCalled();
		});

		it("renames the x column and keeps a customised series name", () => {
			store().renameColumn("ds-1", "Time", "Seconds");
			const ds = store().datasets[0];
			expect(ds.xAxisColumn).toBe("Seconds");
			store().renameColumn("ds-1", "Value", "Temp");
			expect(store().series[0]).toMatchObject({ yColumn: "Temp", name: "custom" });
			// The other dataset's same-named column and series are untouched.
			expect(store().datasets[1].columns).toEqual(["Time", "Value"]);
			expect(store().series[1].yColumn).toBe("Value");
		});
	});

	describe("labels for unknown ids and unnamed series", () => {
		it("falls back to the id when removing an unknown dataset or series", () => {
			store().addDataset(makeDataset("ds-1"));
			store().addSeries(makeSeries("s1"));
			store().removeDataset("missing");
			store().removeSeries("missing");
			expect(store().datasets).toHaveLength(1);
			expect(store().series).toHaveLength(1);
		});

		it("names a hidden series by its column when it has no name", () => {
			store().addDataset(makeDataset("ds-1"));
			store().addSeries(makeSeries("s1", { name: "" }));
			expect(lastLabel()).toBe("add series 'Value'");
			store().updateSeriesVisibility("s1", true);
			expect(lastLabel()).toBe("hide series 'Value'");
		});

		it("updateSeriesVisibility of an unknown series changes no series", () => {
			store().addDataset(makeDataset("ds-1"));
			store().addSeries(makeSeries("s1"));
			store().updateSeriesVisibility("missing", true);
			expect(store().series).toEqual([makeSeries("s1")]);
		});
	});

	describe("series edit labels", () => {
		beforeEach(() => {
			store().addDataset(makeDataset("ds-1"));
			store().addSeries(makeSeries("s1"));
		});

		it.each([
			[{ pointStyle: "square" }, "change point style of 's1'"],
			[{ yAxisId: "axis-3" }, "move 's1' to Y-axis 3"],
			[{ yColumn: "Time" }, "change column of 's1'"],
			[{ name: "renamed" }, "rename series 's1'"],
			[{ hidden: true }, "edit series 's1'"],
		] as const)("%o is recorded as %s", (updates, label) => {
			store().updateSeries("s1", updates as Partial<SeriesConfig>);
			expect(lastLabel()).toBe(label);
		});
	});

	describe("addCalculatedColumn edge paths", () => {
		beforeEach(() => {
			store().addDataset(makeDataset("ds-1"));
		});

		it("reports a generic failure when the worker gives no reason", async () => {
			vi
				.spyOn(formulaClient, "evaluateFormulaInWorker")
				.mockResolvedValueOnce({ type: "error" } as EvalResult);
			const res = await store().addCalculatedColumn("ds-1", "C", "[Value] + 1");
			expect(res).toEqual({ success: false, error: "Calculation failed" });
		});

		it("replacing the x column keeps it bound as the x column", async () => {
			vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValueOnce({
				type: "success",
				newColumn: col([1, 2]),
			} as EvalResult);
			const res = await store().addCalculatedColumn(
				"ds-1",
				"T2",
				"[Value] * 2",
				"Time",
			);
			expect(res.success).toBe(true);
			const ds = store().datasets[0];
			expect(ds.columns).toEqual(["T2", "Value"]);
			expect(ds.xAxisColumn).toBe("T2");
		});

		it("keeping the same name leaves plotting series untouched", async () => {
			store().addSeries(makeSeries("s1"));
			const series = store().series;
			vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValueOnce({
				type: "success",
				newColumn: col([1, 2]),
			} as EvalResult);
			await store().addCalculatedColumn("ds-1", "Value", "[Time] * 2", "Value");
			expect(store().series).toBe(series);
			expect(store().datasets[0].data[1].formula).toBe("[Time] * 2");
		});

		it("renaming an edited column moves only its series, keeping custom names", async () => {
			store().addSeries(makeSeries("s1", { name: "Mine" }));
			store().addSeries(makeSeries("s2", { yColumn: "Time" }));
			vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValueOnce({
				type: "success",
				newColumn: col([1, 2]),
			} as EvalResult);
			await store().addCalculatedColumn("ds-1", "V2", "[Time] * 2", "Value");
			expect(store().series[0]).toMatchObject({ yColumn: "V2", name: "Mine" });
			expect(store().series[1]).toMatchObject({ yColumn: "Time" });
		});

		it("replacing a column with a sparse result swaps it for a sub-dataset", async () => {
			vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValueOnce({
				type: "success",
				newColumn: col([1, 2]),
				sparseXColumn: col([0, 5]),
			} as EvalResult);
			const res = await store().addCalculatedColumn(
				"ds-1",
				"Daily",
				"avgday([Time])",
				"Value",
			);
			expect(res.success).toBe(true);
			expect(store().datasets[0].columns).toEqual(["Time"]);
			expect(store().datasets[1]).toMatchObject({
				name: "Daily",
				columns: ["Time", "Daily"],
				xAxisId: "axis-1",
			});
			expect(lastLabel()).toBe("edit calculated column 'Daily'");
		});
	});

	it("removing a calculated column leaves other datasets alone", () => {
		store().addDataset(makeDataset("ds-1"));
		store().addDataset(makeDataset("ds-2", { xAxisId: "axis-2" }));
		const other = store().datasets[1];
		store().removeCalculatedColumn("ds-1", "Value");
		expect(store().datasets[0].columns).toEqual(["Time"]);
		expect(store().datasets[1]).toBe(other);
	});

	it("redo is ignored before the initial load", () => {
		store().addDataset(makeDataset("ds-1"));
		store().undo();
		useGraphStore.setState({ isLoaded: false });
		store().redo();
		expect(store().datasets).toHaveLength(0);
		useGraphStore.setState({ isLoaded: true });
		store().redo();
		expect(store().datasets).toHaveLength(1);
	});

	it("undo restores the x range of a dataset that had no explicit axis slot", () => {
		const ds = makeDataset("ds-1");
		delete (ds as Partial<Dataset>).xAxisId;
		useGraphStore.setState({ datasets: [ds as Dataset] });
		store().updateDataset("ds-1", { xAxisColumn: "Value" });
		store().undo();
		expect(store().datasets[0].xAxisColumn).toBe("Time");
	});

	it("replaceWorkspace keeps explicit series visibility", () => {
		store().replaceWorkspace(
			{
				datasets: [makeDataset("ds-1") as Dataset],
				series: [makeSeries("a", { hidden: true }), makeSeries("b")],
				xAxes: [],
				yAxes: [],
				legendVisible: false,
				crosshairVisible: true,
			},
			"open session",
		);
		expect(store().series.map((s) => s.hidden)).toEqual([true, false]);
		expect(store().xAxes).toHaveLength(9);
		expect(store().legendVisible).toBe(false);
		expect(lastLabel()).toBe("open session");
	});

	it("loadPersistedState keeps saved visibility and defaults the rest", async () => {
		const noHidden: Partial<SeriesConfig> = makeSeries("b");
		delete noHidden.hidden;
		vi.mocked(persistence.loadAppState).mockResolvedValueOnce({
			series: [makeSeries("a", { hidden: true }), noHidden as SeriesConfig],
			xAxes: [],
			yAxes: [],
			legendVisible: true,
			crosshairVisible: false,
		});
		vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([]);
		await store().loadPersistedState();
		expect(store().series.map((s) => s.hidden)).toEqual([true, false]);
		expect(store().crosshairVisible).toBe(false);
	});

	describe("debounced persistence", () => {
		it("skips the idle write when the store was unloaded meanwhile", async () => {
			vi.useFakeTimers();
			store().setLegendVisible(false);
			store().updateXAxis("axis-1", { min: 1, max: 2 });
			useGraphStore.setState({ isLoaded: false });
			await vi.runAllTimersAsync();
			expect(persistence.saveConfig).not.toHaveBeenCalled();
			expect(persistence.saveViewport).not.toHaveBeenCalled();
		});

		it("writes config and viewport after their debounce", async () => {
			vi.useFakeTimers();
			store().setLegendVisible(false);
			store().updateXAxis("axis-1", { min: 1, max: 2 });
			await vi.runAllTimersAsync();
			expect(persistence.saveConfig).toHaveBeenCalledWith(
				expect.objectContaining({ legendVisible: false }),
			);
			expect(persistence.saveViewport).toHaveBeenCalledTimes(1);
		});

		it("flushPendingSaves cancels both pending debounced writes", async () => {
			vi.useFakeTimers();
			store().setLegendVisible(false);
			store().updateXAxis("axis-1", { min: 1, max: 2 });
			await flushPendingSaves();
			await vi.runAllTimersAsync();
			expect(persistence.saveAppState).toHaveBeenCalledTimes(1);
			expect(persistence.saveConfig).not.toHaveBeenCalled();
			expect(persistence.saveViewport).not.toHaveBeenCalled();
		});
	});
});
