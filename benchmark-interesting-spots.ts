import { findInterestingSpots } from './src/utils/interesting-spots';
import { Dataset, SeriesConfig, XAxisConfig } from './src/services/persistence';

// Create a large number of datasets and series
const numDatasets = 5000;
const numSeries = 5000;
const rowCount = 10;

const datasets: Dataset[] = [];
for (let i = 0; i < numDatasets; i++) {
  const data = new Float32Array(rowCount);
  for (let j = 0; j < rowCount; j++) {
    data[j] = Math.random();
  }
  datasets.push({
    id: `ds-${i}`,
    name: `Dataset ${i}`,
    sourceId: `source-${i}`,
    xAxisId: 'axis-1',
    xAxisColumn: 'x',
    columns: ['x', 'y'],
    data: [
      { id: 'x', name: 'x', type: 'numeric', data, min: 0, max: 1 },
      { id: 'y', name: 'y', type: 'numeric', data, min: 0, max: 1 }
    ],
    rowCount,
    originalFile: 'mock.csv'
  });
}

const series: SeriesConfig[] = [];
for (let i = 0; i < numSeries; i++) {
  series.push({
    id: `s-${i}`,
    name: `Series ${i}`,
    sourceId: `ds-${i}`,
    yColumn: 'y',
    yAxisId: `axis-${i}`, // Unique y-axis to skip findIntersection O(S^2)
    lineColor: '#000000',
    type: 'line',
    hidden: false
  });
}

const xAxes: XAxisConfig[] = [{ id: 'axis-1', min: 0, max: 1 }];

console.log('Warming up...');
for (let i = 0; i < 5; i++) {
  findInterestingSpots(datasets, series, xAxes);
}

console.log('Benchmarking...');
const start = performance.now();
for (let i = 0; i < 50; i++) {
  findInterestingSpots(datasets, series, xAxes);
}
const end = performance.now();
console.log(`Time taken: ${(end - start).toFixed(2)} ms`);
