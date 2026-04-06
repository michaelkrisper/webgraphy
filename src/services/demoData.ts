import { type Dataset, type DataColumn, type AppState, type SeriesConfig, type YAxisConfig, type XAxisConfig } from './persistence';


export function generateDemoDataset(): Dataset {
  const rowCount = 100000;
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

  const data: DataColumn[] = columns.map((colName, colIdx) => {
    const col = relativeData[colIdx];
    return {
      isFloat64: colName === 'Timestamp',
      refPoint: col.refPoint,
      bounds: colBounds[colIdx],
      data: col.data,
    };
  });

  const prefix = 'A: ';
  return {
    id: datasetId,
    name: 'A - Demo Weather Data',
    columns: columns.map(c => `${prefix}${c}`),
    data,
    rowCount,
    xAxisColumn: `${prefix}${columns[0]}`,
    xAxisId: 'axis-1'
  };
}

export const getDemoAppState = (dataset: Dataset): AppState => {
  const tsBounds = dataset.data[0].bounds;

  const xAxes: XAxisConfig[] = Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `X-Axis ${i + 1}`,
    min: i === 0 ? tsBounds.min : 0,
    max: i === 0 ? tsBounds.max : 100,
    showGrid: i === 0,
    xMode: 'date'
  }));

  const yAxes: YAxisConfig[] = Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `Axis ${i + 1}`,
    min: 0,
    max: 100,
    position: i % 2 === 0 ? 'left' : 'right',
    color: '#475569',
    showGrid: i === 0
  }));

  const series: SeriesConfig[] = [
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Sine Wave',
      yColumn: dataset.columns[1],
      yAxisId: 'axis-1',
      pointStyle: 'none',
      pointColor: '#2563eb',
      lineStyle: 'solid',
      lineColor: '#2563eb'
    },
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Random Walk',
      yColumn: dataset.columns[2],
      yAxisId: 'axis-2',
      pointStyle: 'circle',
      pointColor: '#e11d48',
      lineStyle: 'none',
      lineColor: '#e11d48'
    }
  ];

  // Adjust Y-axis 2 for random walk bounds
  const rwBounds = dataset.data[2].bounds;
  yAxes[1].min = Math.floor(rwBounds.min - 5);
  yAxes[1].max = Math.ceil(rwBounds.max + 5);

  return {
    xAxes,
    yAxes,
    series,
    axisTitles: { x: dataset.columns[0], y: 'Value' },
    views: [
      {
        id: 'demo-view-1',
        name: 'Full Overview',
        xAxes: [
          { id: 'axis-1', min: tsBounds.min, max: tsBounds.max }
        ],
        yAxes: [
          { id: 'axis-1', min: 0, max: 100 },
          { id: 'axis-2', min: Math.floor(rwBounds.min - 5), max: Math.ceil(rwBounds.max + 5) }
        ]
      },
      {
        id: 'demo-view-2',
        name: 'Zoomed Sine',
        xAxes: [
          { id: 'axis-1', min: tsBounds.min, max: tsBounds.min + 3600 * 4 }
        ],
        yAxes: [
          { id: 'axis-1', min: 10, max: 90 },
          { id: 'axis-2', min: 0, max: 100 }
        ]
      }
    ]
  };
};
