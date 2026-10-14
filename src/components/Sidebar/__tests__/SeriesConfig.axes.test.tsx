import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
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

const mk = (
	id: string,
	yAxisId: string,
	name: string,
	lineColor: string,
): SeriesConfig => ({
	id,
	sourceId: "ds1",
	name,
	yColumn: name,
	yAxisId,
	lineStyle: "solid",
	pointStyle: "circle",
	lineColor,
	pointColor: lineColor,
	hidden: false,
});

const datasets = [
	{ id: "ds1", columns: ["t", "Temp", "Dew", "Wind"], data: [] },
] as unknown as Dataset[];

const updateSeries = vi.fn();
const updateYAxis = vi.fn();

function setStore(series: SeriesConfig[]) {
	const state = {
		updateSeries,
		removeSeries: vi.fn(),
		yAxes: Array.from({ length: 9 }, (_, i) => ({
			id: `axis-${i + 1}`,
			position: "left",
			showGrid: true,
		})),
		updateYAxis,
		updateSeriesVisibility: vi.fn(),
		series,
		setPreviewColor: vi.fn(),
		setPreviewStyle: vi.fn(),
	};
	vi
		.mocked(useGraphStore)
		.mockImplementation(((selector: (s: typeof state) => unknown) =>
			selector(state)) as unknown as typeof useGraphStore);
}

const temp = mk("s1", "axis-1", "Temp", "#ff0000");
const dew = mk("s2", "axis-1", "Dew", "#0000ff");
const wind = mk("s3", "axis-3", "Wind", "#00ff00");

describe("SeriesConfigUI axis controls", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setStore([temp, dew, wind]);
	});

	it("shows side and grid only on the first row of each axis", () => {
		const { unmount } = render(
			<SeriesConfigUI series={temp} datasets={datasets} />,
		);
		expect(
			screen.getByRole("button", { name: "Toggle Left/Right Axis" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Toggle Grid" }),
		).toBeInTheDocument();
		unmount();

		const { container } = render(
			<SeriesConfigUI series={dew} datasets={datasets} />,
		);
		expect(
			screen.queryByRole("button", { name: "Toggle Left/Right Axis" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Toggle Grid" })).toBeNull();
		// Blank cells keep the columns aligned with the rows above.
		expect(container.querySelectorAll(".sc-cell-placeholder")).toHaveLength(2);
	});

	it("lists used axes with their title and swatches, plus New axis", () => {
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));

		const popover = document.getElementById("y-axis-popover-s2");
		if (!popover) throw new Error("popover not open");
		const items = within(popover).getAllByRole("button");
		expect(items.map((b) => b.textContent)).toEqual([
			"1Temp / Dew",
			"3Wind",
			"New axis",
		]);
		expect(items[0].querySelectorAll(".sc-axis-swatch")).toHaveLength(2);
		expect(items[0]).toHaveAttribute("title", "Y-Axis 1: Temp / Dew");
		// Keyboard users land on the first option.
		expect(items[0]).toHaveFocus();
	});

	it("moves the series to the first free slot via New axis", () => {
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));
		const newAxis = screen.getByRole("button", { name: "New axis" });
		expect(newAxis).toHaveAttribute("title", "Move to Y-Axis 2");
		fireEvent.click(newAxis);
		expect(updateYAxis).toHaveBeenCalledWith("axis-2", { position: "left" });
		expect(updateSeries).toHaveBeenCalledWith("s2", { yAxisId: "axis-2" });
	});

	it("disables New axis with a reason when all nine are in use", () => {
		const all = Array.from({ length: 9 }, (_, i) =>
			mk(`s${i + 1}`, `axis-${i + 1}`, `C${i + 1}`, "#123456"),
		);
		setStore(all);
		render(<SeriesConfigUI series={all[0]} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));
		const newAxis = screen.getByRole("button", { name: "New axis" });
		expect(newAxis).toBeDisabled();
		expect(newAxis).toHaveAttribute("title", "All 9 Y-axes are in use");
	});

	it("has no axe violations with the picker open", async () => {
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));
		// The popover is portalled to <body>; landmarks are the app shell's job.
		expect(
			await axe(document.body, { rules: { region: { enabled: false } } }),
		).toHaveNoViolations();
	});
});
