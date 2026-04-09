import { describe, it, expect, vi } from 'vitest';
import { generateDemoDataset, getDemoAppState } from '../demoData';

describe('demoData', () => {
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
        expect(column.bounds.min).toBeCloseTo(min, 3);
        expect(column.bounds.max).toBeCloseTo(max, 3);
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

      const dataset = generateDemoDataset();
      const appState = getDemoAppState(dataset);

      expect(appState.xAxes).toHaveLength(9);
      expect(appState.yAxes).toHaveLength(9);
      expect(appState.series).toHaveLength(4);
      expect(appState.views).toHaveLength(4);

      // Check Y-axis overrides
      expect(appState.yAxes[0].name).toBe('Temperature (°C)');
      expect(appState.yAxes[1].name).toBe('Humidity (%)');
      expect(appState.yAxes[2].name).toBe('Solar Irradiance (W/m²)');
      expect(appState.yAxes[3].name).toBe('Wind Speed (m/s)');

      // Check series links
      appState.series.forEach((s, i) => {
        expect(s.sourceId).toBe(dataset.id);
        expect(s.yColumn).toBe(dataset.columns[i + 1]);
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
