import { type IDBPDatabase, openDB } from "idb";
// `zod/mini` covers the whole surface used below and keeps ~10 KB gzip of the
// chainable classic API out of the entry chunk (see size-budget.json).
import * as z from "zod/mini";
import { notify } from "../store/useNotificationStore";
import { logger } from "../utils/logger";

const DB_NAME = "webgraphy-db";
const DATASET_STORE = "datasets";
const APP_STATE_STORE = "app_state";
const VIEWPORT_KEY = "webgraphy-viewport";
const CONFIG_KEY = "webgraphy-config";
const LEGACY_KEY = "webgraphy-state";
const VERSION = 2;

export interface DataColumn {
	isFloat64: boolean;
	refPoint: number;
	bounds: { min: number; max: number };
	data: Float32Array;
	formula?: string;
	categoryLabels?: string[];
}

export interface Dataset {
	id: string;
	name: string;
	columns: string[];
	data: DataColumn[];
	rowCount: number;
	xAxisColumn: string;
	xAxisId: string;
}

/**
 * Dataset shape as emitted by the parser: the x-axis column and axis slot are
 * resolved later by the store (`addDataset`), so both are absent/optional here.
 */
export type ParsedDataset = Omit<Dataset, "xAxisId" | "xAxisColumn"> & {
	xAxisColumn?: string;
};

export interface XAxisConfig {
	id: string;
	name: string;
	min: number;
	max: number;
	showGrid: boolean;
	xMode: "date" | "numeric" | "categorical";
}

export interface YAxisConfig {
	id: string;
	name: string;
	min: number;
	max: number;
	position: "left" | "right";
	color: string;
	showGrid: boolean;
}

export interface SeriesConfig {
	id: string;
	sourceId: string;
	name: string;
	yColumn: string;
	yAxisId: string;
	pointStyle: "circle" | "square" | "cross" | "none";
	pointColor: string;
	lineStyle: "solid" | "dashed" | "dotted" | "none";
	lineColor: string;
	hidden?: boolean;
}

interface ViewportState {
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
}

interface ConfigState {
	series: SeriesConfig[];
	legendVisible: boolean;
	crosshairVisible: boolean;
}

export interface AppState extends ViewportState, ConfigState {}

const XAxisConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	min: z.number(),
	max: z.number(),
	showGrid: z.boolean(),
	xMode: z.enum(["date", "numeric", "categorical"]),
});
const YAxisConfigSchema = z.object({
	id: z.string(),
	name: z.string(),
	min: z.number(),
	max: z.number(),
	position: z.enum(["left", "right"]),
	color: z.string(),
	showGrid: z.boolean(),
});
const SeriesConfigSchema = z.object({
	id: z.string(),
	sourceId: z.string(),
	name: z.string(),
	yColumn: z.string(),
	yAxisId: z.string(),
	pointStyle: z.enum(["circle", "square", "cross", "none"]),
	pointColor: z.string(),
	lineStyle: z.enum(["solid", "dashed", "dotted", "none"]),
	lineColor: z.string(),
	hidden: z.optional(z.boolean()),
});
const ViewportSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
});
// Older persisted configs additionally carry an `axisTitles` object from a
// removed feature; Zod strips unknown keys, so they load unchanged.
export const ConfigSchema = z.object({
	series: z.array(SeriesConfigSchema),
	legendVisible: z.boolean(),
	crosshairVisible: z.boolean(),
});
const LegacyAppStateSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
	series: z.array(SeriesConfigSchema),
});

const DEFAULT_AXIS_RANGE = { min: 0, max: 100 };

/**
 * An axis range is view state, not data: a bad one (e.g. the ±Infinity bounds
 * of an all-NaN column saved by an older build) must not cost the user their
 * whole series config. Non-finite ranges fall back to the default and entries
 * that are otherwise malformed are dropped; the store refills missing slots.
 */
function sanitizeAxes<T>(
	raw: unknown,
	schema: z.ZodMiniType<T>,
	label: string,
): T[] {
	if (!Array.isArray(raw)) return [];
	const out: T[] = [];
	for (const entry of raw as unknown[]) {
		let candidate = entry;
		if (entry && typeof entry === "object") {
			const { min, max } = entry as { min?: unknown; max?: unknown };
			if (!(Number.isFinite(min) && Number.isFinite(max)))
				candidate = { ...entry, ...DEFAULT_AXIS_RANGE };
		}
		const parsed = schema.safeParse(candidate);
		if (parsed.success) out.push(parsed.data);
		if (!parsed.success || candidate !== entry)
			logger.warn("Repaired invalid saved axis", { label, entry });
	}
	return out;
}

export function parseViewport(raw: unknown): ViewportState {
	const v = ViewportSchema.safeParse(raw);
	if (v.success) return v.data;
	const r = (raw ?? {}) as { xAxes?: unknown; yAxes?: unknown };
	return {
		xAxes: sanitizeAxes(r.xAxes, XAxisConfigSchema, "x"),
		yAxes: sanitizeAxes(r.yAxes, YAxisConfigSchema, "y"),
	};
}

// The promise (not the handle) is cached so concurrent callers share one
// connection; a failed open is not cached, so the next call retries.
let dbPromise: Promise<IDBPDatabase> | null = null;
// Off once loading failed (writing would clobber data we could not read) or
// another tab upgraded the schema under us.
let writesEnabled = true;

function openConnection(): Promise<IDBPDatabase> {
	const opening: Promise<IDBPDatabase> = openDB(DB_NAME, VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(DATASET_STORE)) {
				db.createObjectStore(DATASET_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
				db.createObjectStore(APP_STATE_STORE);
			}
		},
		blocked() {
			// An older build in another tab still holds the database open.
			notify({
				kind: "info",
				message:
					"WebGraphy is open in another tab — close it to finish loading your saved data.",
			});
		},
		blocking(_current, _blocked, event) {
			// A newer build in another tab wants to upgrade: let it, and stop
			// writing with a schema that is about to be outdated.
			writesEnabled = false;
			if (dbPromise === opening) dbPromise = null;
			(event.target as IDBDatabase).close();
			notify({
				kind: "info",
				message: "WebGraphy was updated in another tab — reload to continue.",
				action: { label: "Reload", onAction: () => location.reload() },
				durationMs: Infinity,
			});
		},
		terminated() {
			// The browser closed the connection abnormally (e.g. storage cleared).
			if (dbPromise === opening) dbPromise = null;
		},
	});
	return opening;
}

function getDB(): Promise<IDBPDatabase> {
	if (!dbPromise) {
		const opening = openConnection();
		dbPromise = opening;
		opening.catch(() => {
			if (dbPromise === opening) dbPromise = null;
		});
	}
	return dbPromise;
}

function isQuotaError(error: unknown): boolean {
	const name = (error as { name?: unknown } | null)?.name;
	return name === "QuotaExceededError" || name === "NS_ERROR_DOM_QUOTA_REACHED";
}

// Messages are stable per target so the toast store collapses repeats of a
// failing save into one toast.
function reportDatasetSaveError(name: string, error: unknown): void {
	notify({
		kind: "error",
		message: isQuotaError(error)
			? `Browser storage is full — dataset "${name}" was not saved. Free space or remove datasets.`
			: `Could not save dataset "${name}" to browser storage.`,
	});
}

function reportStateSaveError(error: unknown): void {
	notify({
		kind: "error",
		message: isQuotaError(error)
			? "Browser storage is full — chart settings were not saved. Free space or remove datasets."
			: "Could not save chart settings to browser storage.",
	});
}

const storageListeners = new Set<() => void>();

/** Subscribes to dataset writes/deletes (for the storage readout); returns the unsubscribe. */
export function onStorageChange(listener: () => void): () => void {
	storageListeners.add(listener);
	return () => {
		storageListeners.delete(listener);
	};
}

function emitStorageChange(): void {
	for (const l of storageListeners) l();
}

let persistRequested = false;

/**
 * Asks once per session for persistent storage so the browser does not evict
 * the user's datasets under storage pressure. A denial is final — no re-asking.
 */
function requestPersistentStorage(): void {
	if (persistRequested) return;
	persistRequested = true;
	const storage = globalThis.navigator?.storage;
	if (typeof storage?.persist !== "function") return;
	storage.persist().then(emitStorageChange, () => {});
}

export interface StorageInfo {
	usage: number;
	quota: number;
	persisted: boolean;
}

function fixDatasetTypes(dataset: Dataset): Dataset {
	if (!dataset.data || !Array.isArray(dataset.data)) return dataset;

	const data = dataset.data;
	for (let i = 0; i < data.length; i++) {
		const col = data[i];
		if (!col.bounds) col.bounds = { min: 0, max: 0 };
		if (!(col.data instanceof Float32Array)) {
			col.data =
				col.data && typeof col.data === "object"
					? new Float32Array(Object.values(col.data) as number[])
					: new Float32Array(0);
		}
		if (col.refPoint === undefined) col.refPoint = 0;
	}
	if (dataset.xAxisColumn === undefined) {
		const potentialX =
			dataset.columns.find((c) => {
				const lower = c.toLowerCase();
				return lower.includes("time") || lower.includes("date");
			}) || dataset.columns[0];
		dataset.xAxisColumn = potentialX;
	}
	if (dataset.xAxisId === undefined) dataset.xAxisId = "axis-1";
	return dataset;
}

const DATASET_DEBOUNCE_MS = 300;
const pendingDatasets = new Map<string, Dataset>();
const datasetTimers = new Map<string, ReturnType<typeof setTimeout>>();

async function putAppState(
	key: string,
	state: unknown,
	label: string,
): Promise<void> {
	if (!writesEnabled) return;
	try {
		const db = await getDB();
		await db.put(APP_STATE_STORE, state, key);
	} catch (error) {
		logger.error("Failed to save state", { label, error });
		reportStateSaveError(error);
	}
}

/** Writes one dataset in its own transaction; returns whether it persisted. */
async function writeDataset(ds: Dataset, label: string): Promise<boolean> {
	if (!writesEnabled) return false;
	try {
		const db = await getDB();
		await db.put(DATASET_STORE, ds);
		requestPersistentStorage();
		return true;
	} catch (e) {
		logger.error(label, { error: e });
		reportDatasetSaveError(ds.name, e);
		return false;
	}
}

async function flushDataset(id: string): Promise<void> {
	const ds = pendingDatasets.get(id);
	datasetTimers.delete(id);
	pendingDatasets.delete(id);
	if (!ds) return;
	if (await writeDataset(ds, "saveDataset failed")) emitStorageChange();
}

export const persistence = {
	/**
	 * Stops all writes for the rest of the session. Used when saved data could
	 * not be loaded, so the fallback demo session cannot overwrite it.
	 */
	disable(): void {
		writesEnabled = false;
	},
	isEnabled(): boolean {
		return writesEnabled;
	},
	async getStorageInfo(): Promise<StorageInfo | null> {
		const storage = globalThis.navigator?.storage;
		if (typeof storage?.estimate !== "function") return null;
		try {
			const [{ usage = 0, quota = 0 }, persisted] = await Promise.all([
				storage.estimate(),
				typeof storage.persisted === "function"
					? storage.persisted()
					: Promise.resolve(false),
			]);
			return { usage, quota, persisted };
		} catch {
			return null;
		}
	},
	async saveDataset(dataset: Dataset): Promise<void> {
		if (!writesEnabled) return;
		pendingDatasets.set(dataset.id, dataset);
		const existing = datasetTimers.get(dataset.id);
		if (existing) clearTimeout(existing);
		datasetTimers.set(
			dataset.id,
			setTimeout(() => flushDataset(dataset.id), DATASET_DEBOUNCE_MS),
		);
	},
	async flushAll(): Promise<void> {
		const ids = [...datasetTimers.keys()];
		if (ids.length === 0) return;

		const datasetsToSave: Dataset[] = [];
		for (const id of ids) {
			const t = datasetTimers.get(id);
			if (t) clearTimeout(t);
			datasetTimers.delete(id);

			const ds = pendingDatasets.get(id);
			pendingDatasets.delete(id);
			if (ds) datasetsToSave.push(ds);
		}

		if (datasetsToSave.length === 0) return;

		// One transaction per dataset: a shared one would abort every write
		// when a single dataset exceeds the quota.
		const results = await Promise.all(
			datasetsToSave.map((ds) => writeDataset(ds, "flushAll failed")),
		);
		if (results.some(Boolean)) emitStorageChange();
	},
	async loadDataset(id: string): Promise<Dataset | undefined> {
		const db = await getDB();
		const ds = await db.get(DATASET_STORE, id);
		return ds ? fixDatasetTypes(ds) : undefined;
	},
	async getAllDatasets(): Promise<Dataset[]> {
		const db = await getDB();
		const all = await db.getAll(DATASET_STORE);
		return all.map(fixDatasetTypes);
	},
	async deleteDataset(id: string): Promise<void> {
		const timer = datasetTimers.get(id);
		if (timer) clearTimeout(timer);
		datasetTimers.delete(id);
		pendingDatasets.delete(id);
		if (!writesEnabled) return;
		// Callers fire and forget, so a failure must not escape as an unhandled
		// rejection.
		try {
			const db = await getDB();
			await db.delete(DATASET_STORE, id);
		} catch (error) {
			logger.error("deleteDataset failed", { id, error });
			notify({
				kind: "error",
				message:
					"Could not remove a dataset from browser storage — it may reappear after a reload.",
			});
			return;
		}
		emitStorageChange();
	},
	saveViewport(state: ViewportState): Promise<void> {
		return putAppState(VIEWPORT_KEY, state, "viewport");
	},
	saveConfig(state: ConfigState): Promise<void> {
		return putAppState(CONFIG_KEY, state, "config");
	},
	async saveAppState(state: AppState): Promise<void> {
		await Promise.all([
			persistence.saveViewport({ xAxes: state.xAxes, yAxes: state.yAxes }),
			persistence.saveConfig({
				series: state.series,
				legendVisible: state.legendVisible,
				crosshairVisible: state.crosshairVisible,
			}),
		]);
	},
	/**
	 * Resolves `null` for absent or invalid state, but rejects when storage
	 * itself cannot be read — the caller must then not fall back to demo data
	 * that would overwrite what is still on disk.
	 */
	async loadAppState(): Promise<AppState | null> {
		let db: IDBPDatabase;
		let vRaw: unknown;
		let cRaw: unknown;
		let legacy: unknown;
		try {
			db = await getDB();
			[vRaw, cRaw, legacy] = await Promise.all([
				db.get(APP_STATE_STORE, VIEWPORT_KEY),
				db.get(APP_STATE_STORE, CONFIG_KEY),
				db.get(APP_STATE_STORE, LEGACY_KEY),
			]);
		} catch (error) {
			logger.error("Failed to load state", { error });
			throw error;
		}
		if (vRaw && cRaw) {
			const c = ConfigSchema.safeParse(cRaw);
			if (c.success) return { ...parseViewport(vRaw), ...c.data };
			logger.error("Invalid split state", { error: c.error });
			return null;
		}
		if (legacy) {
			const parsed = LegacyAppStateSchema.safeParse(legacy);
			if (parsed.success) {
				const migrated: AppState = {
					...parsed.data,
					legendVisible: true,
					crosshairVisible: true,
				};
				try {
					await persistence.saveAppState(migrated);
					await db.delete(APP_STATE_STORE, LEGACY_KEY);
				} catch (error) {
					logger.error("Failed to migrate legacy state", { error });
				}
				return migrated;
			}
			logger.error("Invalid legacy state", { error: parsed.error });
		}
		return null;
	},
	async clearAppState(): Promise<void> {
		if (!writesEnabled) return;
		try {
			const db = await getDB();
			await Promise.all([
				db.delete(APP_STATE_STORE, VIEWPORT_KEY),
				db.delete(APP_STATE_STORE, CONFIG_KEY),
				db.delete(APP_STATE_STORE, LEGACY_KEY),
			]);
		} catch (error) {
			logger.error("Failed to clear state", { error });
		}
	},
};

if (typeof window !== "undefined") {
	// "hidden" fires before unload and still allows async IndexedDB writes to
	// run, which beforeunload does not reliably guarantee.
	document.addEventListener("visibilitychange", () => {
		if (document.visibilityState === "hidden") persistence.flushAll();
	});
	window.addEventListener("beforeunload", () => {
		persistence.flushAll();
	});
}
