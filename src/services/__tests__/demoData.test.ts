import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { generateDemoDataset, getDemoAppState } from '../demoData';
import { type Dataset } from '../persistence';

describe('demoData', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2024, 0, 1));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('generateDemoDataset', () => {
    it('should generate a dataset with correct structure and metadata', () => {
      const dataset = generateDemoDataset();

      expect(dataset.id).toBe('demo-dataset');
      expect(dataset.name).toBe('A - Demo Weather Station');
      expect(dataset.rowCount).toBe(525600);
      expect(dataset.columns).toHaveLength(5);
      expect(dataset.columns).toContain('A: Timestamp');
      expect(dataset.columns).toContain('A: Temperature (°C)');
      expect(dataset.columns).toContain('A: Humidity (%)');
      expect(dataset.columns).toContain('A: Solar Irradiance (W/m²)');
      expect(dataset.columns).toContain('A: Wind Speed (m/s)');
      expect(dataset.xAxisColumn).toBe('A: Timestamp');
      expect(dataset.xAxisId).toBe('axis-1');
    });

    it('should have correct data column structures', () => {
      const dataset = generateDemoDataset();

      dataset.data.forEach((column, index) => {
        expect(column.data).toBeInstanceOf(Float32Array);
        expect(column.data.length).toBe(dataset.rowCount);
        expect(column.refPoint).toBeDefined();
        expect(column.bounds).toBeDefined();
        expect(column.bounds.min).toBeLessThanOrEqual(column.bounds.max);

        if (dataset.columns[index] === 'A: Timestamp') {
          expect(column.isFloat64).toBe(true);
        } else {
          expect(column.isFloat64).toBe(false);
        }
      });
    });

    it('should have data values within reasonable bounds', () => {
      const dataset = generateDemoDataset();

      const tempCol = dataset.data[1];
      expect(tempCol.bounds.min).toBeGreaterThanOrEqual(-50);
      expect(tempCol.bounds.max).toBeLessThanOrEqual(100);

      const humidityCol = dataset.data[2];
      expect(humidityCol.bounds.min).toBeGreaterThanOrEqual(0);
      expect(humidityCol.bounds.max).toBeLessThanOrEqual(100);

      const solarCol = dataset.data[3];
      expect(solarCol.bounds.min).toBeGreaterThanOrEqual(0);

      const windCol = dataset.data[4];
      expect(windCol.bounds.min).toBeGreaterThanOrEqual(0);
    });

    it('should have bounds that match the actual data', () => {
      const dataset = generateDemoDataset();

      dataset.data.forEach((column) => {
        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < column.data.length; i++) {
          const val = column.data[i] + column.refPoint;
          if (val < min) min = val;
          if (val > max) max = val;
        }
        // Use closeTo because of floating point precision
        // Note: The bounds logic in demoData calculates bounds from the actual arrays
        // Due to Float32Array precision differences when reading back out, a tolerance of 1 is acceptable
        expect(column.bounds.min).toBeCloseTo(min, 1);
        expect(column.bounds.max).toBeCloseTo(max, 1);
      });
    });

    it('should generate deterministic timestamps strictly increasing by 60', () => {
      const dataset = generateDemoDataset();
      const tsCol = dataset.data[0];

      expect(tsCol.refPoint).toBe(Math.floor(new Date(2024, 0, 1).getTime() / 1000));

      // Timestamp bounds check
      expect(tsCol.bounds.max - tsCol.bounds.min).toBe((dataset.rowCount - 1) * 60);

      // Relative data check
      expect(tsCol.data[0]).toBe(0);
      expect(tsCol.data[1]).toBe(60);
      expect(tsCol.data[2]).toBe(120);
      expect(tsCol.data[dataset.rowCount - 1]).toBe((dataset.rowCount - 1) * 60);
    });

    it('should generate expected specific data values when randomness is mocked', () => {
      vi.spyOn(Math, 'random').mockReturnValue(0.5);
      const dataset = generateDemoDataset();

      expect(dataset.data[1].refPoint + dataset.data[1].data[0]).toBeCloseTo(0.5, 2);
      expect(dataset.data[2].refPoint + dataset.data[2].data[0]).toBeCloseTo(83.2, 2);
      expect(dataset.data[3].refPoint + dataset.data[3].data[0]).toBeCloseTo(0, 2);
      expect(dataset.data[4].refPoint + dataset.data[4].data[0]).toBeCloseTo(2, 2);

      vi.restoreAllMocks();
    }, 10000);

    it('should have valid chunkMin and chunkMax for each column', () => {
      const dataset = generateDemoDataset();
      const CHUNK_SIZE = 512;
      const expectedNumChunks = Math.ceil(dataset.rowCount / CHUNK_SIZE);

      dataset.data.forEach((column) => {
        expect(column.chunkMin).toBeDefined();
        expect(column.chunkMax).toBeDefined();
        expect(column.chunkMin).toBeInstanceOf(Float32Array);
        expect(column.chunkMax).toBeInstanceOf(Float32Array);
        expect(column.chunkMin!.length).toBe(expectedNumChunks);
        expect(column.chunkMax!.length).toBe(expectedNumChunks);

        // Verify bounds for the first and last chunk
        for (const chunkIndex of [0, expectedNumChunks - 1]) {
          const start = chunkIndex * CHUNK_SIZE;
          const end = Math.min(start + CHUNK_SIZE, dataset.rowCount);
          let expectedMin = Infinity;
          let expectedMax = -Infinity;

          for (let i = start; i < end; i++) {
            const val = column.data[i];
            if (val < expectedMin) expectedMin = val;
            if (val > expectedMax) expectedMax = val;
          }

          expect(column.chunkMin![chunkIndex]).toBeCloseTo(expectedMin, 4);
          expect(column.chunkMax![chunkIndex]).toBeCloseTo(expectedMax, 4);
        }
      });
    });
  });

  describe('getDemoAppState', () => {
    it('should return a correctly configured AppState', () => {
      // Mock crypto.randomUUID
      const mockUUID = 'test-uuid';
      vi.stubGlobal('crypto', {
        randomUUID: () => mockUUID
      });

      const mockDataset = {
        id: 'mock-dataset-id',
        name: 'Mock Dataset',
        rowCount: 10,
        xAxisColumn: 'A: Timestamp',
        xAxisId: 'axis-1',
        columns: [
          'A: Timestamp',
          'A: Temperature (°C)',
          'A: Humidity (%)',
          'A: Solar Irradiance (W/m²)',
          'A: Wind Speed (m/s)'
        ],
        data: [
          {
            isFloat64: true,
            refPoint: 0,
            bounds: { min: 1000000, max: 2000000 },
            data: new Float64Array(10)
          },
          {
            isFloat64: false,
            refPoint: 0,
            bounds: { min: 0, max: 10 },
            data: new Float32Array(10)
          },
          {
            isFloat64: false,
            refPoint: 0,
            bounds: { min: 0, max: 100 },
            data: new Float32Array(10)
          },
          {
            isFloat64: false,
            refPoint: 0,
            bounds: { min: 0, max: 1000 },
            data: new Float32Array(10)
          },
          {
            isFloat64: false,
            refPoint: 0,
            bounds: { min: 0, max: 20 },
            data: new Float32Array(10)
          }
        ]
      } as unknown as Dataset;

      const appState = getDemoAppState(mockDataset);

      expect(appState.xAxes).toHaveLength(9);
      expect(appState.yAxes).toHaveLength(9);
      expect(appState.series).toHaveLength(4);
      expect(appState.views).toHaveLength(4);

      expect(appState.xAxes[0].min).toBe(mockDataset.data[0].bounds.min);
      expect(appState.xAxes[0].max).toBe(mockDataset.data[0].bounds.max);

      // Check Y-axis overrides
      expect(appState.yAxes[0].name).toBe('Temperature (°C)');
      expect(appState.yAxes[1].name).toBe('Humidity (%)');
      expect(appState.yAxes[2].name).toBe('Solar Irradiance (W/m²)');
      expect(appState.yAxes[3].name).toBe('Wind Speed (m/s)');

      // Check series links
      appState.series.forEach((s, i) => {
        expect(s.sourceId).toBe(mockDataset.id);
        expect(s.yColumn).toBe(mockDataset.columns[i + 1]);
        expect(s.yAxisId).toBe(`axis-${i + 1}`);
        expect(s.id).toBe(mockUUID);
      });

      // Check views
      expect(appState.views?.[0].name).toBe('Full Year Overview');
      expect(appState.views?.[1].name).toBe('Summer Week (High Solar)');
      expect(appState.views?.[2].name).toBe('Winter Day (Low Solar, Cold)');
      expect(appState.views?.[3].name).toBe('Spring Storm (3 Days)');

      vi.unstubAllGlobals();
    });
  });
});
