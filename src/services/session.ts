import { type Dataset, type AppState, type DataColumn, persistence } from './persistence';
import { secureJSONParse } from '../utils/json';

interface SessionData {
  version: 1;
  appState: AppState;
  datasets: SerializedDataset[];
}

interface SerializedDataset {
  id: string;
  name: string;
  columns: string[];
  rowCount: number;
  xAxisColumn: string;
  xAxisId: string;
  data: SerializedColumn[];
}

interface SerializedColumn {
  isFloat64: boolean;
  refPoint: number;
  bounds: { min: number; max: number };
  data: number[];
  chunkMin?: number[];
  chunkMax?: number[];
}

function serializeDataset(ds: Dataset): SerializedDataset {
  return {
    id: ds.id,
    name: ds.name,
    columns: ds.columns,
    rowCount: ds.rowCount,
    xAxisColumn: ds.xAxisColumn,
    xAxisId: ds.xAxisId,
    data: ds.data.map(col => ({
      isFloat64: col.isFloat64,
      refPoint: col.refPoint,
      bounds: col.bounds,
      data: Array.from(col.data),
      chunkMin: col.chunkMin ? Array.from(col.chunkMin) : undefined,
      chunkMax: col.chunkMax ? Array.from(col.chunkMax) : undefined,
    })),
  };
}

function deserializeDataset(sd: SerializedDataset): Dataset {
  return {
    id: sd.id,
    name: sd.name,
    columns: sd.columns,
    rowCount: sd.rowCount,
    xAxisColumn: sd.xAxisColumn,
    xAxisId: sd.xAxisId,
    data: sd.data.map((col): DataColumn => ({
      isFloat64: col.isFloat64,
      refPoint: col.refPoint,
      bounds: col.bounds,
      data: new Float32Array(col.data),
      chunkMin: col.chunkMin ? new Float32Array(col.chunkMin) : undefined,
      chunkMax: col.chunkMax ? new Float32Array(col.chunkMax) : undefined,
    })),
  };
}

export async function exportSession(): Promise<string> {
  const appState = await persistence.loadAppState();
  const datasets = await persistence.getAllDatasets();

  const session: SessionData = {
    version: 1,
    appState: appState || { xAxes: [], yAxes: [], series: [], axisTitles: { x: 'X-Axis', y: 'Y-Axis' } },
    datasets: datasets.map(serializeDataset),
  };

  return JSON.stringify(session);
}

export async function importSession(json: string): Promise<{ appState: AppState; datasets: Dataset[] }> {
  const session = secureJSONParse(json) as SessionData;

  if (session.version !== 1) {
    throw new Error(`Unsupported session version: ${session.version}`);
  }

  const datasets = session.datasets.map(deserializeDataset);

  // Clear existing data
  const existingDatasets = await persistence.getAllDatasets();
  for (const ds of existingDatasets) {
    await persistence.deleteDataset(ds.id);
  }

  // Save new data
  for (const ds of datasets) {
    await persistence.saveDataset(ds);
  }
  await persistence.saveAppState(session.appState);

  return { appState: session.appState, datasets };
}
