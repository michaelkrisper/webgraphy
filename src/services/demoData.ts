import { type Dataset, type DataColumn, type AppState, type SeriesConfig, type YAxisConfig } from './persistence';

/**
 * Generates LOD levels where all columns use the same sampled row indices.
 * Ported from data-parser.worker.ts for demo data generation.
 */
function generateSynchronizedLOD(relativeData: { data: Float32Array, refPoint: number }[], rowCount: number): Float32Array[][] {
  const numCols = relativeData.length;
  const levels: Float32Array[][] = relativeData.map(col => [col.data]);

  const factor = 8;
  let currentIndices = new Uint32Array(rowCount);
  for (let i = 0; i < rowCount; i++) currentIndices[i] = i;

  while (levels[0].length < 8 && currentIndices.length > factor * 2) {
    const nextIndicesSet = new Set<number>();

    nextIndicesSet.add(0);
    nextIndicesSet.add(rowCount - 1);

    for (let i = 0; i < currentIndices.length; i += factor) {
      const end = Math.min(i + factor, currentIndices.length);
      nextIndicesSet.add(currentIndices[i]);
      nextIndicesSet.add(currentIndices[end - 1]);

      for (let j = 0; j < numCols; j++) {
        const colData = relativeData[j].data;
        let minVal = Infinity, maxVal = -Infinity;
        let minIdx = currentIndices[i], maxIdx = currentIndices[i];

        for (let k = i; k < end; k++) {
          const idx = currentIndices[k];
          const val = colData[idx];
          if (val < minVal) { minVal = val; minIdx = idx; }
          if (val > maxVal) { maxVal = val; maxIdx = idx; }
        }
        nextIndicesSet.add(minIdx);
        nextIndicesSet.add(maxIdx);
      }
    }

    const sortedIndices = Array.from(nextIndicesSet).sort((a, b) => a - b);
    const nextIdxArray = new Uint32Array(sortedIndices);

    for (let j = 0; j < numCols; j++) {
      const colData = relativeData[j].data;
      const levelData = new Float32Array(nextIdxArray.length);
      for (let k = 0; k < nextIdxArray.length; k++) {
        levelData[k] = colData[nextIdxArray[k]];
      }
      levels[j].push(levelData);
    }

    const prevLength = currentIndices.length;
    currentIndices = nextIdxArray;
    if (currentIndices.length >= prevLength * 0.8 && currentIndices.length > 2000) break;
  }

  return levels;
}

export function generateDemoDataset(): Dataset {
  const rowCount = 10000;
  const columns = ['Timestamp', 'Sine Wave', 'Random Walk', 'Linear Trend', 'Step Function'];
  const datasetId = 'demo-dataset';

  const rawData: number[][] = [];
  const now = Math.floor(Date.now() / 1000);
  const startTime = now - (rowCount * 60); // 1 minute intervals

  let randomVal = 50;

  for (let i = 0; i < rowCount; i++) {
    const ts = startTime + (i * 60);
    const sine = Math.sin(i / 100) * 40 + 50;
    randomVal += (Math.random() - 0.5) * 5;
    const trend = (i / rowCount) * 100;
    const step = Math.floor(i / 1000) * 10;

    rawData.push([ts, sine, randomVal, trend, step]);
  }

  const colBounds = columns.map((_, colIdx) => {
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < rowCount; i++) {
      const val = rawData[i][colIdx];
      if (val < min) min = val;
      if (val > max) max = val;
    }
    return { min, max };
  });

  const relativeData = columns.map((_, colIdx) => {
    const refPoint = rawData[0][colIdx];
    const data = new Float32Array(rowCount);
    for (let i = 0; i < rowCount; i++) {
      data[i] = rawData[i][colIdx] - refPoint;
    }
    return { data, refPoint };
  });

  const lodLevels = generateSynchronizedLOD(relativeData, rowCount);

  const data: DataColumn[] = columns.map((colName, colIdx) => ({
    isFloat64: colName === 'Timestamp',
    refPoint: relativeData[colIdx].refPoint,
    bounds: colBounds[colIdx],
    levels: lodLevels[colIdx]
  }));

  const prefix = 'A: ';
  return {
    id: datasetId,
    name: 'A - Demo Weather Data',
    columns: columns.map(c => `${prefix}${c}`),
    data,
    rowCount
  };
}

export const getDemoAppState = (dataset: Dataset): AppState => {
  const yAxes: YAxisConfig[] = Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `Axis ${i + 1}`,
    min: 0,
    max: 100,
    position: i % 2 === 0 ? 'left' : 'right',
    color: '#333',
    showGrid: i === 0
  }));

  const series: SeriesConfig[] = [
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Sine Wave',
      xColumn: dataset.columns[0],
      yColumn: dataset.columns[1],
      yAxisId: 'axis-1',
      pointStyle: 'none',
      pointColor: '#1f77b4',
      lineStyle: 'solid',
      lineColor: '#1f77b4'
    },
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Random Walk',
      xColumn: dataset.columns[0],
      yColumn: dataset.columns[2],
      yAxisId: 'axis-2',
      pointStyle: 'none',
      pointColor: '#ff7f0e',
      lineStyle: 'solid',
      lineColor: '#ff7f0e'
    }
  ];

  // Adjust Y-axis 2 for random walk bounds
  const rwBounds = dataset.data[2].bounds;
  yAxes[1].min = Math.floor(rwBounds.min - 5);
  yAxes[1].max = Math.ceil(rwBounds.max + 5);

  const tsBounds = dataset.data[0].bounds;

  return {
    viewportX: { min: tsBounds.min, max: tsBounds.max },
    yAxes,
    series,
    axisTitles: { x: dataset.columns[0], y: 'Value' },
    globalXColumn: dataset.columns[0],
    xMode: 'date',
    views: [
      {
        id: 'demo-view-1',
        name: 'Full Overview',
        viewportX: { min: tsBounds.min, max: tsBounds.max },
        yAxes: [
          { id: 'axis-1', min: 0, max: 100 },
          { id: 'axis-2', min: Math.floor(rwBounds.min - 5), max: Math.ceil(rwBounds.max + 5) }
        ]
      },
      {
        id: 'demo-view-2',
        name: 'Zoomed Sine',
        viewportX: { min: tsBounds.min, max: tsBounds.min + 3600 * 4 }, // 4 hours
        yAxes: [
          { id: 'axis-1', min: 10, max: 90 },
          { id: 'axis-2', min: 0, max: 100 }
        ]
      }
    ]
  };
};
