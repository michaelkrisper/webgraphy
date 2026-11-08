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
	fireEvent.click(screen.getByRole("button", { name: "Select Line Style" }));
	const popover = screen.getByRole("dialog", { name: "Line style" });
	return within(popover).getByRole("group", { name: "Line width" });
};

describe("SeriesConfigUI line width", () => {
	it("offers the widths inside the line style popup, the current one pressed", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		expect(
			screen.queryByRole("group", { name: "Line width" }),
		).not.toBeInTheDocument();

		const widths = openPicker();
		expect(
			within(widths)
				.getAllByRole("button")
				.map((b) => b.getAttribute("aria-label")),
		).toEqual(["1 px", "1.5 px", "2 px", "3 px", "4 px"]);
		expect(
			within(widths).getByRole("button", { name: "1 px", pressed: true }),
		).toBeInTheDocument();
		// The line style options keep their own pressed state.
		expect(
			screen.getByRole("button", { name: /Dashed/, pressed: true }),
		).toBeInTheDocument();
	});

	it("previews on hover, applies on click and closes", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		const three = within(openPicker()).getByRole("button", { name: "3 px" });

		fireEvent.mouseEnter(three);
		expect(setPreviewStyle).toHaveBeenLastCalledWith({
			seriesId: "s1",
			lineWidth: 3,
		});
		fireEvent.click(three);
		expect(updateSeries).toHaveBeenCalledWith("s1", { lineWidth: 3 });
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		expect(setPreviewStyle).toHaveBeenLastCalledWith(null);
	});

	it("stores the default width as absent and names a custom one on the trigger", () => {
		render(
			<SeriesConfigUI series={{ ...temp, lineWidth: 2 }} datasets={datasets} />,
		);
		const trigger = screen.getByRole("button", { name: "Select Line Style" });
		expect(trigger).toHaveAttribute("title", "Line Style: Dashed, 2 px");

		fireEvent.click(
			within(openPicker()).getByRole("button", { name: "1 px", pressed: false }),
		);
		expect(updateSeries).toHaveBeenCalledWith("s1", { lineWidth: undefined });
	});
});
