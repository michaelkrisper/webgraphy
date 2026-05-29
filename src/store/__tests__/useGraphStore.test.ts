import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../../services/persistence";
import { useGraphStore } from "../useGraphStore";
import * as formulaClient from "../../workers/formulaClient";

class MockWorker {
	onmessage: ((ev: MessageEvent) => void) | null = null;
	onerror: ((ev: ErrorEvent | Error) => void) | null = null;
	postMessage(data: { formula: string; id?: number }) {
		const { id } = data;
		setTimeout(() => {
			if (data.formula === "[Val] * 3") {
				if (this.onerror) this.onerror(new Error("Worker error"));
			} else if (data.formula === "[Val] * 4") {
				if (this.onmessage)
					this.onmessage({
						data: { id, type: "error", error: "Calculation failed" },
					} as MessageEvent);
			} else if (data.formula === "avgday([Val])") {
				if (this.onmessage)
					this.onmessage({
						data: {
							id,
							type: "success",
							newColumn: { data: new Float32Array([1, 2]) },
							sparseXColumn: { data: new Float32Array([1, 2]), refPoint: 0 },
						},
					} as MessageEvent);
			} else {
				if (this.onmessage)
					this.onmessage({
						data: {
							id,
							type: "success",
							newColumn: { data: new Float32Array([1, 2]) },
						},
					} as MessageEvent);
			}
		}, 0);
	}
	terminate() {}
}
(globalThis as unknown as { Worker: typeof MockWorker }).Worker = MockWorker;

// Mock persistence to avoid IndexedDB and LocalStorage issues during tests
vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		loadDataset: vi.fn(),
		getAllDatasets: vi.fn().mockResolvedValue([]),
		deleteDataset: vi.fn(),
		saveAppState: vi.fn(),
		loadAppState: vi.fn().mockResolvedValue(null),
		clearAppState: vi.fn().mockResolvedValue(undefined),
	},
}));

describe("useGraphStore", () => {
	beforeEach(() => {
		// Reset store state before each test
		useGraphStore.setState({
			datasets: [],
			series: [],
			xAxes: Array.from({ length: 9 }, (_, i) => ({
				id: `axis-${i + 1}`,
				name: `X-Axis ${i + 1}`,
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
			isLoaded: true,
		});
	});

	it("should assign unique X-axis IDs to new datasets automatically", () => {
		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Time", "Value"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					bounds: { min: 10, max: 20 },
					data: new Float32Array([10, 20]),
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 5 },
					data: new Float32Array([0, 5]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "",
		};

		const ds2: Dataset = {
			id: "ds-2",
			name: "Dataset 2",
			columns: ["Time", "Value"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					bounds: { min: 100, max: 200 },
					data: new Float32Array([100, 200]),
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 50 },
					data: new Float32Array([0, 50]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "",
		};

		useGraphStore.getState().addDataset(ds1);
		useGraphStore.getState().addDataset(ds2);

		const state = useGraphStore.getState();
		expect(state.datasets[0].xAxisId).toBe("axis-1");
		expect(state.datasets[1].xAxisId).toBe("axis-2");

		// Verify bounds and xMode were updated correctly
		const xAxis1 = state.xAxes.find((a) => a.id === "axis-1");
		const xAxis2 = state.xAxes.find((a) => a.id === "axis-2");

		expect(xAxis1?.min).toBe(10);
		expect(xAxis1?.max).toBe(20);
		expect(xAxis1?.xMode).toBe("date");

		expect(xAxis2?.min).toBe(100);
		expect(xAxis2?.max).toBe(200);
		expect(xAxis2?.xMode).toBe("date");
	});

	it("should fallback to axis-1 if all 9 axes are used", () => {
		const store = useGraphStore.getState();
		const datasets: Dataset[] = Array.from({ length: 9 }, (_, i) => ({
			id: `ds-${i + 1}`,
			name: `Dataset ${i + 1}`,
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "",
		}));

		datasets.forEach((ds) => {
			store.addDataset(ds);
		});

		const ds10: Dataset = {
			id: "ds-10",
			name: "Dataset 10",
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "",
		};
		store.addDataset(ds10);

		const state = useGraphStore.getState();
		expect(state.datasets[9].xAxisId).toBe("axis-1");
	});

	it("should update dataset correctly", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		store.updateDataset("ds-1", { name: "Updated Name" });
		const state = useGraphStore.getState();
		expect(state.datasets[0].name).toBe("Updated Name");
	});

	it("should remove dataset correctly and clear app state if empty", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);
		expect(useGraphStore.getState().datasets).toHaveLength(1);

		store.removeDataset("ds-1");
		expect(useGraphStore.getState().datasets).toHaveLength(0);
	});

	it("should move dataset correctly", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time"],
			data: [],
			rowCount: 0,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		const ds2: Dataset = {
			id: "ds-2",
			name: "D2",
			columns: ["Time"],
			data: [],
			rowCount: 0,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);
		store.addDataset(ds2);

		store.moveDataset("ds-1", 1);
		const state = useGraphStore.getState();
		expect(state.datasets[0].id).toBe("ds-2");
		expect(state.datasets[1].id).toBe("ds-1");
	});

	it("should manage series correctly", () => {
		const store = useGraphStore.getState();
		const series1 = {
			id: "s-1",
			name: "S1",
			sourceId: "ds-1",
			yColumn: "val",
			yAxisId: "axis-1",
			color: "#000",
		};
		store.addSeries(series1);
		expect(useGraphStore.getState().series).toHaveLength(1);

		store.updateSeries("s-1", { name: "Updated S1" });
		expect(useGraphStore.getState().series[0].name).toBe("Updated S1");

		store.updateSeriesVisibility("s-1", true);
		expect(useGraphStore.getState().series[0].hidden).toBe(true);

		store.removeSeries("s-1");
		expect(useGraphStore.getState().series).toHaveLength(0);
	});

	it("should manage bulk series visibility", () => {
		const store = useGraphStore.getState();
		const series1 = {
			id: "s-1",
			name: "S1",
			sourceId: "ds-1",
			yColumn: "val",
			yAxisId: "axis-1",
			color: "#000",
		};
		const series2 = {
			id: "s-2",
			name: "S2",
			sourceId: "ds-1",
			yColumn: "val2",
			yAxisId: "axis-1",
			color: "#000",
		};
		store.addSeries(series1);
		store.addSeries(series2);

		store.bulkHideAllSeries();
		expect(useGraphStore.getState().series.every((s) => s.hidden)).toBe(true);

		store.bulkShowAllSeries();
		expect(useGraphStore.getState().series.every((s) => !s.hidden)).toBe(true);
	});

	it("should manage highlighted series", () => {
		const store = useGraphStore.getState();
		store.setHighlightedSeries("s-1");
		expect(useGraphStore.getState().highlightedSeriesId).toBe("s-1");
	});

	it("should update axes correctly", () => {
		const store = useGraphStore.getState();
		store.updateXAxis("axis-1", { name: "New X Name" });
		expect(useGraphStore.getState().xAxes[0].name).toBe("New X Name");

		store.updateYAxis("axis-1", { name: "New Y Name" });
		expect(useGraphStore.getState().yAxes[0].name).toBe("New Y Name");

		store.setAxisTitles("Global X", "Global Y");
		expect(useGraphStore.getState().axisTitles).toEqual({
			x: "Global X",
			y: "Global Y",
		});

		store.batchUpdateAxes(
			{ "axis-1": { min: 10, max: 20 } },
			{ "axis-1": { min: 30, max: 40 } },
		);
		expect(useGraphStore.getState().xAxes[0].min).toBe(10);
		expect(useGraphStore.getState().yAxes[0].min).toBe(30);
	});

	it("should move and reorder series", () => {
		const store = useGraphStore.getState();
		const series1 = {
			id: "s-1",
			name: "S1",
			sourceId: "ds-1",
			yColumn: "val",
			yAxisId: "axis-1",
			color: "#000",
		};
		const series2 = {
			id: "s-2",
			name: "S2",
			sourceId: "ds-1",
			yColumn: "val2",
			yAxisId: "axis-1",
			color: "#000",
		};
		store.addSeries(series1);
		store.addSeries(series2);

		store.moveSeries("s-1", 1);
		expect(useGraphStore.getState().series[0].id).toBe("s-2");

		store.reorderSeries("s-2", 1);
		expect(useGraphStore.getState().series[0].id).toBe("s-1");
	});

	it("should manage UI toggles", () => {
		const store = useGraphStore.getState();
		store.setLegendVisible(false);
		expect(useGraphStore.getState().legendVisible).toBe(false);

		store.setCrosshairVisible(false);
		expect(useGraphStore.getState().crosshairVisible).toBe(false);
	});

	it("should remove calculated column", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Time", "Calc"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);
		store.removeCalculatedColumn("ds-1", "Calc");

		const state = useGraphStore.getState();
		expect(state.datasets[0].columns).not.toContain("Calc");
	});

	it("should handle removeCalculatedColumn when dataset or column not found", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time"],
			data: [],
			rowCount: 0,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		store.removeCalculatedColumn("ds-not-found", "Time");
		store.removeCalculatedColumn("ds-1", "NotFound");

		expect(useGraphStore.getState().datasets[0].columns).toEqual(["Time"]);
	});

	it("should set xMode to categorical if categoryLabels exist in addDataset", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Cat", "Value"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 2 },
					data: new Float32Array([0, 1, 2]),
					categoryLabels: ["A", "B", "C"],
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 10, 100]),
				},
			],
			rowCount: 3,
			xAxisColumn: "Cat",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);
		const state = useGraphStore.getState();
		expect(state.xAxes[0].xMode).toBe("categorical");
	});

	it("should handle updateDataset when dataset not found or axes are updated", () => {
		const store = useGraphStore.getState();
		store.updateDataset("ds-not-found", { name: "Test" });

		const ds1: Dataset = {
			id: "ds-1",
			name: "Dataset 1",
			columns: ["Time", "Value"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					bounds: { min: 0, max: 100 },
					data: new Float32Array([0, 100]),
				},
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 50 },
					data: new Float32Array([0, 50]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		store.updateDataset("ds-1", { xAxisColumn: "Time" });
		expect(useGraphStore.getState().xAxes[0].xMode).toBe("date");
	});

	it("should handle out-of-bounds indices in move methods", () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time"],
			data: [],
			rowCount: 0,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		store.moveDataset("ds-not-found", 1);
		store.moveDataset("ds-1", -10);
		store.moveDataset("ds-1", 10);
		expect(useGraphStore.getState().datasets[0].id).toBe("ds-1");

		const series1 = {
			id: "s-1",
			name: "S1",
			sourceId: "ds-1",
			yColumn: "val",
			yAxisId: "axis-1",
			color: "#000",
		};
		store.addSeries(series1);

		store.moveSeries("s-not-found", 1);
		store.moveSeries("s-1", -10);
		store.moveSeries("s-1", 10);
		expect(useGraphStore.getState().series[0].id).toBe("s-1");

		store.reorderSeries("s-not-found", 0);
		expect(useGraphStore.getState().series[0].id).toBe("s-1");
	});

	it("should handle batchUpdateAxes with no changes", () => {
		const store = useGraphStore.getState();
		store.batchUpdateAxes({}, {});
		store.batchUpdateAxes(
			{ "axis-1": { min: 0, max: 100 } },
			{ "axis-1": { min: 0, max: 100 } },
		);
		expect(useGraphStore.getState().xAxes[0].min).toBe(0);
	});

	it("should load persisted state correctly", async () => {
		const store = useGraphStore.getState();
		const { persistence } = await import("../../services/persistence");

		vi.mocked(persistence.loadAppState).mockResolvedValueOnce({
			xAxes: [],
			yAxes: [],
			series: [{ id: "s1", hidden: false }],
			axisTitles: { x: "A", y: "B" },
		} as unknown as Awaited<ReturnType<typeof persistence.loadAppState>>);
		vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([
			{ id: "ds1" } as unknown as Dataset,
		]);

		await store.loadPersistedState();
		const state = useGraphStore.getState();
		expect(state.isLoaded).toBe(true);
		expect(state.datasets[0].id).toBe("ds1");
		expect(state.series[0].hidden).toBe(false);
	});

	it("should load datasets if no app state but datasets exist", async () => {
		const store = useGraphStore.getState();
		const { persistence } = await import("../../services/persistence");

		vi.mocked(persistence.loadAppState).mockResolvedValueOnce(null);
		vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([
			{ id: "ds2" } as unknown as Dataset,
		]);

		await store.loadPersistedState();
		const state = useGraphStore.getState();
		expect(state.isLoaded).toBe(true);
		expect(state.datasets[0].id).toBe("ds2");
	});

	it("should handle webgraphy-cleared flag", async () => {
		const store = useGraphStore.getState();
		const { persistence } = await import("../../services/persistence");

		vi.mocked(persistence.loadAppState).mockResolvedValueOnce(null);
		vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([]);
		localStorage.setItem("webgraphy-cleared", "true");

		await store.loadPersistedState();
		const state = useGraphStore.getState();
		expect(state.isLoaded).toBe(true);
		expect(localStorage.getItem("webgraphy-cleared")).toBeNull();
	});

	it("should load demo data if no state and no flag", async () => {
		const store = useGraphStore.getState();
		const { persistence } = await import("../../services/persistence");

		vi.mocked(persistence.loadAppState).mockResolvedValueOnce(null);
		vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([]);

		let loadDemoDataCalled = false;
		const originalLoadDemoData = store.loadDemoData;
		useGraphStore.setState({
			loadDemoData: async () => {
				loadDemoDataCalled = true;
			},
		});

		await useGraphStore.getState().loadPersistedState();
		expect(loadDemoDataCalled).toBe(true);

		useGraphStore.setState({ loadDemoData: originalLoadDemoData });
	});

	it("should load demo data correctly", async () => {
		const store = useGraphStore.getState();
		await store.loadDemoData();
		const state = useGraphStore.getState();
		expect(state.isLoaded).toBe(true);
		expect(state.datasets.length).toBeGreaterThan(0);
	});

	it("should handle addCalculatedColumn errors and validation", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		let result = await store.addCalculatedColumn(
			"ds-not-found",
			"NewVal",
			"Time * 2",
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Dataset not found");

		result = await store.addCalculatedColumn("ds-1", "  ", "Time * 2");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Column name cannot be empty");

		result = await store.addCalculatedColumn("ds-1", "Time", "Time * 2");
		expect(result.success).toBe(false);
		expect(result.error).toBe('Column "Time" already exists');

		result = await store.addCalculatedColumn(
			"ds-1",
			"NewVal",
			"InvalidSyntax(",
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Unknown function or constant");

		// Regression missing column
		result = await store.addCalculatedColumn(
			"ds-1",
			"Reg",
			"linreg([MissingVal])",
		);
		expect(result.success).toBe(false);
		expect(result.error).toContain("Column not found");
	});

	it("should calculate column via worker", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		let result = await store.addCalculatedColumn("ds-1", "NewCol", "[Val] * 2");
		expect(result.success).toBe(true);
		expect(useGraphStore.getState().datasets[0].columns).toContain("NewCol");

		// "[Val] * 3" triggers MockWorker.onerror — the store must surface that
		// as a failed result rather than throwing.
		result = await store.addCalculatedColumn("ds-1", "NewCol2", "[Val] * 3");
		expect(result.success).toBe(false);
		expect(result.error).toBeDefined();

		// "[Val] * 4" returns { type: "error" } via onmessage.
		result = await store.addCalculatedColumn("ds-1", "NewCol3", "[Val] * 4");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Calculation failed");
	});

	it("should create sparse dataset for sparse results", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		const result = await store.addCalculatedColumn(
			"ds-1",
			"SparseCol",
			"avgday([Val])",
		);
		expect(result.success).toBe(true);

		const state = useGraphStore.getState();
		expect(state.datasets.length).toBe(2);
		expect(state.datasets[1].id).toContain("sparse-SparseCol");
		expect(state.datasets[1].columns[1]).toContain("SparseCol");
	});

	it("should handle linreg correctly", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		const result = await store.addCalculatedColumn(
			"ds-1",
			"RegCol",
			"linreg([Val])",
		);
		expect(result.success).toBe(true);
	});

	it("should set correct xMode when no isFloat64 and no categoryLabels", () => {
		const store = useGraphStore.getState();
		const ds: Dataset = {
			id: "ds-test",
			name: "Test",
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 10 },
					data: new Float32Array([0, 10]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds);
		expect(useGraphStore.getState().xAxes[0].xMode).toBe("numeric");
	});

	it("should not error when updateDataset is called with missing column", () => {
		const store = useGraphStore.getState();
		const ds: Dataset = {
			id: "ds-test",
			name: "Test",
			columns: ["Time"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					bounds: { min: 0, max: 10 },
					data: new Float32Array([0, 10]),
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds);
		store.updateDataset("ds-test", { xAxisColumn: "MissingCol" });
		expect(useGraphStore.getState().datasets[0].xAxisColumn).toBe("MissingCol");
	});

	it("should return unchanged state when batchUpdateAxes is provided identical values", () => {
		const store = useGraphStore.getState();
		store.batchUpdateAxes(
			{ "axis-1": { min: 0, max: 100 } },
			{ "axis-1": { min: 0, max: 100 } },
		);
		// Just to hit the !changed return path exactly
		expect(useGraphStore.getState().xAxes[0].min).toBe(0);
	});

	it("should surface Error objects when evaluateFormulaInWorker throws", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockRejectedValueOnce(
			new Error("Force failed"),
		);

		const result = await store.addCalculatedColumn(
			"ds-1",
			"ErrCol",
			"[Val] * 5",
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe("Force failed");
	});

	it("should surface stringified errors when evaluateFormulaInWorker throws non-Error", async () => {
		const store = useGraphStore.getState();
		const ds1: Dataset = {
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
				{
					isFloat64: true,
					refPoint: 0,
					data: new Float32Array([1]),
					bounds: { min: 0, max: 1 },
				},
			],
			rowCount: 1,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		};
		store.addDataset(ds1);

		vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockRejectedValueOnce(
			"String error",
		);

		const result = await store.addCalculatedColumn(
			"ds-1",
			"ErrCol",
			"[Val] * 5",
		);
		expect(result.success).toBe(false);
		expect(result.error).toBe("String error");
	});
});
