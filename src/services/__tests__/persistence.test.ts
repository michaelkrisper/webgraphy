import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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
			expect(mockDb.objectStoreNames.contains).toHaveBeenCalledWith("app_state");
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
			// Old persisted configs carry an axisTitles object from a removed
			// feature — loading must strip it, not fail.
			const config = {
				series: SAMPLE_APP_STATE.series,
				axisTitles: { x: "", y: "" },
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
				axisTitles: { x: "", y: "" },
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
				xAxes: legacy.xAxes,
				yAxes: legacy.yAxes,
				series: legacy.series,
				legendVisible: true,
				crosshairVisible: true,
			});
			expect(mockDb.put).toHaveBeenCalledTimes(2);
			expect(mockDb.delete).toHaveBeenCalledWith("app_state", "webgraphy-state");
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

		it("should drop malformed axes but keep the config", async () => {
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce({ xAxes: [{ id: "axis-1", min: "bad" }] })
					.mockResolvedValueOnce({
						series: [],
						legendVisible: false,
						crosshairVisible: true,
					})
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const loaded = await persistence.loadAppState();
				expect(loaded).toEqual({
					xAxes: [],
					yAxes: [],
					series: [],
					legendVisible: false,
					crosshairVisible: true,
				});
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("should repair non-finite axis ranges instead of losing all series", async () => {
			// An all-NaN x column used to persist {Infinity, -Infinity} bounds,
			// which made the viewport schema reject the whole saved state.
			const series = [
				{
					id: "s1",
					sourceId: "ds1",
					name: "S1",
					yColumn: "y",
					yAxisId: "axis-1",
					pointStyle: "none",
					pointColor: "#000",
					lineStyle: "solid",
					lineColor: "#000",
				},
			];
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce({
						xAxes: [{ ...SAMPLE_APP_STATE.xAxes[0], min: Infinity, max: -Infinity }],
						yAxes: [
							{
								id: "axis-1",
								name: "Y",
								min: Number.NaN,
								max: 5,
								position: "left",
								color: "#000",
								showGrid: true,
							},
						],
					})
					.mockResolvedValueOnce({
						series,
						legendVisible: true,
						crosshairVisible: true,
					})
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const loaded = await persistence.loadAppState();
				expect(loaded?.series).toEqual(series);
				expect(loaded?.xAxes).toEqual([
					{ ...SAMPLE_APP_STATE.xAxes[0], min: 0, max: 100 },
				]);
				expect(loaded?.yAxes[0]).toMatchObject({ id: "axis-1", min: 0, max: 100 });
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("should return null on invalid split config", async () => {
			const mockDb = {
				get: vi
					.fn()
					.mockResolvedValueOnce({ xAxes: [], yAxes: [] })
					.mockResolvedValueOnce({ series: "bad" })
					.mockResolvedValueOnce(undefined),
			};
			openDBMock.mockResolvedValueOnce(mockDb);
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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
			expect(mockDb.delete).toHaveBeenCalledWith("app_state", "webgraphy-config");
			expect(mockDb.delete).toHaveBeenCalledWith("app_state", "webgraphy-state");
		});
	});

	describe("error handling", () => {
		it("should propagate error when openDB fails (flushed)", async () => {
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockRejectedValue(new Error("Failed to open IndexedDB"));
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
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

				expect(consoleSpy).toHaveBeenCalledWith("saveDataset failed", {
					error: expect.any(Error),
				});
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

		it("toasts instead of rejecting when db.delete fails", async () => {
			// Callers do not await deleteDataset; a rejection would surface as
			// an unhandled promise rejection.
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const mockDb = {
				objectStoreNames: { contains: vi.fn().mockReturnValue(true) },
				delete: vi.fn().mockRejectedValueOnce(new Error("Delete failed")),
			};
			vi.resetModules();
			const idbMock = await import("idb");
			const openDBMockInner = vi.mocked(idbMock.openDB);
			openDBMockInner.mockResolvedValueOnce(mockDb);
			const persistenceModule = await import("../persistence");
			const { useNotificationStore } = await import(
				"../../store/useNotificationStore"
			);
			useNotificationStore.setState({ notifications: [] });

			try {
				await expect(
					persistenceModule.persistence.deleteDataset("1"),
				).resolves.toBeUndefined();
				expect(consoleSpy).toHaveBeenCalledWith("deleteDataset failed", {
					id: "1",
					error: expect.any(Error),
				});
				expect(useNotificationStore.getState().notifications).toEqual([
					expect.objectContaining({ kind: "error" }),
				]);
			} finally {
				consoleSpy.mockRestore();
			}
		});

		it("should catch error when clearAppState fails", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const error = new Error("Delete failed");
			const mockDb = {
				delete: vi.fn().mockRejectedValue(error),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			await persistence.clearAppState();

			expect(consoleSpy).toHaveBeenCalledWith("Failed to clear state", {
				error: expect.any(Error),
			});
			consoleSpy.mockRestore();
		});

		it("should catch error when putAppState fails", async () => {
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const error = new Error("Put failed");
			const mockDb = {
				put: vi.fn().mockRejectedValue(error),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			await persistence.saveViewport({ xAxes: [], yAxes: [] });

			expect(consoleSpy).toHaveBeenCalledWith("Failed to save state", {
				label: "viewport",
				error: expect.any(Error),
			});
			consoleSpy.mockRestore();
		});

		it("should reject when loadAppState cannot read storage", async () => {
			// Resolving null here would make the store load demo data and
			// overwrite the saved state it failed to read.
			const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const error = new Error("Load failed");
			const mockDb = {
				get: vi.fn().mockRejectedValue(error),
			};
			openDBMock.mockResolvedValueOnce(mockDb);

			await expect(persistence.loadAppState()).rejects.toThrow("Load failed");
			expect(consoleSpy).toHaveBeenCalledWith("Failed to load state", {
				error: expect.any(Error),
			});
			consoleSpy.mockRestore();
		});
	});

	describe("robustness", () => {
		let notifications: () => {
			kind: string;
			message: string;
			action?: { label: string; onAction: () => void };
		}[];
		let errorSpy: ReturnType<typeof vi.spyOn>;

		const quotaError = () =>
			Object.assign(new Error("quota"), { name: "QuotaExceededError" });
		const ds = (id: string, name = id): Dataset => ({
			id,
			name,
			columns: [],
			data: [],
			rowCount: 0,
			xAxisColumn: "X",
			xAxisId: "axis-1",
		});

		beforeEach(async () => {
			const { useNotificationStore } = await import(
				"../../store/useNotificationStore"
			);
			useNotificationStore.setState({ notifications: [] });
			notifications = () => useNotificationStore.getState().notifications;
			errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
		});

		afterEach(() => {
			errorSpy.mockRestore();
			Reflect.deleteProperty(navigator, "storage");
		});

		it("toasts a quota error naming the dataset that was not saved", async () => {
			openDBMock.mockResolvedValue({
				put: vi.fn().mockRejectedValue(quotaError()),
			});

			await persistence.saveDataset(ds("1", "Big run"));
			await vi.advanceTimersByTimeAsync(400);

			expect(notifications()).toEqual([
				expect.objectContaining({
					kind: "error",
					message:
						'Browser storage is full — dataset "Big run" was not saved. Free space or remove datasets.',
				}),
			]);
		});

		it("toasts a generic error for non-quota dataset failures", async () => {
			openDBMock.mockResolvedValue({
				put: vi.fn().mockRejectedValue(new Error("boom")),
			});

			await persistence.saveDataset(ds("1", "Run"));
			await vi.advanceTimersByTimeAsync(400);

			expect(notifications().map((n) => n.message)).toEqual([
				'Could not save dataset "Run" to browser storage.',
			]);
		});

		it("collapses repeated settings-save failures into one toast", async () => {
			openDBMock.mockResolvedValue({
				put: vi.fn().mockRejectedValue(quotaError()),
			});

			await persistence.saveAppState(SAMPLE_APP_STATE);
			await persistence.saveViewport({ xAxes: [], yAxes: [] });

			expect(notifications().map((n) => n.message)).toEqual([
				"Browser storage is full — chart settings were not saved. Free space or remove datasets.",
			]);
		});

		it("flushAll writes each dataset separately so one failure spares the rest", async () => {
			const put = vi.fn((_store: string, value: Dataset) =>
				value.id === "big" ? Promise.reject(quotaError()) : Promise.resolve(),
			);
			openDBMock.mockResolvedValue({ put });

			await persistence.saveDataset(ds("a"));
			await persistence.saveDataset(ds("big", "Huge"));
			await persistence.saveDataset(ds("c"));
			await persistence.flushAll();

			expect(put).toHaveBeenCalledTimes(3);
			for (const id of ["a", "big", "c"])
				expect(put).toHaveBeenCalledWith(
					"datasets",
					expect.objectContaining({ id }),
				);
			expect(notifications().map((n) => n.message)).toEqual([
				'Browser storage is full — dataset "Huge" was not saved. Free space or remove datasets.',
			]);
			// Nothing is left pending for the debounce timers to re-save.
			await vi.advanceTimersByTimeAsync(400);
			expect(put).toHaveBeenCalledTimes(3);
		});

		it("requests persistent storage once, after the first successful save", async () => {
			const persist = vi.fn().mockResolvedValue(true);
			Object.defineProperty(navigator, "storage", {
				value: { persist },
				configurable: true,
			});
			const put = vi
				.fn()
				.mockRejectedValueOnce(new Error("boom"))
				.mockResolvedValue(undefined);
			openDBMock.mockResolvedValue({ put });

			await persistence.saveDataset(ds("1"));
			await vi.advanceTimersByTimeAsync(400);
			expect(persist).not.toHaveBeenCalled();

			await persistence.saveDataset(ds("1"));
			await vi.advanceTimersByTimeAsync(400);
			await persistence.saveDataset(ds("2"));
			await persistence.flushAll();
			expect(persist).toHaveBeenCalledTimes(1);
		});

		it("reports storage usage and persistence state", async () => {
			Object.defineProperty(navigator, "storage", {
				value: {
					estimate: vi.fn().mockResolvedValue({ usage: 10, quota: 100 }),
					persisted: vi.fn().mockResolvedValue(true),
				},
				configurable: true,
			});
			await expect(persistence.getStorageInfo()).resolves.toEqual({
				usage: 10,
				quota: 100,
				persisted: true,
			});
		});

		it("returns null storage info when the API is missing", async () => {
			await expect(persistence.getStorageInfo()).resolves.toBeNull();
		});

		it("notifies storage listeners after a successful dataset write", async () => {
			const { onStorageChange } = await import("../persistence");
			openDBMock.mockResolvedValue({ put: vi.fn().mockResolvedValue(undefined) });
			const listener = vi.fn();
			const off = onStorageChange(listener);

			await persistence.saveDataset(ds("1"));
			await vi.advanceTimersByTimeAsync(400);
			expect(listener).toHaveBeenCalledTimes(1);

			off();
			await persistence.saveDataset(ds("1"));
			await vi.advanceTimersByTimeAsync(400);
			expect(listener).toHaveBeenCalledTimes(1);
		});

		it("disable() stops all writes", async () => {
			const mockDb = {
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			};
			openDBMock.mockResolvedValue(mockDb);

			persistence.disable();
			expect(persistence.isEnabled()).toBe(false);
			await persistence.saveDataset(ds("1"));
			await persistence.flushAll();
			await persistence.saveAppState(SAMPLE_APP_STATE);
			await persistence.deleteDataset("1");
			await persistence.clearAppState();
			await vi.advanceTimersByTimeAsync(400);

			expect(mockDb.put).not.toHaveBeenCalled();
			expect(mockDb.delete).not.toHaveBeenCalled();
		});

		it("reuses one connection for concurrent callers", async () => {
			openDBMock.mockResolvedValue({ getAll: vi.fn().mockResolvedValue([]) });
			await Promise.all([
				persistence.getAllDatasets(),
				persistence.getAllDatasets(),
			]);
			expect(openDBMock).toHaveBeenCalledTimes(1);
		});

		type OpenHandlers = {
			blocked: () => void;
			blocking: (c: number, b: number | null, e: { target: unknown }) => void;
			terminated: () => void;
		};
		const captureHandlers = () => {
			const handlers: Partial<OpenHandlers> = {};
			const mockDb = {
				put: vi.fn().mockResolvedValue(undefined),
				getAll: vi.fn().mockResolvedValue([]),
			};
			openDBMock.mockImplementation(
				(_n: string, _v: number, options: OpenHandlers) => {
					Object.assign(handlers, options);
					return Promise.resolve(mockDb);
				},
			);
			return { handlers: handlers as OpenHandlers, mockDb };
		};

		it("closes the connection and offers a reload when another tab upgrades", async () => {
			const { handlers, mockDb } = captureHandlers();
			await persistence.getAllDatasets();

			const close = vi.fn();
			handlers.blocking(2, 3, { target: { close } });

			expect(close).toHaveBeenCalledTimes(1);
			expect(persistence.isEnabled()).toBe(false);
			const [toast] = notifications();
			expect(toast.message).toBe(
				"WebGraphy was updated in another tab — reload to continue.",
			);
			expect(toast.action?.label).toBe("Reload");

			await persistence.saveAppState(SAMPLE_APP_STATE);
			expect(mockDb.put).not.toHaveBeenCalled();
		});

		it("informs the user when an older tab blocks the upgrade", async () => {
			const { handlers } = captureHandlers();
			await persistence.getAllDatasets();
			handlers.blocked();
			expect(notifications()[0].kind).toBe("info");
		});

		it("reopens the database after the connection is terminated", async () => {
			const { handlers } = captureHandlers();
			await persistence.getAllDatasets();
			await persistence.getAllDatasets();
			expect(openDBMock).toHaveBeenCalledTimes(1);

			handlers.terminated();
			await persistence.getAllDatasets();
			expect(openDBMock).toHaveBeenCalledTimes(2);
		});

		it("retries opening after a failed open", async () => {
			openDBMock
				.mockRejectedValueOnce(new Error("denied"))
				.mockResolvedValue({ getAll: vi.fn().mockResolvedValue([]) });
			await expect(persistence.getAllDatasets()).rejects.toThrow("denied");
			await expect(persistence.getAllDatasets()).resolves.toEqual([]);
		});
	});
});
