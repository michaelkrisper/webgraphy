import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import ChartContainer from "../ChartContainer";

/**
 * Real ChartContainer + store: typed axis ranges and the Alt+arrow zoom
 * history, end to end through the target refs and the rAF write-back.
 */

let mockReducedMotion = true;
vi.mock("../../../utils/reducedMotion", () => ({
	prefersReducedMotion: () => mockReducedMotion,
}));

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
			bounds: { min: 1, max: 7 },
			data: new Float32Array([1, 7, 3]),
		},
	],
	rowCount: 3,
	xAxisColumn: "Time",
	xAxisId: "axis-1",
};

const frames = (ms = 50) =>
	act(() => new Promise<void>((r) => setTimeout(r, ms)));
const range = (kind: "x" | "y") => {
	const s = useGraphStore.getState();
	const a = (kind === "x" ? s.xAxes : s.yAxes)[0];
	return { min: a.min, max: a.max };
};
const yZone = () => screen.getByRole("group", { name: /^Y axis 1/ });
const altKey = (key: "ArrowLeft" | "ArrowRight") =>
	fireEvent.keyDown(window, { key, altKey: true });

async function enterRange(min: string, max: string) {
	fireEvent.keyDown(yZone(), { key: "r" });
	const dialog = await screen.findByRole("dialog", {
		name: "Range of Y axis 1",
	});
	fireEvent.change(screen.getByRole("textbox", { name: "Min" }), {
		target: { value: min },
	});
	fireEvent.change(screen.getByRole("textbox", { name: "Max" }), {
		target: { value: max },
	});
	fireEvent.submit(dialog);
	return dialog;
}

describe("axis range entry and zoom history", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockReducedMotion = true;
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
		useGraphStore.getState().updateYAxis("axis-1", { min: 0, max: 10 });
		useGraphStore.setState({ isLoaded: true });
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("applies a typed range to the store and the target refs", async () => {
		render(<ChartContainer />);
		await frames();
		const dialog = await enterRange("-2", "2e1");
		expect(range("y")).toEqual({ min: -2, max: 20 });
		expect(dialog).not.toBeInTheDocument();
		expect(yZone()).toHaveFocus();

		// The rAF loop does not ease back to the old target...
		await frames(100);
		expect(range("y")).toEqual({ min: -2, max: 20 });
		expect(backend.redraw.mock.lastCall?.[1][0]).toMatchObject({
			min: -2,
			max: 20,
		});
		// ...and the next step starts from the typed range (5% of 22).
		fireEvent.keyDown(yZone(), { key: "ArrowUp" });
		await frames();
		expect(range("y").min).toBeCloseTo(-0.9);
		expect(range("y").max).toBeCloseTo(21.1);
	});

	it("validates inline and keeps the range on Escape", async () => {
		useGraphStore.getState().setAxisScale("y", "axis-1", "log");
		const before = range("y");
		render(<ChartContainer />);
		await frames();
		const dialog = await enterRange("0", "10");
		expect(screen.getByRole("alert")).toHaveTextContent(
			"Min must be greater than 0 on a log axis",
		);
		expect(screen.getByRole("textbox", { name: "Min" })).toHaveAttribute(
			"aria-invalid",
			"true",
		);
		fireEvent.keyDown(screen.getByRole("textbox", { name: "Min" }), {
			key: "Escape",
		});
		expect(dialog).not.toBeInTheDocument();
		expect(range("y")).toEqual(before);
		expect(yZone()).toHaveFocus();
	});

	it("steps back and forward through settled viewports", async () => {
		render(<ChartContainer />);
		await frames();
		const start = { x: range("x"), y: range("y") };

		await enterRange("2", "4");
		await frames(600);
		// A wheel zoom settles once its idle timeout ends the interaction.
		fireEvent.wheel(screen.getByRole("main"), {
			clientX: 400,
			clientY: 300,
			deltaY: 100,
		});
		await frames(400);
		const zoomed = { x: range("x"), y: range("y") };
		expect(zoomed.x).not.toEqual(start.x);

		altKey("ArrowLeft");
		await frames();
		expect(range("x")).toEqual(start.x);
		expect(range("y")).toEqual({ min: 2, max: 4 });

		altKey("ArrowLeft");
		await frames();
		expect(range("y")).toEqual(start.y);

		// Nothing older: the key is still claimed so the browser stays put.
		const e = new KeyboardEvent("keydown", {
			key: "ArrowLeft",
			altKey: true,
			cancelable: true,
		});
		window.dispatchEvent(e);
		expect(e.defaultPrevented).toBe(true);
		await frames();
		expect(range("y")).toEqual(start.y);

		altKey("ArrowRight");
		await frames();
		altKey("ArrowRight");
		await frames();
		expect(range("x")).toEqual(zoomed.x);
		expect(range("y")).toEqual(zoomed.y);

		// Navigating is not itself a step: Back lands where it did before.
		altKey("ArrowLeft");
		await frames();
		expect(range("y")).toEqual({ min: 2, max: 4 });
	});

	it("eases back with full motion and writes only where it lands", async () => {
		mockReducedMotion = false;
		render(<ChartContainer />);
		await frames();
		const start = range("y");
		await enterRange("2", "4");
		await frames(600);

		const writes: unknown[] = [];
		const unsubscribe = useGraphStore.subscribe((s, prev) => {
			if (s.yAxes !== prev.yAxes) writes.push(s.yAxes[0]);
		});
		altKey("ArrowLeft");
		await frames(50);
		// Mid-ease: drawn, not yet written back.
		expect(range("y")).toEqual({ min: 2, max: 4 });
		expect(backend.redraw.mock.lastCall?.[1][0].min).toBeLessThan(2);
		await frames(1000);
		expect(range("y")).toEqual(start);
		expect(writes).toHaveLength(1);
		unsubscribe();
	});

	it("ignores Alt+arrows typed into a text field", async () => {
		render(<ChartContainer />);
		await frames();
		await enterRange("2", "4");
		await frames(600);
		fireEvent.keyDown(yZone(), { key: "r" });
		const min = await screen.findByRole("textbox", { name: "Min" });
		const e = fireEvent.keyDown(min, { key: "ArrowLeft", altKey: true });
		expect(e).toBe(true);
		await frames();
		expect(range("y")).toEqual({ min: 2, max: 4 });
	});
});
