import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'webgraphy-db';
const DATASET_STORE = 'datasets';
const VERSION = 1;

export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  levels: Float32Array[];
}

export interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: DataColumn[];
  rowCount: number;
}

export type AxisPosition = 'left' | 'right';

export interface YAxisConfig {
  id: string;
  name: string;
  min: number;
  max: number;
  position: AxisPosition;
  color: string;
  showGrid: boolean;
}

export interface SeriesConfig {
  id: string;
  sourceId: string;
  name: string;
  xColumn: string;
  yColumn: string;
  yAxisId: string;
  pointStyle: 'circle' | 'square' | 'cross' | 'none';
  pointColor: string;
  lineStyle: 'solid' | 'dashed' | 'dotted' | 'none';
  lineColor: string;
}

export interface AppState {
  viewportX: { min: number; max: number };
  yAxes: YAxisConfig[];
  series: SeriesConfig[];
  axisTitles: { x: string; y: string };
  globalXColumn: string;
  xMode: 'date' | 'numeric';
}

let db: IDBPDatabase | null = null;

async function getDB() {
  if (db) return db;
  db = await openDB(DB_NAME, VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(DATASET_STORE)) {
        db.createObjectStore(DATASET_STORE, { keyPath: 'id' });
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

  dataset.data = dataset.data.map((col: any) => {
    // Migration: ensure bounds exist
    if (!col.bounds) {
      col.bounds = { min: 0, max: 0 };
    }
    
    // Restoration of TypedArrays for new format
    if (col && col.levels) {
      col.levels = col.levels.map((level: any) => {
        if (level instanceof Float32Array) return level;
        // Handle cases where IndexedDB de-types TypedArrays into Objects
        if (typeof level === 'object' && level !== null) {
          const values = Object.values(level) as number[];
          return new Float32Array(values);
        }
        return new Float32Array(0);
      });
      if (col.refPoint === undefined) col.refPoint = 0;
    }
    return col;
  });
  
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
  saveAppState(state: AppState): void {
    localStorage.setItem('webgraphy-state', JSON.stringify(state));
  },
  loadAppState(): AppState | null {
    const state = localStorage.getItem('webgraphy-state');
    return state ? JSON.parse(state) : null;
  }
};
