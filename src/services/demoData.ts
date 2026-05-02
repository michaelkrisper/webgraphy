import { type Dataset, type DataColumn, type AppState, type SeriesConfig, type YAxisConfig, type XAxisConfig } from './persistence';
import { secureRandom } from '../utils/random';

function generateRawWeatherData(rowCount: number, startTime: number): number[][] {
  const rawData: number[][] = [];
  for (let i = 0; i < rowCount; i++) {
    const ts = startTime + (i * 60);
    const minutesElapsed = i;
    const hourOfDay = (minutesElapsed / 60) % 24;
    const dayOfYear = (minutesElapsed / (24 * 60)) % 365;

    // --- Temperature ---
    // Yearly cycle: lowest in winter (day 0), highest in summer (day 180)
    const yearlyCycle = Math.sin((dayOfYear / 365) * 2 * Math.PI - Math.PI / 2);
    // Daily cycle: lowest at 4 AM, highest at 4 PM
    const dailyCycle = Math.sin(((hourOfDay - 4) / 24) * 2 * Math.PI - Math.PI / 2);
    // Weather front (multi-day variation)
    const weatherFront = Math.sin(minutesElapsed / (60 * 24 * 4.3)) * 4;

    let temp = 15 + (yearlyCycle * 12) + (dailyCycle * 5) + weatherFront;
    // Add high-frequency noise
    temp += (secureRandom() - 0.5) * 1.5;

    // --- Humidity ---
    // Inversely correlated with temperature, plus some randomness
    let humidity = 100 - ((temp + 10) / 50) * 80;
    humidity += Math.sin(minutesElapsed / (60 * 24 * 2.1)) * 10; // weather systems
    humidity += (secureRandom() - 0.5) * 5;
    humidity = Math.max(0, Math.min(100, humidity)); // clamp 0-100

    // --- Solar Irradiance ---
    let solar = 0;
    // Sunrise/sunset varies by season
    const sunrise = 6 - yearlyCycle * 1.5;
    const sunset = 18 + yearlyCycle * 1.5;

    if (hourOfDay > sunrise && hourOfDay < sunset) {
      const dayLength = sunset - sunrise;
      const timeSinceSunrise = hourOfDay - sunrise;
      const dailySolar = Math.sin((timeSinceSunrise / dayLength) * Math.PI);
      const maxS = 700 + (yearlyCycle * 300); // More intense in summer
      solar = dailySolar * maxS;

      // Simulate cloud cover (reduces irradiance randomly)
      if (secureRandom() > 0.85) {
        solar *= (secureRandom() * 0.5 + 0.1);
      }
    }
    // Add minor sensor noise during the day
    if (solar > 0) {
      solar += (secureRandom() - 0.5) * 10;
    }
    solar = Math.max(0, solar);

    // --- Wind Speed ---
    // Higher wind during weather fronts and during the day
    let wind = 2 + Math.abs(weatherFront) * 1.5 + (dailyCycle > 0 ? dailyCycle * 2 : 0);
    // Occasional gusts
    if (secureRandom() > 0.98) {
      wind += secureRandom() * 8;
    }
    wind += (secureRandom() - 0.5) * 1.5;
    wind = Math.max(0, wind);

    rawData.push([ts, temp, humidity, solar, wind]);
  }
  return rawData;
}


function processColumns(rawData: number[][], rowCount: number, columns: string[]): DataColumn[] {
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

  const result = columns.map((colName, colIdx) => {
    const col = relativeData[colIdx];
    return {
      isFloat64: colName === 'Timestamp',
      refPoint: col.refPoint,
      bounds: colBounds[colIdx],
      data: col.data
    } as DataColumn;
  });

  return result;
}

export function generateDemoDataset(): Dataset {
  const rowCount = 1000000; // Increased to 1M to demonstrate high performance
  const columns = ['Timestamp', 'Temperature (°C)', 'Humidity (%)', 'Solar Irradiance (W/m²)', 'Wind Speed (m/s)'];
  const datasetId = 'demo-dataset';

  // Set start time to Jan 1st of the current year, midnight
  const currentYear = new Date().getFullYear();
  const startTime = Math.floor(new Date(currentYear, 0, 1).getTime() / 1000);

  const rawData = generateRawWeatherData(rowCount, startTime);
  const data = processColumns(rawData, rowCount, columns);

  const prefix = 'A: ';
  return {
    id: datasetId,
    name: 'A - Demo Weather Station',
    columns: columns.map(c => `${prefix}${c}`),
    data,
    rowCount,
    xAxisColumn: `${prefix}${columns[0]}`,
    xAxisId: 'axis-1'
  };
}

function createDemoXAxes(tsBounds: { min: number; max: number }): XAxisConfig[] {
  return Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `X-Axis ${i + 1}`,
    min: i === 0 ? tsBounds.min : 0,
    max: i === 0 ? tsBounds.max : 100,
    showGrid: i === 0,
    xMode: 'date'
  }));
}

function createDemoYAxes(): YAxisConfig[] {
  const yAxes: YAxisConfig[] = Array.from({ length: 9 }, (_, i) => ({
    id: `axis-${i + 1}`,
    name: `Axis ${i + 1}`,
    min: 0,
    max: 100,
    position: i % 2 === 0 ? 'left' : 'right',
    color: '#475569',
    showGrid: i === 0
  }));

  // Configure Y-axes specifically
  // Axis 1: Temperature (Left)
  yAxes[0] = { ...yAxes[0], name: 'Temperature (°C)', min: -20, max: 50, position: 'left', showGrid: true };
  // Axis 2: Humidity (Right)
  yAxes[1] = { ...yAxes[1], name: 'Humidity (%)', min: 0, max: 100, position: 'right', showGrid: false };
  // Axis 3: Solar Irradiance (Left)
  yAxes[2] = { ...yAxes[2], name: 'Solar Irradiance (W/m²)', min: 0, max: 1200, position: 'left', showGrid: false };
  // Axis 4: Wind Speed (Right)
  yAxes[3] = { ...yAxes[3], name: 'Wind Speed (m/s)', min: 0, max: 30, position: 'right', showGrid: false };

  return yAxes;
}

function createDemoSeries(dataset: Dataset): SeriesConfig[] {
  return [
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Temperature',
      yColumn: dataset.columns[1],
      yAxisId: 'axis-1',
      pointStyle: 'none',
      pointColor: '#f97316', // Orange
      lineStyle: 'solid',
      lineColor: '#ea580c',
    },
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Humidity',
      yColumn: dataset.columns[2],
      yAxisId: 'axis-2',
      pointStyle: 'none',
      pointColor: '#3b82f6', // Blue
      lineStyle: 'solid',
      lineColor: '#2563eb',
    },
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Solar Irradiance',
      yColumn: dataset.columns[3],
      yAxisId: 'axis-3',
      pointStyle: 'none',
      pointColor: '#eab308', // Yellow
      lineStyle: 'solid',
      lineColor: '#ca8a04',
    },
    {
      id: crypto.randomUUID(),
      sourceId: dataset.id,
      name: 'Wind Speed',
      yColumn: dataset.columns[4],
      yAxisId: 'axis-4',
      pointStyle: 'none',
      pointColor: '#14b8a6', // Teal
      lineStyle: 'solid',
      lineColor: '#0d9488',
    }
  ];
}


export const getDemoAppState = (dataset: Dataset): AppState => {
  const tsBounds = dataset.data[0].bounds;

  return {
    xAxes: createDemoXAxes(tsBounds),
    yAxes: createDemoYAxes(),
    series: createDemoSeries(dataset),
    axisTitles: { x: 'Date / Time', y: '' }
  };
};
