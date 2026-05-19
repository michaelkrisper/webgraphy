import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, SeriesConfig } from "../services/persistence";
import { useAutoScale } from "./useAutoScale";

vi.mock("../store/useGraphStore", () => ({
	useGraphStore: {
		getState: vi.fn(() => ({
			batchUpdateAxes: vi.fn(),
		})),
	},
}));

import { useGraphStore } from "../store/useGraphStore";

describe("useAutoScale", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	const basePadding = { top: 10, right: 10, bottom: 10, left: 10 };
	const baseChartHeight = 500;

	it("should initialize and return handlers", () => {
		const syncViewport = vi.fn();
		const targetXAxes = { current: {} };
		const targetYs = { current: {} };

		const { result } = renderHook(() =>
			useAutoScale({
				isLoaded: true,
				series: [],
				datasets: [],
				xAxes: [],
				activeYAxes: [],
				activeXAxesUsed: [],
				padding: basePadding,
				chartHeight: baseChartHeight,
				targetXAxes,
				targetYs,
				syncViewport,
			}),
		);

		expect(result.current.handleAutoScaleY).toBeInstanceOf(Function);
		expect(result.current.handleAutoScaleX).toBeInstanceOf(Function);
		expect(result.current.handleStackedFit).toBeInstanceOf(Function);
	});

	describe("handleAutoScaleY", () => {
		it("should scale Y axis when mouseY is undefined (full fit)", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([10, 20, 30]),
							min: 10,
							max: 30,
							refPoint: 0,
							bounds: { min: 10, max: 30 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			const { result } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					xAxes: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					activeYAxes: [{ id: "y-axis-1", label: "Y", min: 0, max: 100 }],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			act(() => {
				result.current.handleAutoScaleY("y-axis-1");
			});

			expect(targetYs.current["y-axis-1"]).toBeDefined();
			expect(targetYs.current["y-axis-1"].min).toBeCloseTo(0.79);
			expect(targetYs.current["y-axis-1"].max).toBeCloseTo(3.21);
			expect(syncViewport).toHaveBeenCalled();
		});

		it("should scale Y axis when mouseY is defined (viewport-filtered fit)", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: { "axis-1": { min: 1.5, max: 2.5 } } };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						// Note: visibleIndexRange uses refX/refY and values. xData: 1, 2, 3
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						// yData: 10, 20, 30
						{
							data: new Float32Array([10, 20, 30]),
							min: 10,
							max: 30,
							refPoint: 0,
							bounds: { min: 10, max: 30 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			const { result } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					xAxes: [{ id: "axis-1", label: "X", min: 1.5, max: 2.5 }], // x bounds restrict to value 2 (idx 1), so y is 20
					activeYAxes: [{ id: "y-axis-1", label: "Y", min: 0, max: 100 }],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 1.5, max: 2.5 }],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			act(() => {
				// mouseY in middle
				result.current.handleAutoScaleY("y-axis-1", baseChartHeight / 2);
			});

			// yMin = 20, yMax = 20 -> r = 1
			// pad = 0.05

			// 0.1 * 0.05 = 0.005

			expect(targetYs.current["y-axis-1"]).toBeDefined();
			expect(targetYs.current["y-axis-1"].min).toBeCloseTo(1.945);
			expect(targetYs.current["y-axis-1"].max).toBeCloseTo(2.055);
			expect(syncViewport).toHaveBeenCalled();
		});
	});

	describe("handleAutoScaleX", () => {
		it("should scale X axis using datasets active in series", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			const { result } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					xAxes: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					activeYAxes: [{ id: "y-axis-1", label: "Y", min: 0, max: 100 }],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			act(() => {
				result.current.handleAutoScaleX("axis-1");
			});

			expect(targetXAxes.current["axis-1"]).toBeDefined();
			expect(targetXAxes.current["axis-1"].min).toBeCloseTo(0.9);
			expect(targetXAxes.current["axis-1"].max).toBeCloseTo(3.1);
			expect(syncViewport).toHaveBeenCalled();
		});

		it("should scale all active X axes when no id is provided", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
					],
				},
				{
					id: "ds2",
					name: "Dataset 2",
					xAxisColumn: "x2",
					xAxisId: "axis-2",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([4, 5, 6]),
							min: 4,
							max: 6,
							refPoint: 0,
							bounds: { min: 4, max: 6 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
				{
					id: "s2",
					sourceId: "ds2",
					yColumn: "y",
					yAxisId: "y-axis-2",
					color: "blue",
					name: "S2",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			const { result } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					xAxes: [
						{ id: "axis-1", label: "X1", min: 0, max: 5 },
						{ id: "axis-2", label: "X2", min: 0, max: 5 },
					],
					activeYAxes: [
						{ id: "y-axis-1", label: "Y1", min: 0, max: 100 },
						{ id: "y-axis-2", label: "Y2", min: 0, max: 100 },
					],
					activeXAxesUsed: [
						{ id: "axis-1", label: "X1", min: 0, max: 5 },
						{ id: "axis-2", label: "X2", min: 0, max: 5 },
					],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			act(() => {
				result.current.handleAutoScaleX();
			});

			expect(targetXAxes.current["axis-1"]).toBeDefined();
			expect(targetXAxes.current["axis-2"]).toBeDefined();
			expect(syncViewport).toHaveBeenCalled();
		});
	});

	describe("handleStackedFit", () => {
		it("should split chart height evenly for multiple Y axes", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2]),
							min: 1,
							max: 2,
							refPoint: 0,
							bounds: { min: 1, max: 2 },
						},
						{
							data: new Float32Array([10, 20]),
							min: 10,
							max: 20,
							refPoint: 0,
							bounds: { min: 10, max: 20 },
						},
					],
				},
				{
					id: "ds2",
					name: "Dataset 2",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2]),
							min: 1,
							max: 2,
							refPoint: 0,
							bounds: { min: 1, max: 2 },
						},
						{
							data: new Float32Array([1, 2]),
							min: 1,
							max: 2,
							refPoint: 0,
							bounds: { min: 1, max: 2 },
						},
						{
							data: new Float32Array([30, 40]),
							min: 30,
							max: 40,
							refPoint: 0,
							bounds: { min: 30, max: 40 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
				{
					id: "s2",
					sourceId: "ds2",
					yColumn: "y2",
					yAxisId: "y-axis-2",
					color: "blue",
					name: "S2",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			const { result } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					xAxes: [{ id: "axis-1", label: "X", min: 1, max: 2 }],
					activeYAxes: [
						{ id: "y-axis-1", label: "Y1", min: 0, max: 100 },
						{ id: "y-axis-2", label: "Y2", min: 0, max: 100 },
					],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 1, max: 2 }],
					padding: basePadding,
					chartHeight: 500, // 2 axes, 250px each slice
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			act(() => {
				result.current.handleStackedFit();
			});

			expect(targetYs.current["y-axis-1"]).toBeDefined();
			expect(targetYs.current["y-axis-2"]).toBeDefined();
			expect(syncViewport).toHaveBeenCalled();
		});
	});

	describe("Effects: Initial Data Load", () => {
		it("should calculate initial X and Y targets and batchUpdateAxes", () => {
			const syncViewport = vi.fn();
			const batchUpdateAxes = vi.fn();
			vi.mocked(useGraphStore.getState).mockReturnValue({
				batchUpdateAxes,
			} as unknown as ReturnType<typeof useGraphStore.getState>);

			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2]),
							min: 1,
							max: 2,
							refPoint: 0,
							bounds: { min: 1, max: 2 },
						},
						{
							data: new Float32Array([10, 20]),
							min: 10,
							max: 20,
							refPoint: 0,
							bounds: { min: 10, max: 20 },
						},
					],
				},
			];

			const series: SeriesConfig[] = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series,
					datasets,
					// Provide axes outside bounds so it triggers reset
					xAxes: [{ id: "axis-1", label: "X", min: 100, max: 200 }],
					activeYAxes: [{ id: "y-axis-1", label: "Y", min: 0, max: 100 }],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 100, max: 200 }],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			expect(batchUpdateAxes).toHaveBeenCalled();
			expect(syncViewport).toHaveBeenCalled();
		});

		it("should auto-scale Y when a new series is added", () => {
			const syncViewport = vi.fn();
			const targetXAxes = { current: {} };
			const targetYs = { current: {} };

			const datasets: Dataset[] = [
				{
					id: "ds1",
					name: "Dataset 1",
					xAxisColumn: "x",
					xAxisId: "axis-1",
					columns: ["x", "y", "x2", "y2"],
					data: [
						{
							data: new Float32Array([1, 2, 3]),
							min: 1,
							max: 3,
							refPoint: 0,
							bounds: { min: 1, max: 3 },
						},
						{
							data: new Float32Array([1, 2]),
							min: 1,
							max: 2,
							refPoint: 0,
							bounds: { min: 1, max: 2 },
						},
						{
							data: new Float32Array([10, 20]),
							min: 10,
							max: 20,
							refPoint: 0,
							bounds: { min: 10, max: 20 },
						},
					],
				},
			];

			let currentSeries: SeriesConfig[] = [];

			const { rerender } = renderHook(() =>
				useAutoScale({
					isLoaded: true,
					series: currentSeries,
					datasets,
					xAxes: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					activeYAxes: [{ id: "y-axis-1", label: "Y", min: 0, max: 100 }],
					activeXAxesUsed: [{ id: "axis-1", label: "X", min: 0, max: 5 }],
					padding: basePadding,
					chartHeight: baseChartHeight,
					targetXAxes,
					targetYs,
					syncViewport,
				}),
			);

			// Add a series
			currentSeries = [
				{
					id: "s1",
					sourceId: "ds1",
					yColumn: "y",
					yAxisId: "y-axis-1",
					color: "red",
					name: "S1",
					type: "line",
					visible: true,
					width: 1,
					zIndex: 1,
				},
			];

			rerender();

			expect(targetYs.current["y-axis-1"]).toBeDefined();
		});
	});
});
