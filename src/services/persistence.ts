import { openDB, type IDBPDatabase } from 'idb';

const DB_NAME = 'webgraphy-db';
const DATASET_STORE = 'datasets';
const VERSION = 1;

export interface Dataset {
  id: string;
  name: string;
  columns: string[];
  data: Float32Array[];
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
  showGrid: boolean; // Added
}

export interface SeriesConfig {
  id: string;
  sourceId: string;
  name: string; // Display name
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

export const persistence = {
  async saveDataset(dataset: Dataset): Promise<void> {
    const db = await getDB();
    await db.put(DATASET_STORE, dataset);
  },
  async loadDataset(id: string): Promise<Dataset | undefined> {
    const db = await getDB();
    return db.get(DATASET_STORE, id);
  },
  async getAllDatasets(): Promise<Dataset[]> {
    const db = await getDB();
    return db.getAll(DATASET_STORE);
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
