import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppState, Dataset } from "../persistence";

vi.mock("idb", () => ({
	openDB: vi.fn(),
	deleteDB: vi.fn(),
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
			scale: "linear",
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

		it("marks the errors it toasted so the global handler stays quiet", async () => {
			const error = quotaError();
			openDBMock.mockResolvedValue({ put: vi.fn().mockRejectedValue(error) });

			await persistence.saveViewport({ xAxes: [], yAxes: [] });

			const { describeUncaught } = await import("../globalErrors");
			expect(describeUncaught(error)).toBeNull();
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

	describe("axis scale", () => {
		const loadViewport = async (viewport: unknown) => {
			openDBMock.mockResolvedValueOnce({
				get: vi
					.fn()
					.mockResolvedValueOnce(viewport)
					.mockResolvedValueOnce({
						series: [],
						legendVisible: true,
						crosshairVisible: true,
					})
					.mockResolvedValueOnce(undefined),
			});
			return persistence.loadAppState();
		};
		const yAxis = {
			id: "axis-1",
			name: "Y",
			min: 0,
			max: 5,
			position: "left",
			color: "#000",
			showGrid: true,
		};

		it("defaults axes saved before log scales existed to linear", async () => {
			const legacyX = {
				id: "axis-1",
				name: "X",
				min: 0,
				max: 100,
				showGrid: true,
				xMode: "numeric",
			};
			const loaded = await loadViewport({ xAxes: [legacyX], yAxes: [yAxis] });
			expect(loaded?.xAxes[0]).toEqual({ ...legacyX, scale: "linear" });
			expect(loaded?.yAxes[0]).toEqual({ ...yAxis, scale: "linear" });
		});

		it("keeps a saved log scale", async () => {
			const loaded = await loadViewport({
				xAxes: [{ ...SAMPLE_APP_STATE.xAxes[0], min: 1, scale: "log" }],
				yAxes: [{ ...yAxis, min: 0.1, scale: "log" }],
			});
			expect(loaded?.xAxes[0]).toMatchObject({ min: 1, scale: "log" });
			expect(loaded?.yAxes[0]).toMatchObject({ min: 0.1, scale: "log" });
		});

		it("repairs a log axis whose range reaches 0 or below", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const loaded = await loadViewport({
					xAxes: SAMPLE_APP_STATE.xAxes,
					yAxes: [{ ...yAxis, min: -3, scale: "log" }],
				});
				expect(loaded?.yAxes[0]).toMatchObject({
					scale: "log",
					min: 1,
					max: 100,
				});
				expect(loaded?.xAxes[0]).toMatchObject({ min: 0, scale: "linear" });
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("keeps a custom y title and loads axes saved without one", async () => {
			const loaded = await loadViewport({
				xAxes: SAMPLE_APP_STATE.xAxes,
				yAxes: [
					{ ...yAxis, title: "Flow" },
					{ ...yAxis, id: "axis-2" },
				],
			});
			expect(loaded?.yAxes[0].title).toBe("Flow");
			expect(loaded?.yAxes[1]).not.toHaveProperty("title");
		});

		it("rejects a y title that is not a string", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const loaded = await loadViewport({
					xAxes: SAMPLE_APP_STATE.xAxes,
					yAxes: [{ ...yAxis, title: 42 }],
				});
				expect(loaded?.yAxes).toEqual([]);
			} finally {
				warnSpy.mockRestore();
			}
		});

		it("rejects unknown scale values", async () => {
			const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
			try {
				const loaded = await loadViewport({
					xAxes: SAMPLE_APP_STATE.xAxes,
					yAxes: [{ ...yAxis, scale: "symlog" }],
				});
				expect(loaded?.yAxes).toEqual([]);
			} finally {
				warnSpy.mockRestore();
			}
		});
	});

	describe("resetAll", () => {
		const ds = (id: string): Dataset => ({
			id,
			name: id,
			columns: [],
			data: [],
			rowCount: 0,
			xAxisColumn: "X",
			xAxisId: "axis-1",
		});
		let deleteDBMock: ReturnType<typeof vi.fn>;

		beforeEach(async () => {
			deleteDBMock = vi.mocked((await import("idb")).deleteDB);
			deleteDBMock.mockResolvedValue(undefined);
		});

		afterEach(() => {
			localStorage.clear();
		});

		it("deletes the database and WebGraphy's localStorage keys only", async () => {
			const mockDb = {
				getAll: vi.fn().mockResolvedValue([]),
				put: vi.fn().mockResolvedValue(undefined),
				close: vi.fn(),
			};
			openDBMock.mockResolvedValue(mockDb);
			await persistence.getAllDatasets();
			for (const key of [
				"webgraphy-export-options",
				"webgraphy-cleared",
				"theme",
				"skipgc",
				"other-app",
			]) {
				localStorage.setItem(key, "x");
			}
			await persistence.saveDataset(ds("pending"));

			await persistence.resetAll();

			// Its own connection would otherwise block the deletion.
			expect(mockDb.close).toHaveBeenCalled();
			expect(deleteDBMock).toHaveBeenCalledWith(
				"webgraphy-db",
				expect.objectContaining({ blocked: expect.any(Function) }),
			);
			expect(localStorage.getItem("webgraphy-export-options")).toBeNull();
			expect(localStorage.getItem("webgraphy-cleared")).toBeNull();
			expect(localStorage.getItem("theme")).toBeNull();
			// The analytics opt-out and other apps' keys survive.
			expect(localStorage.getItem("skipgc")).toBe("x");
			expect(localStorage.getItem("other-app")).toBe("x");

			// Nothing may recreate the database before the reload.
			expect(persistence.isEnabled()).toBe(false);
			await vi.advanceTimersByTimeAsync(400);
			await persistence.saveAppState(SAMPLE_APP_STATE);
			expect(mockDb.put).not.toHaveBeenCalled();
		});

		it("tells the caller while another tab blocks the deletion", async () => {
			deleteDBMock.mockImplementation(
				async (_name: string, opts?: { blocked?: () => void }) => {
					opts?.blocked?.();
				},
			);
			const onBlocked = vi.fn();
			await persistence.resetAll(onBlocked);
			expect(onBlocked).toHaveBeenCalledTimes(1);
			// Without a listener a blocked deletion is just waited out.
			await persistence.resetAll();
		});

		it("survives a connection that never opened, and rejects a failed deletion", async () => {
			openDBMock.mockRejectedValue(new Error("denied"));
			const reading = persistence.getAllDatasets();
			reading.catch(() => {});
			deleteDBMock.mockRejectedValue(new Error("delete failed"));

			await expect(persistence.resetAll()).rejects.toThrow("delete failed");
		});
	});

	describe("writer lock across tabs", () => {
		type LockCallback = (lock: Lock | null) => unknown;
		type Toast = {
			kind: string;
			message: string;
			durationMs: number;
			action?: { label: string; onAction: () => void };
		};
		const READ_ONLY =
			"WebGraphy is open in another tab. Changes in this tab are not saved.";
		const WRITER_GONE = "WebGraphy was closed in the other tab.";
		const ds = (id: string): Dataset => ({
			id,
			name: id,
			columns: [],
			data: [],
			rowCount: 0,
			xAxisColumn: "X",
			xAxisId: "axis-1",
		});
		const settle = () => vi.advanceTimersByTimeAsync(0);

		/**
		 * The Web Locks of one origin, shared by the tabs a test opens: one
		 * exclusive lock, granted asynchronously in request order and held until
		 * the callback's promise settles, with `ifAvailable` and abort signals as
		 * specified. Closing a tab releases what it holds and drops its requests.
		 */
		function makeLockBroker() {
			interface Req {
				tab: number;
				cb: LockCallback;
				resolve: (value: unknown) => void;
				reject: (reason: unknown) => void;
			}
			let held: { tab: number } | null = null;
			const queue: Req[] = [];
			const lock = { name: "webgraphy-writer", mode: "exclusive" } as Lock;
			const grantNext = () => {
				const next = queue.shift();
				if (next) grant(next);
			};
			const grant = (req: Req) => {
				const hold = { tab: req.tab };
				held = hold;
				Promise.resolve()
					.then(() => req.cb(lock))
					.then(req.resolve, req.reject)
					.finally(() => {
						if (held !== hold) return;
						held = null;
						grantNext();
					});
			};
			return {
				holder: () => held?.tab ?? null,
				tab(tab: number): LockManager {
					const request = (_name: string, a: unknown, b?: unknown) =>
						new Promise((resolve, reject) => {
							const cb = (typeof a === "function" ? a : b) as LockCallback;
							const opts = (typeof a === "function" ? {} : a) as {
								ifAvailable?: boolean;
								signal?: AbortSignal;
							};
							const req = { tab, cb, resolve, reject };
							if (!held && queue.length === 0) return grant(req);
							if (opts.ifAvailable) {
								Promise.resolve()
									.then(() => cb(null))
									.then(resolve, reject);
								return;
							}
							queue.push(req);
							opts.signal?.addEventListener("abort", () => {
								const i = queue.indexOf(req);
								if (i < 0) return;
								queue.splice(i, 1);
								reject(opts.signal?.reason);
							});
						});
					return { request } as unknown as LockManager;
				},
				close(tab: number) {
					for (let i = queue.length - 1; i >= 0; i--) {
						if (queue[i].tab === tab) queue.splice(i, 1);
					}
					if (held?.tab !== tab) return;
					held = null;
					grantNext();
				},
			};
		}

		/** Loads the module as a fresh tab whose navigator.locks is `locks`. */
		async function openTab(locks: LockManager) {
			Object.defineProperty(navigator, "locks", {
				value: locks,
				configurable: true,
			});
			vi.resetModules();
			const openDB = vi.mocked((await import("idb")).openDB);
			const { useNotificationStore } = await import(
				"../../store/useNotificationStore"
			);
			useNotificationStore.setState({ notifications: [] });
			const tab = (await import("../persistence")).persistence;
			const db = {
				put: vi.fn().mockResolvedValue(undefined),
				delete: vi.fn().mockResolvedValue(undefined),
			};
			openDB.mockResolvedValue(db as never);
			const toasts = () =>
				useNotificationStore.getState().notifications as unknown as Toast[];
			return { persistence: tab, db, toasts };
		}

		afterEach(() => {
			Reflect.deleteProperty(navigator, "locks");
			Reflect.deleteProperty(document, "visibilityState");
		});

		it("holds the lock in the first tab, which keeps saving", async () => {
			const broker = makeLockBroker();
			const a = await openTab(broker.tab(1));
			await settle();
			expect(broker.holder()).toBe(1);

			await a.persistence.saveViewport({ xAxes: [], yAxes: [] });
			expect(a.db.put).toHaveBeenCalledTimes(1);
			expect(a.persistence.isEnabled()).toBe(true);
			expect(a.toasts()).toEqual([]);

			// Hiding the page still flushes a pending dataset at once.
			await a.persistence.saveDataset(ds("1"));
			Object.defineProperty(document, "visibilityState", {
				value: "hidden",
				configurable: true,
			});
			document.dispatchEvent(new Event("visibilitychange"));
			await vi.advanceTimersByTimeAsync(1);
			expect(a.db.put).toHaveBeenCalledWith("datasets", ds("1"));
		});

		it("runs read-only beside the writer and offers a reload once it is gone", async () => {
			const broker = makeLockBroker();
			await openTab(broker.tab(1));
			const b = await openTab(broker.tab(2));
			await vi.advanceTimersByTimeAsync(1500);
			expect(b.persistence.isEnabled()).toBe(false);
			expect(b.toasts()).toEqual([
				expect.objectContaining({
					kind: "info",
					message: READ_ONLY,
					durationMs: Infinity,
				}),
			]);

			await b.persistence.saveAppState(SAMPLE_APP_STATE);
			await b.persistence.saveDataset(ds("1"));
			await b.persistence.flushAll();
			await b.persistence.deleteDataset("1");
			await b.persistence.clearAppState();
			expect(b.db.put).not.toHaveBeenCalled();
			expect(b.db.delete).not.toHaveBeenCalled();

			broker.close(1);
			await settle();
			// The read-only tab let go of the lock at once...
			expect(broker.holder()).toBeNull();
			// ...and offers the reload once no reloading writer claimed it.
			await vi.advanceTimersByTimeAsync(1500);
			expect(b.toasts()).toHaveLength(1);
			const [toast] = b.toasts();
			expect(toast.message).toBe(WRITER_GONE);
			expect(toast.action?.label).toBe("Reload to edit here");
			expect(toast.durationMs).toBe(Infinity);
			// Its state is older than what the other tab saved: still read-only.
			expect(b.persistence.isEnabled()).toBe(false);

			const reload = vi.fn();
			vi.stubGlobal("location", { reload });
			toast.action?.onAction();
			expect(reload).toHaveBeenCalled();
			vi.unstubAllGlobals();
		});

		it("gives a reloaded writer its lock back, though a read-only tab queued first", async () => {
			const broker = makeLockBroker();
			await openTab(broker.tab(1));
			const b = await openTab(broker.tab(2));
			await vi.advanceTimersByTimeAsync(1500);
			expect(b.persistence.isEnabled()).toBe(false);

			// Reload: the new page asks before the old one has let go.
			const reloaded = await openTab(broker.tab(3));
			const saving = reloaded.persistence.saveViewport({ xAxes: [], yAxes: [] });
			await vi.advanceTimersByTimeAsync(200);
			broker.close(1);
			await settle();
			expect(broker.holder()).toBe(3);
			await saving;
			expect(reloaded.db.put).toHaveBeenCalledTimes(1);
			expect(reloaded.persistence.isEnabled()).toBe(true);
			expect(reloaded.toasts()).toEqual([]);

			// The writer is back, so the read-only tab offers no reload...
			await vi.advanceTimersByTimeAsync(1500);
			expect(b.toasts()).toEqual([
				expect.objectContaining({ message: READ_ONLY }),
			]);
			// ...until it is gone for good.
			broker.close(3);
			await vi.advanceTimersByTimeAsync(1500);
			expect(b.toasts()).toEqual([
				expect.objectContaining({ message: WRITER_GONE }),
			]);
			expect(b.persistence.isEnabled()).toBe(false);
		});

		it("leaves the lock free for the next tab once the writer is gone", async () => {
			const broker = makeLockBroker();
			await openTab(broker.tab(1));
			const b = await openTab(broker.tab(2));
			await vi.advanceTimersByTimeAsync(1500);
			broker.close(1);
			await settle();

			// No waiting it out: the read-only tab does not keep the lock.
			const c = await openTab(broker.tab(3));
			await settle();
			expect(broker.holder()).toBe(3);
			await c.persistence.saveViewport({ xAxes: [], yAxes: [] });
			expect(c.db.put).toHaveBeenCalledTimes(1);
			expect(b.persistence.isEnabled()).toBe(false);
		});

		it("stays disabled when it gets the lock after loading failed", async () => {
			const broker = makeLockBroker();
			const a = await openTab(broker.tab(1));
			a.persistence.disable();
			await settle();
			expect(broker.holder()).toBe(1);
			await a.persistence.saveViewport({ xAxes: [], yAxes: [] });
			await a.persistence.deleteDataset("1");
			expect(a.db.put).not.toHaveBeenCalled();
			expect(a.db.delete).not.toHaveBeenCalled();
		});

		it("keeps legacy state on disk when loading it read-only", async () => {
			const broker = makeLockBroker();
			await openTab(broker.tab(1));
			const b = await openTab(broker.tab(2));
			await vi.advanceTimersByTimeAsync(1500);
			const legacy = {
				xAxes: SAMPLE_APP_STATE.xAxes,
				yAxes: [],
				series: [],
				axisTitles: { x: "", y: "" },
			};
			Object.assign(b.db, {
				get: vi
					.fn()
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(undefined)
					.mockResolvedValueOnce(legacy),
			});

			expect(await b.persistence.loadAppState()).not.toBeNull();
			expect(b.db.put).not.toHaveBeenCalled();
			expect(b.db.delete).not.toHaveBeenCalled();
		});

		it("holds writes back until the lock is decided", async () => {
			const broker = makeLockBroker();
			await openTab(broker.tab(1));
			const b = await openTab(broker.tab(2));
			const saving = b.persistence.saveViewport({ xAxes: [], yAxes: [] });
			await vi.advanceTimersByTimeAsync(1000);
			expect(b.db.put).not.toHaveBeenCalled();

			await vi.advanceTimersByTimeAsync(500);
			await saving;
			expect(b.db.put).not.toHaveBeenCalled();
		});

		it("writes as before when the lock cannot be requested", async () => {
			const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
			const a = await openTab({
				request: () => Promise.reject(new DOMException("opaque", "SecurityError")),
			} as unknown as LockManager);
			await a.persistence.saveViewport({ xAxes: [], yAxes: [] });
			expect(a.db.put).toHaveBeenCalledTimes(1);
			expect(a.toasts()).toEqual([]);
			errorSpy.mockRestore();
		});
	});
});
