import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, SeriesConfig } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import { SeriesConfigUI } from "../SeriesConfig";

vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
	withHistory: (_label: string, fn: () => unknown) => fn(),
	latestHistoryId: vi.fn(),
	undoIfLatest: vi.fn(),
}));

const temp: SeriesConfig = {
	id: "s1",
	sourceId: "ds1",
	name: "Temp",
	yColumn: "Temp",
	yAxisId: "axis-1",
	lineStyle: "dashed",
	pointStyle: "none",
	lineColor: "#ff0000",
	pointColor: "#ff0000",
};

const datasets = [
	{ id: "ds1", columns: ["t", "Temp"], data: [] },
] as unknown as Dataset[];

const updateSeries = vi.fn();
const setPreviewStyle = vi.fn();

beforeEach(() => {
	vi.clearAllMocks();
	const state = {
		updateSeries,
		removeSeries: vi.fn(),
		yAxes: [{ id: "axis-1", position: "left", showGrid: true }],
		updateYAxis: vi.fn(),
		setAxisScale: vi.fn(),
		updateSeriesVisibility: vi.fn(),
		series: [temp],
		setPreviewColor: vi.fn(),
		setPreviewStyle,
	};
	vi
		.mocked(useGraphStore)
		.mockImplementation(((selector: (s: typeof state) => unknown) =>
			selector(state)) as unknown as typeof useGraphStore);
});

const openPicker = () => {
	fireEvent.click(screen.getByRole("button", { name: "Series Style" }));
	return screen.getByRole("dialog", { name: "Series style" });
};
const widthsOf = (popover: HTMLElement) =>
	within(popover).getByRole("group", { name: "Line width" });
const gridOf = (popover: HTMLElement) =>
	within(popover).getByRole("group", { name: "Line and point style" });

describe("SeriesConfigUI style picker", () => {
	it("is one trigger naming line, points and a custom width", () => {
		render(
			<SeriesConfigUI series={{ ...temp, lineWidth: 2 }} datasets={datasets} />,
		);
		expect(
			screen.queryByRole("group", { name: "Line width" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Series Style" })).toHaveAttribute(
			"title",
			"Style: Dashed line, no points, 2 px",
		);
	});

	it("offers every line x point combination, the current one pressed", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		const cells = within(gridOf(openPicker())).getAllByRole("button");
		expect(cells).toHaveLength(16);
		expect(cells[0]).toHaveAccessibleName("Solid line, circles");
		expect(cells[15]).toHaveAccessibleName("No line, no points");
		expect(
			within(gridOf(screen.getByRole("dialog"))).getAllByRole("button", {
				pressed: true,
			}),
		).toEqual([screen.getByRole("button", { name: "Dashed line, no points" })]);
	});

	it("previews a combination on hover and applies both in one update", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		const cell = within(gridOf(openPicker())).getByRole("button", {
			name: "Dotted line, squares",
		});
		fireEvent.mouseEnter(cell);
		expect(setPreviewStyle).toHaveBeenLastCalledWith({
			seriesId: "s1",
			lineStyle: "dotted",
			pointStyle: "square",
		});
		fireEvent.click(cell);
		expect(updateSeries).toHaveBeenCalledTimes(1);
		expect(updateSeries).toHaveBeenCalledWith("s1", {
			lineStyle: "dotted",
			pointStyle: "square",
		});
		// Stays open so the width can follow.
		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(setPreviewStyle).toHaveBeenLastCalledWith(null);
	});

	it("offers the widths beside the grid, the current one pressed", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		const widths = widthsOf(openPicker());
		expect(
			within(widths)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label")),
		).toEqual(["1 px", "1.5 px", "2 px", "3 px", "4 px"]);
		expect(
			within(widths).getByRole("button", { name: "1 px", pressed: true }),
		).toBeInTheDocument();
	});

	it("previews a width on hover and applies it", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		const three = within(widthsOf(openPicker())).getByRole("button", {
			name: "3 px",
		});
		fireEvent.mouseEnter(three);
		expect(setPreviewStyle).toHaveBeenLastCalledWith({
			seriesId: "s1",
			lineWidth: 3,
		});
		fireEvent.click(three);
		expect(updateSeries).toHaveBeenCalledWith("s1", { lineWidth: 3 });
	});

	it("stores the default width as absent", () => {
		render(
			<SeriesConfigUI series={{ ...temp, lineWidth: 2 }} datasets={datasets} />,
		);
		fireEvent.click(
			within(widthsOf(openPicker())).getByRole("button", {
				name: "1 px",
				pressed: false,
			}),
		);
		expect(updateSeries).toHaveBeenCalledWith("s1", { lineWidth: undefined });
	});

	it("disables the widths without a line", () => {
		render(
			<SeriesConfigUI
				series={{ ...temp, lineStyle: "none", pointStyle: "circle" }}
				datasets={datasets}
			/>,
		);
		for (const b of within(widthsOf(openPicker())).getAllByRole("button")) {
			expect(b).toBeDisabled();
		}
	});

	it("clears the preview when it closes", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		openPicker();
		setPreviewStyle.mockClear();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(setPreviewStyle).toHaveBeenCalledWith(null);
	});
});
