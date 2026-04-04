import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'webgraphy-db';
const DATASET_STORE = 'datasets';
const VERSION = 1;

export interface DataColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: Float32Array;
  minTree: Uint32Array[];
  maxTree: Uint32Array[];
  levels?: Float32Array[]; // For backward compatibility
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

export interface ViewAxisSnapshot {
  id: string;
  min: number;
  max: number;
}

export interface ViewSnapshot {
  id: string;
  name: string;
  viewportX: { min: number; max: number };
  yAxes: ViewAxisSnapshot[];
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
  views?: ViewSnapshot[];
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

  const restoreUint32Array = (arr: any) => {
    if (arr instanceof Uint32Array) return arr;
    if (typeof arr === 'object' && arr !== null) {
      return new Uint32Array(Object.values(arr) as number[]);
    }
    return new Uint32Array(0);
  };

  const restoreFloat32Array = (arr: any) => {
    if (arr instanceof Float32Array) return arr;
    if (typeof arr === 'object' && arr !== null) {
      return new Float32Array(Object.values(arr) as number[]);
    }
    return new Float32Array(0);
  };

  dataset.data = dataset.data.map((col: any) => {
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

    if (col.minTree) {
      col.minTree = col.minTree.map(restoreUint32Array);
    } else {
      col.minTree = [];
    }

    if (col.maxTree) {
      col.maxTree = col.maxTree.map(restoreUint32Array);
    } else {
      col.maxTree = [];
    }
    
    // Cleanup legacy levels
    if (col.levels) {
      delete col.levels;
    }

    if (col.refPoint === undefined) col.refPoint = 0;

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
