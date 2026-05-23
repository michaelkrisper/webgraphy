import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ChartContainer from "../ChartContainer";
import { useGraphStore } from "../../../store/useGraphStore";

// Mock child components to isolate top-level rendering
vi.mock("../AxesLayer", () => ({ AxesLayer: () => <div data-testid="mock-axes-layer" /> }));
vi.mock("../WebGLRenderer", () => ({ WebGLRenderer: () => <div data-testid="mock-webgl-renderer" /> }));
vi.mock("../ChartLegend", () => ({ ChartLegend: () => <div data-testid="mock-chart-legend" /> }));
vi.mock("../Crosshair", () => ({ Crosshair: () => <div data-testid="mock-crosshair" /> }));
vi.mock("../EmptyState", () => ({ EmptyState: () => <div data-testid="mock-empty-state" /> }));
vi.mock("../../Layout/ImportSettingsDialog", () => ({ ImportSettingsDialog: () => <div data-testid="mock-import-settings" /> }));

vi.mock("../../../store/useGraphStore", () => {
    const mockFn = vi.fn();
    (mockFn as any).getState = vi.fn(() => ({
        datasets: [],
        series: [],
        xAxes: [],
        yAxes: [],
        batchUpdateAxes: vi.fn(),
    }));
    return { useGraphStore: mockFn };
});

vi.mock("../../../hooks/useAutoScale", () => ({
    useAutoScale: () => ({ handleAutoScaleX: vi.fn(), handleAutoScaleY: vi.fn() })
}));
vi.mock("../../../hooks/useDataImport", () => ({
    useDataImport: () => ({ importFile: vi.fn(), confirmImport: vi.fn(), cancelImport: vi.fn(), changeSheet: vi.fn(), pendingFile: null })
}));
vi.mock("../../../hooks/usePanZoom", () => ({
    usePanZoom: () => ({ handleMouseDown: vi.fn(), handleTouchStart: vi.fn(), handleWheel: vi.fn() })
}));
vi.mock("../../../hooks/useTheme", () => ({
    useTheme: () => ["dark"]
}));

describe("ChartContainer", () => {
	beforeEach(() => {
		// Mock ResizeObserver
		global.ResizeObserver = class ResizeObserver {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
	});

	afterEach(() => {
		vi.restoreAllMocks();
		delete (global as any).ResizeObserver;
	});

	it("renders EmptyState when there are no datasets", () => {
		(useGraphStore as any).mockImplementation((selector: any) =>
			selector({
				datasets: [],
				series: [],
				xAxes: [],
				yAxes: [],
				isLoaded: true,
			}),
		);

		render(<ChartContainer />);
		expect(screen.getByTestId("mock-empty-state")).toBeInTheDocument();
	});

	it("renders children when datasets exist", () => {
		(useGraphStore as any).mockImplementation((selector: any) =>
			selector({
				datasets: [{ id: "ds1", name: "Dataset 1", columns: [], data: [] }],
				series: [{ id: "s1", sourceId: "ds1", yAxisId: "y1", yColumns: ["val"], color: "red", visible: true, lineStyle: "solid", lineWidth: 1 }],
				xAxes: [{ id: "x1", min: 0, max: 10, showGrid: true, showLabels: true }],
				yAxes: [{ id: "y1", min: 0, max: 10, showGrid: true, showLabels: true, position: "left" }],
				isLoaded: true,
			}),
		);

		render(<ChartContainer />);
		expect(screen.getByTestId("mock-axes-layer")).toBeInTheDocument();
		expect(screen.getByTestId("mock-webgl-renderer")).toBeInTheDocument();
	});
});
