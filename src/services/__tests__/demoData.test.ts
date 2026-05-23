import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as randomUtils from "../../utils/random";
import { generateDemoDataset, getDemoAppState } from "../demoData";
import type { Dataset } from "../persistence";

describe("demoData", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.setSystemTime(new Date(2024, 0, 1));
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe("generateDemoDataset", () => {
		it("should generate a dataset with correct structure and metadata", () => {
			const dataset = generateDemoDataset(100);

			expect(dataset.id).toBe("demo-dataset");
			expect(dataset.name).toBe("Weather Demo");
			expect(dataset.rowCount).toBe(100);
			expect(dataset.columns).toHaveLength(5);
			expect(dataset.columns).toContain("Demo: Timestamp");
			expect(dataset.columns).toContain("Demo: Temperature (°C)");
			expect(dataset.columns).toContain("Demo: Humidity (%)");
			expect(dataset.columns).toContain("Demo: Solar Irradiance (W/m²)");
			expect(dataset.columns).toContain("Demo: Wind Speed (m/s)");
			expect(dataset.xAxisColumn).toBe("Demo: Timestamp");
			expect(dataset.xAxisId).toBe("axis-1");
		});

		it("should have correct data column structures", () => {
			const dataset = generateDemoDataset(100);

			dataset.data.forEach((column, index) => {
				expect(column.data).toBeInstanceOf(Float32Array);
				expect(column.data.length).toBe(dataset.rowCount);
				expect(column.refPoint).toBeDefined();
				expect(column.bounds).toBeDefined();
				expect(column.bounds.min).toBeLessThanOrEqual(column.bounds.max);

				if (dataset.columns[index] === "Demo: Timestamp") {
					expect(column.isFloat64).toBe(true);
				} else {
					expect(column.isFloat64).toBe(false);
				}
			});
		});

		it("should have data values within reasonable bounds", () => {
			const dataset = generateDemoDataset(100);

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

		it("should have bounds that match the actual data", () => {
			const dataset = generateDemoDataset(100);

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

		it("should generate deterministic timestamps strictly increasing by 60", () => {
			const dataset = generateDemoDataset(100);
			const tsCol = dataset.data[0];

			expect(tsCol.refPoint).toBe(
				Math.floor(new Date(2024, 0, 1).getTime() / 1000),
			);

			// Timestamp bounds check
			expect(tsCol.bounds.max - tsCol.bounds.min).toBe(
				(dataset.rowCount - 1) * 60,
			);

			// Relative data check
			expect(tsCol.data[0]).toBe(0);
			expect(tsCol.data[1]).toBe(60);
			expect(tsCol.data[2]).toBe(120);
			expect(tsCol.data[dataset.rowCount - 1]).toBe(
				(dataset.rowCount - 1) * 60,
			);
		});

		it("should generate expected specific data values when randomness is mocked", () => {
			vi.spyOn(randomUtils, "secureRandom").mockReturnValue(0.5);
			const dataset = generateDemoDataset(100);

			expect(dataset.data[1].refPoint + dataset.data[1].data[0]).toBeCloseTo(
				5,
				2,
			);
			expect(dataset.data[2].refPoint + dataset.data[2].data[0]).toBeCloseTo(
				70,
				2,
			);
			expect(dataset.data[3].refPoint + dataset.data[3].data[0]).toBeCloseTo(
				0,
				2,
			);
			expect(dataset.data[4].refPoint + dataset.data[4].data[0]).toBeCloseTo(
				4,
				2,
			);

			vi.restoreAllMocks();
		}, 10000);
	});

	it("should apply cloud passing effect on solar irradiance and trigger wind peaks", () => {
		// First, generate base dataset with predictable randomness (e.g. 0.5) to act as a control.
		vi.spyOn(randomUtils, "secureRandom").mockReturnValue(0.5);
		const baseDataset = generateDemoDataset(1000);

		// Then generate another dataset with high randomness (0.99) to trigger edge cases.
		let callCount = 0;
		vi.spyOn(randomUtils, "secureRandom").mockImplementation(() => {
			callCount++;
			return 0.99;
		});
		const edgeDataset = generateDemoDataset(1000);

		// Verify solar irradiance reduction due to clouds (hour 12 is daytime)
		// rowCount = 1000 -> 1000 minutes = 16.6 hours. Hour of day starts at 0.
		// Let's check row index 720 (12 hours * 60 mins). This is definitely daytime.
		const daytimeIdx = 720;

		const baseSolarCol = baseDataset.data[3];
		const edgeSolarCol = edgeDataset.data[3];
		const baseSolarValue =
			baseSolarCol.data[daytimeIdx] + baseSolarCol.refPoint;
		const edgeSolarValue =
			edgeSolarCol.data[daytimeIdx] + edgeSolarCol.refPoint;

		// Ensure it was daytime so there was actually solar irradiance to start with
		expect(baseSolarValue).toBeGreaterThan(0);
		// Edge solar should be scaled down by 0.3 since 0.99 > 0.95
		// Because randomness contributes 0 noise to solar in the base, we can directly compare them.
		expect(edgeSolarValue).toBeCloseTo(baseSolarValue * 0.3, 1);

		// Verify wind speed peaks
		const baseWindCol = baseDataset.data[4];
		const edgeWindCol = edgeDataset.data[4];
		const baseWindValue = baseWindCol.data[daytimeIdx] + baseWindCol.refPoint;
		const edgeWindValue = edgeWindCol.data[daytimeIdx] + edgeWindCol.refPoint;

		// Base wind (0.5) is just windBase + 0.5 * 2
		// Edge wind (0.99) should trigger peak: windBase + 0.99 * 10
		// Diff is roughly 8.98
		expect(edgeWindValue).toBeGreaterThan(baseWindValue + 8);

		vi.restoreAllMocks();
	});

	describe("getDemoAppState", () => {
		it("should return a correctly configured AppState", () => {
			// Mock crypto.randomUUID
			const mockUUID = "test-uuid";
			vi.stubGlobal("crypto", {
				randomUUID: () => mockUUID,
			});

			const mockDataset = {
				id: "mock-dataset-id",
				name: "Mock Dataset",
				rowCount: 10,
				xAxisColumn: "A: Timestamp",
				xAxisId: "axis-1",
				columns: [
					"A: Timestamp",
					"A: Temperature (°C)",
					"A: Humidity (%)",
					"A: Solar Irradiance (W/m²)",
					"A: Wind Speed (m/s)",
				],
				data: [
					{
						isFloat64: true,
						refPoint: 0,
						bounds: { min: 1000000, max: 2000000 },
						data: new Float64Array(10),
					},
					{
						isFloat64: false,
						refPoint: 0,
						bounds: { min: 0, max: 10 },
						data: new Float32Array(10),
					},
					{
						isFloat64: false,
						refPoint: 0,
						bounds: { min: 0, max: 100 },
						data: new Float32Array(10),
					},
					{
						isFloat64: false,
						refPoint: 0,
						bounds: { min: 0, max: 1000 },
						data: new Float32Array(10),
					},
					{
						isFloat64: false,
						refPoint: 0,
						bounds: { min: 0, max: 20 },
						data: new Float32Array(10),
					},
				],
			} as unknown as Dataset;

			const appState = getDemoAppState(mockDataset);

			expect(appState.yAxes).toHaveLength(3);
			expect(appState.series).toHaveLength(4);

			// Check Y-axis overrides
			expect(appState.yAxes[0].name).toBe("Temp & Hum");
			expect(appState.yAxes[1].name).toBe("Solar");
			expect(appState.yAxes[2].name).toBe("Wind");

			// Check series links
			appState.series.forEach((s, i) => {
				expect(s.sourceId).toBe(mockDataset.id);
				expect(s.yColumn).toBe(mockDataset.columns[i + 1]);
				expect(s.id).toBe(mockUUID);
			});

			vi.unstubAllGlobals();
		});
	});
});
