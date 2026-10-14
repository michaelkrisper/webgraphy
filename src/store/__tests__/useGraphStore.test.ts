import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../../services/persistence";
import { useGraphStore } from "../useGraphStore";
import { useNotificationStore } from "../useNotificationStore";
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
		// The debounced savers fire on a timer; on a slow run that lands while
		// this file is still executing and would throw on a missing method.
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		loadAppState: vi.fn().mockResolvedValue(null),
		clearAppState: vi.fn().mockResolvedValue(undefined),
		disable: vi.fn(),
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

		store.batchUpdateAxes(
			{ "axis-1": { min: 10, max: 20 } },
			{ "axis-1": { min: 30, max: 40 } },
		);
		expect(useGraphStore.getState().xAxes[0].min).toBe(10);
		expect(useGraphStore.getState().yAxes[0].min).toBe(30);
	});

	it("should reorder series", () => {
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

		store.reorderSeries("s-2", 0);
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

	it("should ignore reorder of an unknown series", () => {
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
		} as unknown as Awaited<ReturnType<typeof persistence.loadAppState>>);
		vi
			.mocked(persistence.getAllDatasets)
			.mockResolvedValueOnce([{ id: "ds1" } as unknown as Dataset]);

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
		vi
			.mocked(persistence.getAllDatasets)
			.mockResolvedValueOnce([{ id: "ds2" } as unknown as Dataset]);

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

	it("falls back to demo data without persistence when storage cannot be read", async () => {
		const { persistence } = await import("../../services/persistence");
		vi
			.mocked(persistence.loadAppState)
			.mockRejectedValueOnce(new Error("IndexedDB unavailable"));
		useGraphStore.setState({ isLoaded: false });
		useNotificationStore.setState({ notifications: [] });
		const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		const originalLoadDemoData = useGraphStore.getState().loadDemoData;
		const loadDemoData = vi.fn().mockRejectedValue(new Error("demo failed"));
		useGraphStore.setState({ loadDemoData });
		try {
			await expect(
				useGraphStore.getState().loadPersistedState(),
			).resolves.toBeUndefined();

			expect(persistence.disable).toHaveBeenCalled();
			expect(loadDemoData).toHaveBeenCalled();
			// Even a failing fallback must leave the UI usable.
			expect(useGraphStore.getState().isLoaded).toBe(true);
			expect(useNotificationStore.getState().notifications).toEqual([
				expect.objectContaining({
					kind: "error",
					message:
						"Could not open browser storage — showing demo data. Changes in this session won't be saved.",
				}),
			]);
		} finally {
			errorSpy.mockRestore();
			useGraphStore.setState({ loadDemoData: originalLoadDemoData });
		}
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

		result = await store.addCalculatedColumn("ds-1", "NewVal", "InvalidSyntax(");
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

		vi
			.spyOn(formulaClient, "evaluateFormulaInWorker")
			.mockRejectedValueOnce(new Error("Force failed"));

		const result = await store.addCalculatedColumn("ds-1", "ErrCol", "[Val] * 5");
		expect(result.success).toBe(false);
		expect(result.error).toBe("Force failed");
	});

	describe("non-finite axis bounds", () => {
		const nanColumn = {
			isFloat64: false,
			refPoint: 0,
			bounds: { min: Infinity, max: -Infinity },
			data: new Float32Array([NaN, NaN]),
		};
		const finiteColumn = {
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 5, max: 7 },
			data: new Float32Array([5, 7]),
		};

		it("keeps a finite x range when the x column is all-NaN", () => {
			useGraphStore.getState().addDataset({
				id: "ds-nan",
				name: "NaN",
				columns: ["X", "Y"],
				data: [nanColumn, finiteColumn],
				rowCount: 2,
				xAxisColumn: "X",
				xAxisId: "axis-1",
			});
			const axis = useGraphStore.getState().xAxes[0];
			expect(axis).toMatchObject({ min: 0, max: 100 });
		});

		it("keeps a finite x range when switching to an all-NaN x column", () => {
			const store = useGraphStore.getState();
			store.addDataset({
				id: "ds-nan",
				name: "NaN",
				columns: ["Y", "X"],
				data: [finiteColumn, nanColumn],
				rowCount: 2,
				xAxisColumn: "Y",
				xAxisId: "axis-1",
			});
			expect(useGraphStore.getState().xAxes[0]).toMatchObject({ min: 5, max: 7 });
			store.updateDataset("ds-nan", { xAxisColumn: "X" });
			const axis = useGraphStore.getState().xAxes[0];
			expect(Number.isFinite(axis.min) && Number.isFinite(axis.max)).toBe(true);
		});

		it("ignores non-finite ranges in batchUpdateAxes", () => {
			useGraphStore
				.getState()
				.batchUpdateAxes(
					{ "axis-1": { min: -Infinity, max: 3 }, "axis-2": { min: 1, max: 2 } },
					{ "axis-1": { min: NaN, max: NaN } },
				);
			const { xAxes, yAxes } = useGraphStore.getState();
			expect(xAxes[0]).toMatchObject({ min: 0, max: 100 });
			expect(xAxes[1]).toMatchObject({ min: 1, max: 2 });
			expect(yAxes[0]).toMatchObject({ min: 0, max: 100 });
		});

		it("refills axis slots dropped by persistence on load", async () => {
			const { persistence } = await import("../../services/persistence");
			vi.mocked(persistence.loadAppState).mockResolvedValueOnce({
				xAxes: [
					{
						id: "axis-2",
						name: "Kept",
						min: 1,
						max: 2,
						showGrid: false,
						xMode: "numeric",
					},
				],
				yAxes: [],
				series: [],
				legendVisible: true,
				crosshairVisible: true,
			});
			vi.mocked(persistence.getAllDatasets).mockResolvedValueOnce([]);
			await useGraphStore.getState().loadPersistedState();
			const { xAxes, yAxes } = useGraphStore.getState();
			expect(xAxes).toHaveLength(9);
			expect(yAxes).toHaveLength(9);
			expect(xAxes.find((a) => a.id === "axis-2")?.name).toBe("Kept");
		});
	});

	describe("addCalculatedColumn races", () => {
		afterEach(() => {
			vi.restoreAllMocks();
		});

		const makeDataset = (): Dataset => ({
			id: "ds-1",
			name: "D1",
			columns: ["Time", "Val"],
			data: [
				{
					isFloat64: false,
					refPoint: 0,
					data: new Float32Array([1, 2]),
					bounds: { min: 1, max: 2 },
				},
				{
					isFloat64: false,
					refPoint: 0,
					data: new Float32Array([3, 4]),
					bounds: { min: 3, max: 4 },
				},
			],
			rowCount: 2,
			xAxisColumn: "Time",
			xAxisId: "axis-1",
		});
		const column = () => ({
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 1 },
			data: new Float32Array([0, 1]),
		});

		/** Holds every worker request until the test resolves it. */
		const deferWorker = () => {
			const pending: (() => void)[] = [];
			vi.spyOn(formulaClient, "evaluateFormulaInWorker").mockImplementation(
				(params) =>
					new Promise((resolve) => {
						pending.push(() =>
							resolve(
								params.formula.startsWith("avgday")
									? {
											type: "success",
											newColumn: column(),
											sparseXColumn: column(),
										}
									: { type: "success", newColumn: column() },
							),
						);
					}),
			);
			return pending;
		};

		it("does not resurrect a dataset removed during compute", async () => {
			const { persistence } = await import("../../services/persistence");
			const pending = deferWorker();
			const store = useGraphStore.getState();
			store.addDataset(makeDataset());
			const p = store.addCalculatedColumn("ds-1", "C", "[Val] * 2");
			store.removeDataset("ds-1");
			vi.mocked(persistence.saveDataset).mockClear();
			pending[0]();
			const result = await p;
			expect(result.success).toBe(false);
			expect(useGraphStore.getState().datasets).toHaveLength(0);
			expect(persistence.saveDataset).not.toHaveBeenCalled();
		});

		it("does not add an orphan sparse dataset after the parent is removed", async () => {
			const pending = deferWorker();
			const store = useGraphStore.getState();
			store.addDataset(makeDataset());
			const p = store.addCalculatedColumn("ds-1", "S", "avgday([Val])");
			store.removeDataset("ds-1");
			pending[0]();
			expect((await p).success).toBe(false);
			expect(useGraphStore.getState().datasets).toHaveLength(0);
		});

		it("keeps both columns from overlapping adds and a concurrent rename", async () => {
			const pending = deferWorker();
			const store = useGraphStore.getState();
			store.addDataset(makeDataset());
			const p1 = store.addCalculatedColumn("ds-1", "A", "[Val] * 2");
			const p2 = store.addCalculatedColumn("ds-1", "B", "[Val] * 3");
			store.renameColumn("ds-1", "Val", "Value");
			pending[0]();
			pending[1]();
			expect((await p1).success).toBe(true);
			expect((await p2).success).toBe(true);
			expect(useGraphStore.getState().datasets[0].columns).toEqual([
				"Time",
				"Value",
				"A",
				"B",
			]);
		});

		it("rejects a duplicate name that appeared during compute", async () => {
			const pending = deferWorker();
			const store = useGraphStore.getState();
			store.addDataset(makeDataset());
			const p1 = store.addCalculatedColumn("ds-1", "A", "[Val] * 2");
			const p2 = store.addCalculatedColumn("ds-1", "A", "[Val] * 3");
			pending[0]();
			pending[1]();
			expect((await p1).success).toBe(true);
			const r2 = await p2;
			expect(r2.success).toBe(false);
			expect(r2.error).toBe('Column "A" already exists');
			expect(
				useGraphStore.getState().datasets[0].columns.filter((c) => c === "A"),
			).toHaveLength(1);
		});
	});

	it.each(["linreg([Val])*2", "polyreg([Val], 2.5)", "linreg([Val]) + 1"])(
		"rejects %s before it reaches the worker",
		async (formula) => {
			const spy = vi.spyOn(formulaClient, "evaluateFormulaInWorker");
			spy.mockClear();
			const store = useGraphStore.getState();
			store.addDataset({
				id: "ds-1",
				name: "D1",
				columns: ["Time", "Val"],
				data: [
					{
						isFloat64: false,
						refPoint: 0,
						data: new Float32Array([1]),
						bounds: { min: 0, max: 1 },
					},
					{
						isFloat64: false,
						refPoint: 0,
						data: new Float32Array([1]),
						bounds: { min: 0, max: 1 },
					},
				],
				rowCount: 1,
				xAxisColumn: "Time",
				xAxisId: "axis-1",
			});
			const result = await store.addCalculatedColumn("ds-1", "R", formula);
			expect(result.success).toBe(false);
			expect(result.error).toBeTruthy();
			expect(spy).not.toHaveBeenCalled();
		},
	);

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

		vi
			.spyOn(formulaClient, "evaluateFormulaInWorker")
			.mockRejectedValueOnce("String error");

		const result = await store.addCalculatedColumn("ds-1", "ErrCol", "[Val] * 5");
		expect(result.success).toBe(false);
		expect(result.error).toBe("String error");
	});
});
