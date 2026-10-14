import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { persistence } from "../../services/persistence";
import { HISTORY_LIMIT } from "../history";
import { deleteWithUndo } from "../undoToast";
import {
	clearHistory,
	latestHistoryId,
	undoIfLatest,
	useGraphHistory,
	useGraphStore,
	withHistory,
} from "../useGraphStore";
import { useNotificationStore } from "../useNotificationStore";
import * as formulaClient from "../../workers/formulaClient";

vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		clearAppState: vi.fn().mockResolvedValue(undefined),
		loadAppState: vi.fn().mockResolvedValue(null),
		getAllDatasets: vi.fn().mockResolvedValue([]),
	},
}));

const makeDataset = (id: string, name = id): Dataset => ({
	id,
	name,
	columns: ["Time", "Value"],
	data: [
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 10 },
			data: new Float32Array([0, 10]),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 1, max: 2 },
			data: new Float32Array([1, 2]),
		},
	],
	rowCount: 2,
	xAxisColumn: "Time",
});

const makeSeries = (id: string, sourceId = "ds-1"): SeriesConfig => ({
	id,
	sourceId,
	name: id,
	yColumn: "Value",
	yAxisId: "axis-1",
	pointStyle: "circle",
	pointColor: "#ff0000",
	lineStyle: "solid",
	lineColor: "#ff0000",
	hidden: false,
});

const store = () => useGraphStore.getState();
const past = () => useGraphHistory.getState().past;
const future = () => useGraphHistory.getState().future;

describe("undo/redo", () => {
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
			})),
			yAxes: Array.from({ length: 9 }, (_, i) => ({
				id: `axis-${i + 1}`,
				name: `Axis ${i + 1}`,
				min: 0,
				max: 100,
				position: i % 2 === 0 ? ("left" as const) : ("right" as const),
				color: "#475569",
				showGrid: i === 0,
			})),
			legendVisible: true,
			crosshairVisible: true,
			isLoaded: true,
		});
		clearHistory();
		useNotificationStore.setState({ notifications: [] });
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.useRealTimers();
		vi.restoreAllMocks();
	});

	it("undoes and redoes adding a dataset", () => {
		store().addDataset(makeDataset("ds-1", "foo"));
		expect(past().at(-1)?.label).toBe("add dataset 'foo'");

		store().undo();
		expect(store().datasets).toHaveLength(0);
		expect(persistence.deleteDataset).toHaveBeenCalledWith("ds-1");
		expect(future().at(-1)?.label).toBe("add dataset 'foo'");

		store().redo();
		expect(store().datasets.map((d) => d.id)).toEqual(["ds-1"]);
		expect(persistence.saveDataset).toHaveBeenCalledTimes(2);
	});

	it("restores a removed dataset and its series, re-saving it to persistence", () => {
		store().addDataset(makeDataset("ds-1", "foo"));
		store().addSeries(makeSeries("s1"));
		const ds = store().datasets[0];
		vi.mocked(persistence.saveDataset).mockClear();

		store().removeDataset("ds-1");
		expect(persistence.deleteDataset).toHaveBeenCalledWith("ds-1");
		expect(store().datasets).toHaveLength(0);
		expect(past().at(-1)?.label).toBe("delete dataset 'foo'");

		store().undo();
		expect(store().datasets[0]).toBe(ds);
		// Columns are shared by reference, never copied.
		expect(store().datasets[0].data[1].data).toBe(ds.data[1].data);
		expect(store().series.map((s) => s.id)).toEqual(["s1"]);
		expect(persistence.saveDataset).toHaveBeenCalledWith(ds);

		vi.mocked(persistence.deleteDataset).mockClear();
		store().redo();
		expect(store().datasets).toHaveLength(0);
		expect(persistence.deleteDataset).toHaveBeenCalledWith("ds-1");
	});

	it("restores the x range of a dataset that comes back but keeps other viewports", () => {
		store().addDataset(makeDataset("ds-1"));
		store().addSeries(makeSeries("s1"));
		store().batchUpdateAxes({}, { "axis-1": { min: 5, max: 6 } });
		const xBefore = store().xAxes[0];

		// Last dataset: removal resets every axis to its default.
		store().removeDataset("ds-1");
		expect(store().xAxes[0].max).toBe(100);
		store().undo();
		expect(store().xAxes[0]).toEqual(xBefore);
		expect(store().yAxes[0]).toMatchObject({ min: 5, max: 6 });

		// A pan after an edit survives undoing the edit.
		store().updateSeries("s1", { lineStyle: "dashed" });
		store().batchUpdateAxes(
			{ "axis-1": { min: 2, max: 3 } },
			{ "axis-1": { min: 7, max: 8 } },
		);
		store().undo();
		expect(store().series[0].lineStyle).toBe("solid");
		expect(store().xAxes[0]).toMatchObject({ min: 2, max: 3 });
		expect(store().yAxes[0]).toMatchObject({ min: 7, max: 8 });
	});

	it("does not record viewport changes", () => {
		store().batchUpdateAxes({ "axis-1": { min: 1, max: 2 } }, {});
		store().updateXAxis("axis-1", { min: 3, max: 4 });
		store().updateYAxis("axis-1", { min: 3, max: 4 });
		expect(past()).toHaveLength(0);
	});

	it("undoes series add, edit, visibility, reorder and removal", () => {
		store().addDataset(makeDataset("ds-1"));
		store().addSeries(makeSeries("s1"));
		store().addSeries(makeSeries("s2"));
		store().updateSeries("s1", { lineColor: "#00ff00", pointColor: "#00ff00" });
		store().updateSeriesVisibility("s1", true);
		store().reorderSeries("s2", 0);
		store().removeSeries("s1");
		expect(past().map((e) => e.label)).toEqual([
			"add dataset 'ds-1'",
			"add series 's1'",
			"add series 's2'",
			"change color of 's1'",
			"hide series 's1'",
			"reorder series",
			"delete series 's1'",
		]);

		store().undo();
		expect(store().series.map((s) => s.id)).toEqual(["s2", "s1"]);
		store().undo();
		expect(store().series.map((s) => s.id)).toEqual(["s1", "s2"]);
		store().undo();
		expect(store().series[0].hidden).toBe(false);
		store().undo();
		expect(store().series[0].lineColor).toBe("#ff0000");
		store().undo();
		expect(store().series.map((s) => s.id)).toEqual(["s1"]);
	});

	it("does not record an update that changes nothing", () => {
		store().addSeries(makeSeries("s1"));
		const n = past().length;
		store().updateSeries("s1", { lineStyle: "solid" });
		store().updateYAxis("axis-1", { showGrid: true });
		expect(past()).toHaveLength(n);
	});

	it("undoes axis config edits and toggles", () => {
		store().updateXAxis("axis-1", { name: "Time" });
		store().updateYAxis("axis-2", { position: "left" });
		store().updateYAxis("axis-1", { showGrid: false });
		store().setLegendVisible(false);
		store().setCrosshairVisible(false);
		expect(past().map((e) => e.label)).toEqual([
			"rename X-axis 1",
			"move Y-axis 2 to the left",
			"hide Y-axis 1 grid",
			"hide legend",
			"hide crosshair",
		]);

		for (let i = 0; i < 5; i++) store().undo();
		expect(store().xAxes[0].name).toBe("");
		expect(store().yAxes[1].position).toBe("right");
		expect(store().yAxes[0].showGrid).toBe(true);
		expect(store().legendVisible).toBe(true);
		expect(store().crosshairVisible).toBe(true);
	});

	it("undoes dataset edits and column renames, re-saving the old dataset", () => {
		store().addDataset(makeDataset("ds-1"));
		store().addSeries(makeSeries("s1"));
		const original = store().datasets[0];

		store().renameColumn("ds-1", "Value", "Speed");
		expect(store().series[0].yColumn).toBe("Speed");
		store().updateDataset("ds-1", { xAxisId: "axis-3" });

		vi.mocked(persistence.saveDataset).mockClear();
		store().undo();
		store().undo();
		expect(store().datasets[0]).toBe(original);
		expect(store().series[0].yColumn).toBe("Value");
		expect(persistence.saveDataset).toHaveBeenLastCalledWith(original);
	});

	it("undoes adding and removing a calculated column", async () => {
		vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockResolvedValue({
			type: "success",
			newColumn: {
				isFloat64: false,
				refPoint: 0,
				data: new Float32Array([2, 4]),
			},
		} as Awaited<ReturnType<typeof formulaClient.evaluateFormulaInWorker>>);
		store().addDataset(makeDataset("ds-1"));
		const original = store().datasets[0];

		const res = await store().addCalculatedColumn(
			"ds-1",
			"Double",
			"[Value] * 2",
		);
		expect(res.success).toBe(true);
		expect(past().at(-1)?.label).toBe("add calculated column 'Double'");
		const withCalc = store().datasets[0];

		store().addSeries({ ...makeSeries("s1"), yColumn: "Double" });
		store().removeCalculatedColumn("ds-1", "Double");
		expect(store().series).toHaveLength(0);

		store().undo();
		expect(store().datasets[0]).toBe(withCalc);
		expect(store().series[0].yColumn).toBe("Double");
		expect(persistence.saveDataset).toHaveBeenLastCalledWith(withCalc);

		store().undo();
		store().undo();
		expect(store().datasets[0]).toBe(original);
	});

	it("coalesces rapid edits of the same field into one entry", () => {
		vi.useFakeTimers();
		store().addSeries(makeSeries("s1"));
		const n = past().length;
		for (const c of ["#000001", "#000002", "#000003"]) {
			store().updateSeries("s1", { lineColor: c, pointColor: c });
			vi.advanceTimersByTime(200);
		}
		expect(past()).toHaveLength(n + 1);
		store().undo();
		expect(store().series[0].lineColor).toBe("#ff0000");

		// A different field, or a pause, starts a new entry.
		store().updateSeries("s1", { lineColor: "#000004", pointColor: "#000004" });
		store().updateSeries("s1", { lineStyle: "dashed" });
		vi.advanceTimersByTime(5000);
		store().updateSeries("s1", { lineStyle: "dotted" });
		expect(past()).toHaveLength(n + 3);
	});

	it("does not coalesce into an entry after undo/redo moved past it", () => {
		vi.useFakeTimers();
		store().updateXAxis("axis-1", { name: "a" });
		store().undo();
		store().redo();
		store().updateXAxis("axis-1", { name: "ab" });
		expect(past()).toHaveLength(2);
	});

	it("caps the history and drops the oldest entries", () => {
		store().addDataset(makeDataset("ds-1"));
		const ds = store().datasets[0];
		store().removeDataset("ds-1");
		const removalId = latestHistoryId();
		for (let i = 0; i < HISTORY_LIMIT; i++) {
			store().setLegendVisible(i % 2 === 1);
		}
		expect(past()).toHaveLength(HISTORY_LIMIT);
		// The deleted dataset is no longer pinned by any entry.
		expect(past().some((e) => e.snapshot.datasets.includes(ds))).toBe(false);
		expect(past().some((e) => e.id === removalId)).toBe(false);
	});

	it("clears redo after a new action", () => {
		store().setLegendVisible(false);
		store().undo();
		expect(future()).toHaveLength(1);
		store().setCrosshairVisible(false);
		expect(future()).toHaveLength(0);
		store().redo();
		expect(store().legendVisible).toBe(true);
	});

	it("ignores undo/redo with empty stacks and before load", () => {
		expect(() => store().undo()).not.toThrow();
		expect(() => store().redo()).not.toThrow();
		store().setLegendVisible(false);
		useGraphStore.setState({ isLoaded: false });
		store().undo();
		expect(store().legendVisible).toBe(false);
	});

	it("does not record anything before the initial load", () => {
		useGraphStore.setState({ isLoaded: false });
		store().addDataset(makeDataset("ds-1"));
		store().setLegendVisible(false);
		expect(past()).toHaveLength(0);
	});

	it("groups nested actions into one entry", () => {
		withHistory("import 'a.csv'", () => {
			store().addDataset(makeDataset("ds-1"));
			store().addSeries(makeSeries("s1"));
		});
		expect(past().map((e) => e.label)).toEqual(["import 'a.csv'"]);
		store().undo();
		expect(store().datasets).toHaveLength(0);
		expect(store().series).toHaveLength(0);
	});

	it("undoIfLatest only undoes while the entry is still newest", () => {
		store().setLegendVisible(false);
		const id = latestHistoryId() as number;
		store().setCrosshairVisible(false);
		expect(undoIfLatest(id)).toBe(false);
		expect(store().crosshairVisible).toBe(false);
		store().undo();
		expect(undoIfLatest(id)).toBe(true);
		expect(store().legendVisible).toBe(true);
	});

	it("deleteWithUndo shows a toast whose Undo restores the item", () => {
		store().addDataset(makeDataset("ds-1", "foo"));
		deleteWithUndo("foo", () => store().removeDataset("ds-1"));
		const toast = useNotificationStore.getState().notifications.at(-1);
		expect(toast?.message).toBe("Deleted 'foo'");
		expect(toast?.action?.label).toBe("Undo");
		toast?.action?.onAction();
		expect(store().datasets.map((d) => d.id)).toEqual(["ds-1"]);
	});

	it("deleteWithUndo shows no toast when nothing was deleted", () => {
		store().setLegendVisible(false);
		deleteWithUndo("ghost", () => store().removeCalculatedColumn("nope", "x"));
		expect(useNotificationStore.getState().notifications).toHaveLength(0);
	});
});
