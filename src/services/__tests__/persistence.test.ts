import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, Dataset } from "../persistence";

vi.mock("idb", () => ({
	openDB: vi.fn(),
}));

const SAMPLE_APP_STATE: AppState = {
	xAxes: [
		{
			id: "axis-1",
			name: "X",
			min: 0,
			max: 100,
			showGrid: true,
			xMode: "numeric",
		},
	],
	yAxes: [],
	series: [],
	axisTitles: { x: "", y: "" },
	legendVisible: true,
	crosshairVisible: true,
};

describe("persistence", () => {
	let persistence: typeof import("../persistence").persistence;
	let openDBMock: ReturnType<typeof vi.fn>;

	beforeEach(async () => {
		vi.useFakeTimers();
		vi.resetModules();
		vi.clearAllMocks();

		const idbMock = await import("idb");
		openDBMock = vi.mocked(idbMock.openDB);

		const persistenceModule = await import("../persistence");
		persistence = persistenceModule.persistence;
	});

	describe("success path", () => {
		it("should initialize and upgrade db correctly", async () => {
			const mockDb = {
				objectStoreNames: {
					contains: vi.fn().mockReturnValue(false),
				},
				createObjectStore: vi.fn(),
				getAll: vi.fn().mockResolvedValue([]),
			};

			openDBMock.mockImplementationOnce(
				(
					_name: string,
					_version: number,
					options: { upgrade: (db: unknown) => void },
				) => {
					options.upgrade(mockDb);
					return Promise.resolve(mockDb);
				},
			);

			await persistence.getAllDatasets();

			expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith("datasets");
			expect(mockDb.createObjectStore).toHaveBeenCalledWith("datasets", {
				keyPath: "id",
			});
			expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith(
				"app_state",
			);
			expect(mockDb.createObjectStore).toHaveBeenCalledWith("app_state");
		});

		it("should save a dataset (debounced)", async () => {
			const mockDb = {
				put: vi.fn().mockResolvedValue(undefined),
			};
			openDBMock.mockResolvedValue(mockDb);

			const dataset: Dataset = {
				id: "1",
				name: "test",
				columns: [],
				data: [],
				rowCount: 0,
				xAxisColumn: "X",
				xAxisId: "axis-1",
			};
			await persistence.saveDataset(dataset);
			expect(mockDb.put).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(400);
			expect(mockDb.put).toHaveBeenCalledWith("datasets", dataset);
		});

		it("should coalesce repeated saves to the same dataset id", async () => {
			const mockDb = { put: vi.fn().mockResolvedValue(undefined) };
			openDBMock.mockResolvedValue(mockDb);

			const ds = (name: string): Dataset => ({
				id: "1",
				name,
				columns: [],
				data: [],
				rowCount: 0,
				xAxisColumn: "X",
				xAxisId: "axis-1",
			});

			await persistence.saveDataset(ds("a"));
			await persistence.saveDataset(ds("b"));
			await persistence.saveDataset(ds("c"));

			await vi.advanceTimersByTimeAsync(400);
			expect(mockDb.put).toHaveBeenCalledTimes(1);
			expect(mockDb.put).toHaveBeenCalledWith(
				"datasets",
				expect.objectContaining({ name: "c" }),
			);
		});

		it("should load a dataset and fix types", async () => {
			const storedDataset = {
				id: "1",
				name: "test",
				columns: ["Time", "Value"],
				data: [
					{ data: { 0: 1, 1: 2, 2: 3 } },
					{
						data: new Float32Array([1, 2, 3]),
						bounds: { min: 0, max: 1 },
						refPoint: 5,
					},
					{ data: "invalid" },
				],
				rowCount: 0,
			};

			const mockDb = {
				get: vi.fn().mockResolvedValueOnce(storedDataset),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			const dataset = await persistence.loadDataset("1");

			expect(mockDb.get).toHaveBeenCalledWith("datasets", "1");
			expect(dataset).toBeDefined();
			expect(dataset?.data[0].bounds).toEqual({ min: 0, max: 0 });
			expect(dataset?.data[0].data).toBeInstanceOf(Float32Array);
			expect(dataset?.data[0].data.length).toBe(3);
			expect(dataset?.data[0].refPoint).toBe(0);

			expect(dataset?.data[1].bounds).toEqual({ min: 0, max: 1 });
			expect(dataset?.data[1].data).toBeInstanceOf(Float32Array);
			expect(dataset?.data[1].refPoint).toBe(5);

			expect(dataset?.data[2].data).toBeInstanceOf(Float32Array);
			expect(dataset?.data[2].data.length).toBe(0);

			expect(dataset?.xAxisColumn).toBe("Time");
			expect(dataset?.xAxisId).toBe("axis-1");
		});

		it("should return undefined if dataset not found", async () => {
			const mockDb = { get: vi.fn().mockResolvedValueOnce(undefined) };
			openDBMock.mockResolvedValueOnce(mockDb);

			const dataset = await persistence.loadDataset("1");
			expect(dataset).toBeUndefined();
		});

		it("should get all datasets", async () => {
			const storedDatasets = [
				{
					id: "1",
					name: "test1",
					columns: [],
					data: [],
					rowCount: 0,
					xAxisColumn: "X",
					xAxisId: "axis-1",
				},
				{
					id: "2",
					name: "test2",
					columns: [],
					data: [],
					rowCount: 0,
					xAxisColumn: "X",
					xAxisId: "axis-1",
				},
			];

			const mockDb = { getAll: vi.fn().mockResolvedValueOnce(storedDatasets) };
			openDBMock.mockResolvedValueOnce(mockDb);

			const datasets = await persistence.getAllDatasets();
			expect(mockDb.getAll).toHaveBeenCalledWith("datasets");
			expect(datasets.length).toBe(2);
		});

		it("should delete a dataset and cancel pending save", async () => {
			const mockDb = {
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValue(mockDb);

			const dataset: Dataset = {
				id: "1",
				name: "test",
				columns: [],
				data: [],
				rowCount: 0,
				xAxisColumn: "X",
				xAxisId: "axis-1",
			};
			await persistence.saveDataset(dataset);
			await persistence.deleteDataset("1");
			await vi.advanceTimersByTimeAsync(400);

			expect(mockDb.delete).toHaveBeenCalledWith("datasets", "1");
			expect(mockDb.put).not.toHaveBeenCalled();
		});
	});

	describe("AppState persistence (split keys)", () => {
		it("should save app state to viewport + config keys", async () => {
			const mockDb = { put: vi.fn().mockResolvedValue(undefined) };
			openDBMock.mockResolvedValue(mockDb);

			await persistence.saveAppState(SAMPLE_APP_STATE);

			expect(mockDb.put).toHaveBeenCalledTimes(2);
			expect(mockDb.put).toHaveBeenCalledWith(
				"app_state",
				{ xAxes: SAMPLE_APP_STATE.xAxes, yAxes: SAMPLE_APP_STATE.yAxes },
				"webgraphy-viewport",
			);
			expect(mockDb.put).toHaveBeenCalledWith(
				"app_state",
				{
					series: SAMPLE_APP_STATE.series,
					axisTitles: SAMPLE_APP_STATE.axisTitles,
					legendVisible: true,
					crosshairVisible: true,
				},
				"webgraphy-config",
			);
		});

		it("should load app state from split keys", async () => {
			const viewport = {
				xAxes: SAMPLE_APP_STATE.xAxes,
				yAxes: SAMPLE_APP_STATE.yAxes,
			};
			const config = {
				series: SAMPLE_APP_STATE.series,
				axisTitles: SAMPLE_APP_STATE.axisTitles,
				legendVisible: true,
				crosshairVisible: true,
			};
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce(viewport)
					.mockResolvedValueOnce(config)
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			const loaded = await persistence.loadAppState();
			expect(loaded).toEqual(SAMPLE_APP_STATE);
		});

		it("should migrate legacy state when split keys missing", async () => {
			const legacy = {
				xAxes: SAMPLE_APP_STATE.xAxes,
				yAxes: SAMPLE_APP_STATE.yAxes,
				series: SAMPLE_APP_STATE.series,
				axisTitles: SAMPLE_APP_STATE.axisTitles,
			};
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(legacy),
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			};
			openDBMock.mockResolvedValue(mockDb);

			const loaded = await persistence.loadAppState();
			expect(loaded).toEqual({
				...legacy,
				legendVisible: true,
				crosshairVisible: true,
			});
			expect(mockDb.put).toHaveBeenCalledTimes(2);
			expect(mockDb.delete).toHaveBeenCalledWith(
				"app_state",
				"webgraphy-state",
			);
		});

		it("should return null when no state present", async () => {
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			const loaded = await persistence.loadAppState();
			expect(loaded).toBeNull();
		});

		it("should return null on invalid split state", async () => {
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce({ xAxes: [{ id: "axis-1", min: "bad" }] })
					.mockResolvedValueOnce({
						series: [],
						axisTitles: { x: "", y: "" },
						legendVisible: true,
						crosshairVisible: true,
					})
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			try {
				const loaded = await persistence.loadAppState();
				expect(loaded).toBeNull();
			} finally {
				consoleSpy.mockRestore();
			}
		});

		it("should clear all state keys", async () => {
			const mockDb = { delete: vi.fn().mockResolvedValue(undefined) };
			openDBMock.mockResolvedValueOnce(mockDb);

			await persistence.clearAppState();
			expect(mockDb.delete).toHaveBeenCalledWith(
				"app_state",
				"webgraphy-viewport",
			);
			expect(mockDb.delete).toHaveBeenCalledWith(
				"app_state",
				"webgraphy-config",
			);
			expect(mockDb.delete).toHaveBeenCalledWith(
				"app_state",
				"webgraphy-state",
			);
		});
	});

	describe("error handling", () => {
		it("should propagate error when openDB fails (flushed)", async () => {
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockRejectedValue(new Error("Failed to open IndexedDB"));
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			try {
				const persistenceModule = await import("../persistence");
				const localPersistence = persistenceModule.persistence;

				const dataset: Dataset = {
					id: "1",
					name: "test",
					columns: [],
					data: [],
					rowCount: 0,
					xAxisColumn: "X",
					xAxisId: "axis-1",
				};

				await localPersistence.saveDataset(dataset);
				await vi.advanceTimersByTimeAsync(400);
				await vi.runAllTimersAsync();

				expect(consoleSpy).toHaveBeenCalledWith(
					"saveDataset failed",
					{ error: expect.any(Error) },
				);
			} finally {
				consoleSpy.mockRestore();
			}
		});

		it("should propagate errors if db.get fails", async () => {
			const mockDb = {
				objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
				get: vi.fn().mockRejectedValueOnce(new Error("Read failed")),
			};
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockResolvedValueOnce(mockDb);
			const persistenceModule = await import("../persistence");
			const localPersistence = persistenceModule.persistence;

			await expect(localPersistence.loadDataset("1")).rejects.toThrow(
				"Read failed",
			);
		});

		it("should propagate errors if db.getAll fails", async () => {
			const mockDb = {
				objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
				getAll: vi.fn().mockRejectedValueOnce(new Error("Read all failed")),
			};
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockResolvedValueOnce(mockDb);
			const persistenceModule = await import("../persistence");
			const localPersistence = persistenceModule.persistence;

			await expect(localPersistence.getAllDatasets()).rejects.toThrow(
				"Read all failed",
			);
		});

		it("should propagate errors if db.delete fails", async () => {
			const mockDb = {
				objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
				delete: vi.fn().mockRejectedValueOnce(new Error("Delete failed")),
			};
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockResolvedValueOnce(mockDb);
			const persistenceModule = await import("../persistence");
			const localPersistence = persistenceModule.persistence;

			await expect(localPersistence.deleteDataset("1")).rejects.toThrow(
				"Delete failed",
			);
		});

		it("should catch error when clearAppState fails", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const error = new Error("Delete failed");
			const mockDb = {
				delete: vi.fn().mockRejectedValue(error),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			await persistence.clearAppState();

			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to clear state",
				{ error: expect.any(Error) },
			);
			consoleSpy.mockRestore();
		});

		it("should catch error when putAppState fails", async () => {
			const consoleSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const error = new Error("Put failed");
			const mockDb = {
				put: vi.fn().mockRejectedValue(error),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			await persistence.saveViewport({ xAxes: [], yAxes: [] });

			expect(consoleSpy).toHaveBeenCalledWith(
				"Failed to save state",
				{ label: "viewport", error: expect.any(Error) },
			);
			consoleSpy.mockRestore();
		});
	});
});
