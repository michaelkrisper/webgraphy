import "@testing-library/jest-dom";
import { act, fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../../services/persistence";
import { MeasureReadout, StatsPanel } from "../MeasurePanels";
import { MeasureTools, type MeasureToolsHandle } from "../MeasureTools";

const PADDING = { top: 10, right: 10, bottom: 10, left: 10 };
const WIDTH = 210;
const HEIGHT = 110;
/** Screen x of world x on the 0..10 fixture axis. */
const sx = (x: number) => PADDING.left + (x / 10) * (WIDTH - 20);

const dataset = {
	id: "ds-1",
	name: "d",
	xAxisId: "axis-1",
	xAxisColumn: "t",
	columns: ["t", "v"],
	rowCount: 6,
	data: [
		{ data: Float32Array.from([0, 2, 4, 6, 8, 10]), refPoint: 0 },
		{ data: Float32Array.from([0, 20, 40, 60, 80, 100]), refPoint: 0 },
	],
} as unknown as Dataset;
const series = [
	{
		id: "s1",
		sourceId: "ds-1",
		name: "Temp",
		yColumn: "v",
		yAxisId: "axis-1",
		lineColor: "#e11d48",
		lineStyle: "solid",
		pointStyle: "circle",
	} as SeriesConfig,
];
const xAxes = [
	{ id: "axis-1", name: "", min: 0, max: 10, xMode: "numeric" } as XAxisConfig,
];
const yAxes = [{ id: "axis-1", name: "", min: 0, max: 100 } as YAxisConfig];

const ctx = {
	clearRect: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	scale: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	stroke: vi.fn(),
	setLineDash: vi.fn(),
	arc: vi.fn(),
	fill: vi.fn(),
};

beforeEach(() => {
	vi
		.spyOn(HTMLCanvasElement.prototype, "getContext")
		.mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
});
afterEach(() => {
	vi.restoreAllMocks();
});

function setup() {
	const containerRef = React.createRef<HTMLDivElement>();
	const handle = React.createRef<MeasureToolsHandle>();
	const utils = render(
		<div ref={containerRef}>
			<div className="chart-webgl-layer">
				<canvas data-testid="plot" />
			</div>
			<MeasureTools
				ref={handle}
				containerRef={containerRef}
				width={WIDTH}
				height={HEIGHT}
				padding={PADDING}
				series={series}
				datasets={[dataset]}
				xAxes={xAxes}
				yAxes={yAxes}
				lineColor="#888"
				plotBg="#fff"
			/>
		</div>,
	);
	const plot = screen.getByTestId("plot");
	const click = (x: number, opts: { detail?: number; dragTo?: number } = {}) =>
		act(() => {
			fireEvent.mouseDown(plot, { clientX: x, clientY: 50, button: 0 });
			fireEvent.click(plot, {
				clientX: opts.dragTo ?? x,
				clientY: 50,
				detail: opts.detail ?? 1,
			});
		});
	return { ...utils, plot, click, handle };
}

const readout = () =>
	screen.findByRole("region", { name: "Cursor measurement" });

describe("MeasureTools", () => {
	it("pins A on a click, then B, and shows the deltas", async () => {
		const { click } = setup();
		click(sx(3.4));
		expect(await readout()).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Remove cursor A" })).toBeVisible();

		click(sx(8.2));
		const table = await readout();
		expect(table).toHaveTextContent("Δ/Δx");
		// A at x = 4 (y = 40), B at x = 8 (y = 80): Δx +4, Δy +40, slope +10.
		const row = screen.getByRole("row", { name: /Temp/ });
		expect(row).toHaveTextContent("40");
		expect(row).toHaveTextContent("80");
		expect(row).toHaveTextContent("+40");
		expect(row).toHaveTextContent("+10");
	});

	it("does not pin after a drag (pan)", () => {
		const { click } = setup();
		click(sx(3), { dragTo: sx(3) + 20 });
		expect(screen.queryByRole("button", { name: /Remove cursor/ })).toBeNull();
	});

	it("does not pin from the clicks of a double-click", () => {
		const { click } = setup();
		click(sx(3));
		click(sx(3), { detail: 2 });
		expect(screen.queryByRole("button", { name: /Remove cursor/ })).toBeNull();
	});

	it("ignores modifier clicks (Ctrl = zoom box) and clicks off the plot", () => {
		const { plot } = setup();
		act(() => {
			fireEvent.mouseDown(plot, { clientX: sx(3), clientY: 50, ctrlKey: true });
			fireEvent.click(plot, { clientX: sx(3), clientY: 50, detail: 1 });
		});
		act(() => {
			fireEvent.mouseDown(plot, { clientX: 2, clientY: 50 });
			fireEvent.click(plot, { clientX: 2, clientY: 50, detail: 1 });
		});
		expect(screen.queryByRole("button", { name: /Remove cursor/ })).toBeNull();
	});

	it("clears the pins on Escape and removes one via its ×", async () => {
		const { click } = setup();
		click(sx(2));
		click(sx(6));
		await readout();
		fireEvent.click(screen.getByRole("button", { name: "Remove cursor A" }));
		// B is promoted to A.
		expect(screen.getAllByRole("button", { name: /Remove cursor/ })).toHaveLength(
			1,
		);
		fireEvent.keyDown(window, { key: "Escape" });
		expect(screen.queryByRole("button", { name: /Remove cursor/ })).toBeNull();
	});

	it("moves the pin tag with the live axes, without a render", () => {
		const { click, handle } = setup();
		click(sx(4));
		const tag = screen
			.getByRole("button", { name: "Remove cursor A" })
			.closest(".pin-tag") as HTMLElement;
		expect(parseFloat(tag.style.left)).toBeCloseTo(sx(4));
		act(() => {
			handle.current?.redraw([{ ...xAxes[0], min: 2, max: 12 }], yAxes);
		});
		expect(parseFloat(tag.style.left)).toBeCloseTo(sx(2));
		act(() => {
			handle.current?.redraw([{ ...xAxes[0], min: 5, max: 15 }], yAxes);
		});
		expect(tag.style.display).toBe("none");
	});

	it("toggles the visible-range statistics with S", async () => {
		setup();
		fireEvent.keyDown(window, { key: "s" });
		const panel = await screen.findByRole("region", {
			name: "Visible range statistics",
		});
		expect(screen.getByRole("row", { name: /Temp/ })).toHaveTextContent("6");
		expect(panel).toBeInTheDocument();
		fireEvent.keyDown(window, { key: "s" });
		expect(
			screen.queryByRole("region", { name: "Visible range statistics" }),
		).toBeNull();
	});
});

describe("measurement panels a11y", () => {
	const point = (x: number, y: number) => ({
		seriesId: "s1",
		label: "Temp",
		color: "#e11d48",
		lineStyle: "dashed",
		pointStyle: "circle",
		xAxisId: "axis-1",
		yAxisId: "axis-1",
		x,
		y,
		xLabel: String(x),
	});

	it("readout has no axe violations", async () => {
		const { container } = render(
			<MeasureReadout
				a={{ xAxisId: "axis-1", x: 1, points: [point(1, 2)] }}
				b={{ xAxisId: "axis-1", x: 3, points: [point(3, 8)] }}
				xAxes={xAxes}
				yAxes={yAxes}
				xAxisNames={{ "axis-1": "Time" }}
				onClose={() => {}}
			/>,
		);
		expect(await axe(container)).toHaveNoViolations();
	});

	it("stats panel has no axe violations", async () => {
		const { container } = render(
			<StatsPanel
				series={series}
				datasets={[dataset]}
				xAxes={xAxes}
				yAxes={yAxes}
				onClose={() => {}}
			/>,
		);
		expect(await axe(container)).toHaveNoViolations();
	});
});
