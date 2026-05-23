import { type IDBPDatabase, openDB } from "idb";
import { z } from "zod";

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

export interface ViewportState {
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
}

export interface ConfigState {
	series: SeriesConfig[];
	axisTitles: { x: string; y: string };
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
	hidden: z.boolean().optional(),
});
const ViewportSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
});
const ConfigSchema = z.object({
	series: z.array(SeriesConfigSchema),
	axisTitles: z.object({ x: z.string(), y: z.string() }),
	legendVisible: z.boolean(),
	crosshairVisible: z.boolean(),
});
const LegacyAppStateSchema = z.object({
	xAxes: z.array(XAxisConfigSchema),
	yAxes: z.array(YAxisConfigSchema),
	series: z.array(SeriesConfigSchema),
	axisTitles: z.object({ x: z.string(), y: z.string() }),
});

let db: IDBPDatabase | null = null;

async function getDB() {
	if (db) return db;
	db = await openDB(DB_NAME, VERSION, {
		upgrade(db) {
			if (!db.objectStoreNames.contains(DATASET_STORE)) {
				db.createObjectStore(DATASET_STORE, { keyPath: "id" });
			}
			if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
				db.createObjectStore(APP_STATE_STORE);
			}
		},
	});
	return db;
}

function fixDatasetTypes(dataset: Dataset): Dataset {
	if (!dataset.data || !Array.isArray(dataset.data)) return dataset;

	dataset.data = dataset.data.map((col: DataColumn) => {
		if (!col.bounds) col.bounds = { min: 0, max: 0 };
		if (!(col.data instanceof Float32Array)) {
			col.data =
				col.data && typeof col.data === "object"
					? new Float32Array(Object.values(col.data) as number[])
					: new Float32Array(0);
		}
		if (col.refPoint === undefined) col.refPoint = 0;
		return col;
	});
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
	try {
		const db = await getDB();
		await db.put(APP_STATE_STORE, state, key);
	} catch (error) {
		console.error(`Failed to save ${label}:`, error);
	}
}

function flushDataset(id: string) {
	const ds = pendingDatasets.get(id);
	datasetTimers.delete(id);
	pendingDatasets.delete(id);
	if (!ds) return;
	getDB()
		.then((db) => db.put(DATASET_STORE, ds))
		.catch((e) => console.error("saveDataset failed:", e));
}

export const persistence = {
	async saveDataset(dataset: Dataset): Promise<void> {
		pendingDatasets.set(dataset.id, dataset);
		const existing = datasetTimers.get(dataset.id);
		if (existing) clearTimeout(existing);
		datasetTimers.set(
			dataset.id,
			setTimeout(() => flushDataset(dataset.id), DATASET_DEBOUNCE_MS),
		);
	},
	async flushAll(): Promise<void> {
		for (const id of [...datasetTimers.keys()]) {
			const t = datasetTimers.get(id);
			if (t) clearTimeout(t);
			flushDataset(id);
		}
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
		const db = await getDB();
		await db.delete(DATASET_STORE, id);
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
				axisTitles: state.axisTitles,
				legendVisible: state.legendVisible,
				crosshairVisible: state.crosshairVisible,
			}),
		]);
	},
	async loadAppState(): Promise<AppState | null> {
		try {
			const db = await getDB();
			const [vRaw, cRaw, legacy] = await Promise.all([
				db.get(APP_STATE_STORE, VIEWPORT_KEY),
				db.get(APP_STATE_STORE, CONFIG_KEY),
				db.get(APP_STATE_STORE, LEGACY_KEY),
			]);
			if (vRaw && cRaw) {
				const v = ViewportSchema.safeParse(vRaw);
				const c = ConfigSchema.safeParse(cRaw);
				if (v.success && c.success) return { ...v.data, ...c.data };
				console.error("Invalid split state:", v.success ? c.error : v.error);
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
					await persistence.saveAppState(migrated);
					await db.delete(APP_STATE_STORE, LEGACY_KEY);
					return migrated;
				}
				console.error("Invalid legacy state:", parsed.error);
			}
			return null;
		} catch (error) {
			console.error("Failed to load state:", error);
			return null;
		}
	},
	async clearAppState(): Promise<void> {
		try {
			const db = await getDB();
			await Promise.all([
				db.delete(APP_STATE_STORE, VIEWPORT_KEY),
				db.delete(APP_STATE_STORE, CONFIG_KEY),
				db.delete(APP_STATE_STORE, LEGACY_KEY),
			]);
		} catch (error) {
			console.error("Failed to clear state:", error);
		}
	},
};

if (typeof window !== "undefined") {
	window.addEventListener("beforeunload", () => {
		persistence.flushAll();
	});
}
