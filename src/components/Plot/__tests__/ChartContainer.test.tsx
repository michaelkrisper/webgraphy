// Mock-heavy component test: store/hook mocks use loose `any` shapes on purpose.
/* eslint-disable @typescript-eslint/no-explicit-any */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, it, expect, vi, beforeEach } from "vitest";
import ChartContainer from "../ChartContainer";
import { EmptyState } from "../EmptyState";
import { useGraphStore } from "../../../store/useGraphStore";
import "@testing-library/jest-dom";

let mockReducedMotion = false;
vi.mock("../../../utils/reducedMotion", () => ({
	prefersReducedMotion: () => mockReducedMotion,
}));

// --- Mock Child Components ---
vi.mock("../WebGLRenderer", () => ({
	WebGLRenderer: vi.fn(() => <div data-testid="webgl-renderer" />),
}));

vi.mock("../Crosshair", () => ({
	Crosshair: vi.fn(() => <div data-testid="crosshair" />),
}));

vi.mock("../ChartLegend", () => ({
	ChartLegend: vi.fn(() => <div data-testid="chart-legend" />),
}));

vi.mock("../EmptyState", () => ({
	EmptyState: vi.fn(() => <div data-testid="empty-state" />),
}));

vi.mock("../../Layout/ImportSettingsDialog", () => ({
	ImportSettingsDialog: vi.fn(() => (
		<div data-testid="import-settings-dialog" />
	)),
}));

// --- Mock Hooks ---
vi.mock("../../../hooks/useTheme", () => ({
	useTheme: () => ["light", vi.fn()],
}));

let mockPendingFile: any = null;
const mockConfirmImport = vi.fn();
const mockCancelImport = vi.fn();
const mockChangeSheet = vi.fn();
const mockImportFiles = vi.fn();

vi.mock("../../../hooks/useDataImport", () => ({
	useDataImport: () => ({
		importFiles: mockImportFiles,
		confirmImport: mockConfirmImport,
		cancelImport: mockCancelImport,
		changeSheet: mockChangeSheet,
		pendingFile: mockPendingFile,
	}),
}));

// --- Mock Store ---
vi.mock("../../../store/useGraphStore", () => {
	const storeFn = vi.fn();
	(storeFn as any).getState = vi.fn(() => ({
		datasets: [],
		series: [],
		xAxes: [],
		yAxes: [],
		isLoaded: true,
		highlightedSeriesId: null,
		legendVisible: true,
		crosshairVisible: true,
		setCrosshairData: vi.fn(),
		batchUpdateAxes: vi.fn(),
	}));
	return { useGraphStore: storeFn };
});

// --- Mock Utilities ---
global.ResizeObserver = class {
	observe() {}
	unobserve() {}
	disconnect() {}
};

describe("ChartContainer", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockPendingFile = null;

		// Default store state (Empty)
		(useGraphStore as any).mockImplementation((selector: any) => {
			const state = {
				datasets: [],
				series: [],
				xAxes: [],
				yAxes: [],
				isLoaded: true,
				highlightedSeriesId: null,
				legendVisible: true,
				crosshairVisible: true,
				setCrosshairData: vi.fn(),
				batchUpdateAxes: vi.fn(),
			};
			return selector(state);
		});
	});

	it("renders EmptyState when there are no datasets or series", () => {
		render(<ChartContainer width={800} height={600} themeName="light" />);
		expect(screen.getByTestId("empty-state")).toBeInTheDocument();
		// WebGLRenderer is always rendered (it returns null or empty inside if no datasets, but React component is there)
		expect(screen.getByTestId("webgl-renderer")).toBeInTheDocument();
	});

	it("renders chart layers when datasets/series exist", () => {
		(useGraphStore as any).mockImplementation((selector: any) => {
			const state = {
				datasets: [
					{
						id: "d1",
						name: "D1",
						columns: ["A: 1", "B: 2"],
						data: [
							{ name: "A: 1", bounds: { min: 0, max: 10 } },
							{ name: "B: 2", bounds: { min: 0, max: 10 } },
						],
						xAxisColumn: "A: 1",
						xAxisId: "x1",
					},
				],
				series: [
					{ id: "s1", sourceId: "d1", type: "line", xCol: "A: 1", yCol: "B: 2" },
				],
				xAxes: [{ id: "x1", min: 0, max: 10, position: "bottom" }],
				yAxes: [{ id: "y1", min: 0, max: 10, position: "left" }],
				isLoaded: true,
				highlightedSeriesId: null,
				legendVisible: true,
				crosshairVisible: true,
				setCrosshairData: vi.fn(),
				batchUpdateAxes: vi.fn(),
			};
			return selector(state);
		});

		render(<ChartContainer width={800} height={600} themeName="light" />);

		expect(screen.queryByTestId("empty-state")).not.toBeInTheDocument();
		expect(screen.getByTestId("webgl-renderer")).toBeInTheDocument();
		expect(screen.getByTestId("chart-legend")).toBeInTheDocument();
		expect(screen.getByTestId("crosshair")).toBeInTheDocument();
	});

	it("renders ImportSettingsDialog when pendingFile exists", async () => {
		mockPendingFile = {
			file: { name: "test.csv" },
			preview: [],
			type: "csv",
			sheets: [],
			selectedSheet: null,
		};

		render(<ChartContainer width={800} height={600} themeName="light" />);
		expect(
			await screen.findByTestId("import-settings-dialog"),
		).toBeInTheDocument();
	});

	it("queues every dropped file, not just the first", () => {
		render(<ChartContainer width={800} height={600} themeName="light" />);
		const files = [
			new File(["a"], "a.csv", { type: "text/csv" }),
			new File(["b"], "b.json", { type: "application/json" }),
		];
		fireEvent.drop(screen.getByRole("main"), { dataTransfer: { files } });
		expect(mockImportFiles).toHaveBeenCalledWith(files);
	});

	it("wires wheel and keyboard interactions on the chart surface without crashing", async () => {
		const mockBatchUpdateAxes = vi.fn();
		(useGraphStore as any).mockImplementation((selector: any) => {
			const state = {
				datasets: [
					{
						id: "d1",
						name: "D1",
						columns: ["A: 1", "B: 2"],
						data: [
							{ name: "A: 1", bounds: { min: 0, max: 10 } },
							{ name: "B: 2", bounds: { min: 0, max: 10 } },
						],
						xAxisColumn: "A: 1",
						xAxisId: "x1",
					},
				],
				series: [
					{
						id: "s1",
						sourceId: "d1",
						type: "line",
						xCol: "A: 1",
						yCol: "B: 2",
						yAxisId: "y1",
					},
				],
				xAxes: [{ id: "x1", min: 0, max: 10, position: "bottom" }],
				yAxes: [{ id: "y1", min: 0, max: 10, position: "left" }],
				isLoaded: true,
				highlightedSeriesId: null,
				legendVisible: true,
				crosshairVisible: true,
				setCrosshairData: vi.fn(),
				batchUpdateAxes: mockBatchUpdateAxes,
			};
			return selector(state);
		});

		render(<ChartContainer width={800} height={600} themeName="light" />);

		const container = screen.getByRole("main");
		// Exercise the wheel + keyboard handlers ChartContainer attaches. The
		// resulting viewport math is covered by the usePanZoom tests; here we only
		// assert the surface stays mounted and interactive after the events fire.
		fireEvent.wheel(container, { clientX: 400, clientY: 300, deltaY: 100 });
		container.focus();
		fireEvent.keyDown(container, { key: "ArrowRight", code: "ArrowRight" });
		fireEvent.keyDown(container, { key: "+", code: "Equal" });

		await new Promise((r) => setTimeout(r, 50));

		expect(container).toBeInTheDocument();
		expect(screen.getByTestId("webgl-renderer")).toBeInTheDocument();
	});

	it("wires the empty state's import and demo-data actions", () => {
		render(<ChartContainer />);
		const props = vi.mocked(EmptyState).mock.calls.at(-1)?.[0];
		expect(props?.onImportFiles).toBe(mockImportFiles);
		const loadDemoData = vi.fn();
		(useGraphStore as any).getState.mockReturnValueOnce({ loadDemoData });
		props?.onLoadDemo?.();
		expect(loadDemoData).toHaveBeenCalledTimes(1);
	});

	describe("keyboard viewport changes", () => {
		const batchUpdateAxes = vi.fn();
		const storeState = () => ({
			datasets: [
				{
					id: "d1",
					name: "D1",
					columns: ["A: 1", "B: 2"],
					data: [
						{ name: "A: 1", bounds: { min: 0, max: 10 } },
						{ name: "B: 2", bounds: { min: 0, max: 10 } },
					],
					xAxisColumn: "A: 1",
					xAxisId: "x1",
				},
			],
			series: [{ id: "s1", sourceId: "d1", yColumn: "B: 2", yAxisId: "y1" }],
			xAxes: [{ id: "x1", name: "", min: 0, max: 10, showGrid: true }],
			yAxes: [{ id: "y1", name: "", min: 0, max: 10, position: "left" }],
			isLoaded: true,
			highlightedSeriesId: null,
			legendVisible: false,
			crosshairVisible: false,
			batchUpdateAxes,
		});
		const lastX1 = () => batchUpdateAxes.mock.calls.at(-1)?.[0]?.x1;
		const frames = () => new Promise((r) => setTimeout(r, 120));

		beforeEach(() => {
			const state = storeState();
			(useGraphStore as any).mockImplementation((sel: any) => sel(state));
			(useGraphStore as any).getState.mockImplementation(() => state);
		});

		afterEach(() => {
			mockReducedMotion = false;
		});

		it("steps only the focused axis zone's range", async () => {
			render(<ChartContainer />);
			await frames();
			batchUpdateAxes.mockClear();
			const zone = screen.getByRole("group", { name: /^X axis x1/ });
			fireEvent.keyDown(zone, { key: "ArrowRight" });
			await frames();
			expect(lastX1()).toEqual({ min: 0.5, max: 10.5 });
			expect(batchUpdateAxes.mock.calls.at(-1)?.[1]).toEqual({});
		});

		it("under reduced motion, a held arrow key moves one step, not a glide", async () => {
			mockReducedMotion = true;
			render(<ChartContainer />);
			await frames();
			batchUpdateAxes.mockClear();
			// keydown with no keyup: the key is still held for several frames.
			fireEvent.keyDown(window, { key: "ArrowRight" });
			await frames();
			expect(lastX1()).toEqual({ min: 0.5, max: 10.5 });
			fireEvent.keyUp(window, { key: "ArrowRight" });
		});

		it("with full motion, a held arrow key keeps panning every frame", async () => {
			render(<ChartContainer />);
			await frames();
			batchUpdateAxes.mockClear();
			fireEvent.keyDown(window, { key: "ArrowRight" });
			await frames();
			fireEvent.keyUp(window, { key: "ArrowRight" });
			expect(lastX1()?.min).toBeGreaterThan(0.5);
		});
	});
});
