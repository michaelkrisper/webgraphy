import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import ChartContainer from "../ChartContainer";

/**
 * Real ChartContainer + WebGLRenderer + store, counting the backend's draws:
 * settling a pan/zoom used to draw two full-resolution frames — one from the
 * renderer's isInteracting effect and one from the container's store-sync
 * effect reacting to the ranges the settle frame had just written.
 */

const backend = vi.hoisted(() => ({
	setViewport: vi.fn(),
	setPlotBg: vi.fn(),
	setSeries: vi.fn(),
	setOverlay: vi.fn(),
	setLabels: vi.fn(),
	sceneShared: vi.fn(() => false),
	setSceneContext: vi.fn(),
	redraw: vi.fn(),
	dispose: vi.fn(),
}));

vi.mock("../renderBackend", () => ({
	acquireRenderBackend: () => backend,
	releaseRenderBackend: vi.fn(),
}));

vi.mock("../../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		clearAppState: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../../hooks/useDataImport", () => ({
	useDataImport: () => ({
		importFiles: vi.fn(),
		confirmImport: vi.fn(),
		cancelImport: vi.fn(),
		changeSheet: vi.fn(),
		pendingFile: null,
	}),
}));

const dataset: Dataset = {
	id: "d1",
	name: "D1",
	columns: ["Time", "Value"],
	data: [
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 10 },
			data: new Float32Array([0, 5, 10]),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 10 },
			data: new Float32Array([1, 7, 3]),
		},
	],
	rowCount: 3,
	xAxisColumn: "Time",
	xAxisId: "axis-1",
};

const fullResDraws = () =>
	backend.redraw.mock.calls.filter((c) => c[2] === false).length;
const frames = (ms = 50) =>
	act(() => new Promise<void>((r) => setTimeout(r, ms)));

describe("pan/zoom settle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		global.ResizeObserver = class {
			observe() {}
			unobserve() {}
			disconnect() {}
		};
		vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
			x: 0,
			y: 0,
			left: 0,
			top: 0,
			right: 800,
			bottom: 600,
			width: 800,
			height: 600,
			toJSON: () => ({}),
		});
		useGraphStore.setState({ isLoaded: false, datasets: [], series: [] });
		useGraphStore.getState().addDataset(dataset);
		useGraphStore.getState().addSeries({
			id: "s1",
			sourceId: "d1",
			name: "Value",
			yColumn: "Value",
			yAxisId: "axis-1",
			pointStyle: "circle",
			pointColor: "#ff0000",
			lineStyle: "solid",
			lineColor: "#ff0000",
			hidden: false,
		});
		useGraphStore.setState({ isLoaded: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("draws exactly one full-resolution frame when a wheel zoom settles", async () => {
		render(<ChartContainer />);
		await frames();
		const xBefore = useGraphStore.getState().xAxes[0];

		fireEvent.wheel(screen.getByRole("main"), {
			clientX: 400,
			clientY: 300,
			deltaY: 100,
		});
		await frames();
		backend.redraw.mockClear();

		// The wheel's 300ms idle timeout ends the interaction.
		await frames(400);
		expect(useGraphStore.getState().xAxes[0]).not.toEqual(xBefore);
		expect(fullResDraws()).toBe(1);

		// A range change from elsewhere (sidebar, undo) is not an echo.
		backend.redraw.mockClear();
		act(() => {
			useGraphStore.getState().updateXAxis("axis-1", { min: 2, max: 4 });
		});
		await frames();
		expect(fullResDraws()).toBe(1);
		expect(backend.redraw.mock.lastCall?.[0][0]).toMatchObject({
			min: 2,
			max: 4,
		});
	});
});
