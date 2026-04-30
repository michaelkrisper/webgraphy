import { describe, it, expect, vi } from 'vitest';
import { findInterestingSpots } from '../interesting-spots';
import { type Dataset, type SeriesConfig, type XAxisConfig } from '../../services/persistence';

// Utility to create a dataset with x and y columns
function createMockDataset(id: string, yValues: number[], xValues?: number[]): Dataset {
  const rowCount = yValues.length;
  const actualXValues = xValues || Array.from({ length: rowCount }, (_, i) => i);

  const xData = new Float32Array(actualXValues);
  const yData = new Float32Array(yValues);

  return {
    id,
    name: `Dataset ${id}`,
    xAxisColumn: 'x',
    xAxisId: 'axis-1',
    columns: ['x', 'y'],
    data: [
      { min: Math.min(...actualXValues), max: Math.max(...actualXValues), refPoint: 0, data: xData },
      { min: Math.min(...yValues), max: Math.max(...yValues), refPoint: 0, data: yData }
    ],
    rowCount,
    timeColumns: [],
  };
}

function createMockSeries(id: string, sourceId: string, hidden = false): SeriesConfig {
  return {
    id,
    name: `Series ${id}`,
    sourceId,
    yColumn: 'y',
    yAxisId: 'axis-y1',
    lineColor: '#000000',
    type: 'line',
    hidden,
  };
}

function createMockXAxis(): XAxisConfig {
  return {
    id: 'axis-1',
    mode: 'numeric',
    min: 0,
    max: 100,
  };
}

describe('findInterestingSpots', () => {
  it('returns empty array if no visible series', () => {
    const datasets = [createMockDataset('ds1', [1, 2, 3])];
    const series = [createMockSeries('s1', 'ds1', true)]; // hidden
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    expect(spots).toEqual([]);
  });

  it('ignores series if dataset has less than 3 rows', () => {
    const datasets = [createMockDataset('ds1', [1, 2])]; // Only 2 rows
    const series = [createMockSeries('s1', 'ds1')];
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    expect(spots).toEqual([]);
  });

  it('ignores series if x or y columns cannot be found', () => {
     const ds = createMockDataset('ds1', [1, 2, 3]);
     ds.columns = ['wrong-x', 'wrong-y']; // Missing x and y columns
     const datasets = [ds];
     const series = [createMockSeries('s1', 'ds1')];
     const xAxes = [createMockXAxis()];

     const spots = findInterestingSpots(datasets, series, xAxes);
     expect(spots).toEqual([]);
  });

  it('does not add Minimum or Maximum spots', () => {
    const datasets = [createMockDataset('ds1', [10, 5, 20, 2, 15])];
    const series = [createMockSeries('s1', 'ds1')];
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);

    expect(spots.some(s => s.name.includes('Maximum'))).toBe(false);
    expect(spots.some(s => s.name.includes('Minimum'))).toBe(false);
  });

  it('finds Steepest Change spots', () => {
    // We need enough rows. window size is Math.max(1, floor(n/200)). For small n, it's 1.
    // n=10.
    const yVals = [0, 1, 2, 3, 20, 22, 23, 24, 25, 26]; // Steep change between 3 and 20 (index 3 to 4)
    const datasets = [createMockDataset('ds1', yVals)];
    const series = [createMockSeries('s1', 'ds1')];
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    expect(spots.some(s => s.name.includes('Steepest Change'))).toBe(true);
  });

  it('finds Anomaly spots using z-score', () => {
    // We need windowSize >= 10. n = 50. windowSize = max(10, 50/50) = 10.
    // Local window is 2 * windowSize = 20. Need at least 30 elements.
    const yVals = Array.from({ length: 40 }, () => 10); // flat line at 10
    yVals[20] = 100; // Anomaly at index 20
    const datasets = [createMockDataset('ds1', yVals)];
    const series = [createMockSeries('s1', 'ds1')];
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    expect(spots.some(s => s.name.includes('Anomaly'))).toBe(true);
  });

  it('finds Intersection spots', () => {
    // Two series that cross
    const yVals1 = [0, 2, 4, 6, 8, 10];
    const yVals2 = [10, 8, 6, 4, 2, 0];

    const datasets = [
      createMockDataset('ds1', yVals1),
      createMockDataset('ds2', yVals2)
    ];

    // To trigger intersection, they must share the same yAxisId as well
    const s1 = createMockSeries('s1', 'ds1');
    const s2 = createMockSeries('s2', 'ds2');
    s1.yAxisId = 'shared-y';
    s2.yAxisId = 'shared-y';

    const series = [s1, s2];
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    expect(spots.some(s => s.name.includes('∩'))).toBe(true); // "Series s1 ∩ Series s2"
  });

  it('limits to top 8 spots sorted by importance', () => {
    // If we have many anomalies/intersections/steep changes, we should only get 8.
    // Let's create multiple datasets to generate a bunch of spots.
    const datasets = Array.from({ length: 5 }, (_, i) => {
      const yVals = Array.from({ length: 40 }, () => Math.random() * 10);
      yVals[20] = 100; // Anomaly
      return createMockDataset(`ds${i}`, yVals);
    });

    const series = datasets.map((ds, i) => createMockSeries(`s${i}`, ds.id));
    const xAxes = [createMockXAxis()];

    const spots = findInterestingSpots(datasets, series, xAxes);
    // 5 datasets * (min + max + anomaly + steepest) = 20 spots, plus possible intersections.
    expect(spots.length).toBeLessThanOrEqual(8);
  });
});
