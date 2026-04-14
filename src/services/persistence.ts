import { openDB, type IDBPDatabase } from 'idb';
import { z } from 'zod';

const DB_NAME = 'webgraphy-db';
const DATASET_STORE = 'datasets';
const APP_STATE_STORE = 'app_state';
const VERSION = 2;

export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: Float32Array;
  chunkMin?: Float32Array;
  chunkMax?: Float32Array;
  levels?: Float32Array[]; // For backward compatibility
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
  xMode: 'date' | 'numeric';
}

export interface YAxisConfig {
  id: string;
  name: string;
  min: number;
  max: number;
  position: 'left' | 'right';
  color: string;
  showGrid: boolean;
}

export interface ViewAxisSnapshot {
  id: string;
  min: number;
  max: number;
}

export interface ViewSnapshot {
  id: string;
  name: string;
  xAxes: ViewAxisSnapshot[];
  yAxes: ViewAxisSnapshot[];
}

export interface SeriesConfig {
  id: string;
  sourceId: string;
  name: string;
  yColumn: string;
  yAxisId: string;
  pointStyle: 'circle' | 'square' | 'cross' | 'none';
  pointColor: string;
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  lineColor: string;
  lineWidth: number;
  hidden?: boolean;
  smooth?: boolean;
}

export interface AppState {
  xAxes: XAxisConfig[];
  yAxes: YAxisConfig[];
  series: SeriesConfig[];
  axisTitles: { x: string; y: string };
  views?: ViewSnapshot[];
}

export const XAxisConfigSchema = z.object({ id: z.string(), name: z.string(), min: z.number(), max: z.number(), showGrid: z.boolean(), xMode: z.enum(['date', 'numeric']) });
export const YAxisConfigSchema = z.object({ id: z.string(), name: z.string(), min: z.number(), max: z.number(), position: z.enum(['left', 'right']), color: z.string(), showGrid: z.boolean() });
export const SeriesConfigSchema = z.object({ id: z.string(), sourceId: z.string(), name: z.string(), yColumn: z.string(), yAxisId: z.string(), pointStyle: z.enum(['circle', 'square', 'cross', 'none']), pointColor: z.string(), lineStyle: z.enum(['solid', 'dashed', 'dotted', 'none']), lineColor: z.string(), lineWidth: z.number(), hidden: z.boolean().optional(), smooth: z.boolean().optional() });
export const ViewAxisSnapshotSchema = z.object({ id: z.string(), min: z.number(), max: z.number() });
export const ViewSnapshotSchema = z.object({ id: z.string(), name: z.string(), xAxes: z.array(ViewAxisSnapshotSchema), yAxes: z.array(ViewAxisSnapshotSchema) });
export const AppStateSchema = z.object({ xAxes: z.array(XAxisConfigSchema), yAxes: z.array(YAxisConfigSchema), series: z.array(SeriesConfigSchema), axisTitles: z.object({ x: z.string(), y: z.string() }), views: z.array(ViewSnapshotSchema).optional() });

let db: IDBPDatabase | null = null;


async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DATASET_STORE)) {
        db.createObjectStore(DATASET_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(APP_STATE_STORE)) {
        db.createObjectStore(APP_STATE_STORE);
      }
    },
  });
  return db;
}

/**
 * Ensures that all data in a dataset is correctly typed.
 */
function fixDatasetTypes(dataset: Dataset): Dataset {
  if (!dataset.data || !Array.isArray(dataset.data)) return dataset;

  const restoreFloat32Array = (arr: unknown) => {
    if (arr instanceof Float32Array) return arr;
    if (typeof arr === 'object' && arr !== null) {
      return new Float32Array(Object.values(arr) as number[]);
    }
    return new Float32Array(0);
  };

  dataset.data = dataset.data.map((col: DataColumn) => {
    // Migration: ensure bounds exist
    if (!col.bounds) {
      col.bounds = { min: 0, max: 0 };
    }

    // Migration: levels -> data
    if (col.levels && col.levels.length > 0 && !col.data) {
      col.data = restoreFloat32Array(col.levels[0]);
    } else if (col.data) {
      col.data = restoreFloat32Array(col.data);
    } else {
      col.data = new Float32Array(0);
    }

    if (col.chunkMin) col.chunkMin = restoreFloat32Array(col.chunkMin);
    if (col.chunkMax) col.chunkMax = restoreFloat32Array(col.chunkMax);

    if (col.refPoint === undefined) col.refPoint = 0;

    return col;
  });
  if (dataset.xAxisColumn === undefined) {
    const potentialX = dataset.columns.find(c => { const lower = c.toLowerCase(); return lower.includes('time') || lower.includes('date'); }) || dataset.columns[0];
    dataset.xAxisColumn = potentialX;
  }
  if (dataset.xAxisId === undefined) {
    dataset.xAxisId = 'axis-1';
  }
  
  return dataset;
}

export const persistence = {
  async saveDataset(dataset: Dataset): Promise<void> {
    const db = await getDB();
    await db.put(DATASET_STORE, dataset);
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
    const db = await getDB();
    await db.delete(DATASET_STORE, id);
  },
  async saveAppState(state: AppState): Promise<void> {
    try {
      const validated = AppStateSchema.parse(state);
      const db = await getDB();
      await db.put(APP_STATE_STORE, validated, 'webgraphy-state');
    } catch (error) {
      console.error('Failed to save state to IndexedDB:', error);
    }
  },
  async loadAppState(): Promise<AppState | null> {
    try {
      const db = await getDB();
      const state = await db.get(APP_STATE_STORE, 'webgraphy-state');
      if (!state) return null;
      const validated = AppStateSchema.safeParse(state);
      if (validated.success) {
        return validated.data;
      } else {
        console.error('Invalid state in IndexedDB:', validated.error);
        return null;
      }
    } catch (error) {
      console.error('Failed to load state from IndexedDB:', error);
      return null;
    }
  },
  async clearAppState(): Promise<void> {
    try {
      const db = await getDB();
      await db.delete(APP_STATE_STORE, 'webgraphy-state');
    } catch (error) {
      console.error('Failed to clear state from IndexedDB:', error);
    }
  }
};
