import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import { exportDatasetCsv } from "../../../services/csvExport";
import type { Dataset, SeriesConfig } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import { DatasetItem } from "../DatasetItem";

vi.mock("../../../services/csvExport", () => ({
	exportDatasetCsv: vi.fn(() => Promise.resolve()),
}));

vi.mock("../PopupPicker", () => ({
	PopupPicker: ({
		renderTrigger,
	}: {
		renderTrigger: (args: {
			onClick: () => void;
			ref: null;
			isOpen: boolean;
		}) => ReactNode;
	}) => renderTrigger({ onClick: vi.fn(), ref: null, isOpen: false }),
}));

vi.mock("../../../store/useGraphStore", () => {
	const store = vi.fn() as ReturnType<typeof vi.fn> & {
		getState: ReturnType<typeof vi.fn>;
	};
	store.getState = vi.fn();
	return { useGraphStore: store };
});

const column = (min: number, max: number) => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min, max },
	data: new Float32Array(0),
});

const makeDataset = (id: string, xAxisId = "axis-1"): Dataset => ({
	id,
	name: `Dataset ${id}`,
	rowCount: 5000,
	columns: ["t", "temp", "pressure"],
	data: [column(0, 1), column(10, 30), column(990, 1030)],
	xAxisColumn: "t",
	xAxisId,
});

const plottedTemp: SeriesConfig = {
	id: "s-temp",
	sourceId: "ds1",
	name: "temp",
	yColumn: "temp",
	yAxisId: "axis-1",
	pointStyle: "none",
	pointColor: "#123456",
	lineStyle: "solid",
	lineColor: "#abcdef",
};

describe("DatasetItem", () => {
	const addSeries = vi.fn();
	const setHighlightedSeries = vi.fn();

	const setup = (datasets: Dataset[], series: SeriesConfig[]) => {
		const state = {
			datasets,
			series,
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			addSeries,
			removeCalculatedColumn: vi.fn(),
			renameColumn: vi.fn(),
			setHighlightedSeries,
			highlightedSeriesId: null,
			yAxes: [],
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel: (s: typeof state) => unknown) => sel(state),
		);
		(useGraphStore.getState as Mock).mockReturnValue(state);
		return render(
			<DatasetItem
				dataset={datasets[0]}
				setCalculatingDatasetId={vi.fn()}
				setEditingColumn={vi.fn()}
			/>,
		);
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("hides the X-axis slot button while there is a single dataset", () => {
		setup([makeDataset("ds1")], []);
		expect(screen.queryByRole("button", { name: "Select X-Axis" })).toBeNull();
	});

	it("shows the X-axis slot button once there are two datasets", () => {
		setup([makeDataset("ds1", "axis-2"), makeDataset("ds2")], []);
		expect(
			screen.getByRole("button", { name: "Select X-Axis" }),
		).toHaveTextContent("2");
	});

	it("adds an unplotted column on the first free axis without markers when dense", () => {
		setup(
			[makeDataset("ds1"), makeDataset("ds0")],
			[{ ...plottedTemp, sourceId: "ds0" }],
		);
		const chip = screen.getByRole("button", { name: "pressure" });
		expect(chip).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(chip);
		expect(addSeries).toHaveBeenCalledTimes(1);
		expect(addSeries.mock.calls[0][0]).toMatchObject({
			sourceId: "ds1",
			yColumn: "pressure",
			yAxisId: "axis-2",
			pointStyle: "none",
		});
	});

	it("marks a plotted column as pressed with a swatch in its series colour", () => {
		setup([makeDataset("ds1")], [plottedTemp]);
		const chip = screen.getByRole("button", { name: "temp" });
		expect(chip).toHaveAttribute("aria-pressed", "true");
		const swatch = chip.querySelector(".col-chip-swatch") as HTMLElement;
		expect(swatch).not.toBeNull();
		expect(swatch.style.backgroundColor).toBe("rgb(171, 205, 239)");
		expect(screen.getByRole("button", { name: "pressure" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});

	it("points at the existing series instead of adding a duplicate", () => {
		vi.useFakeTimers();
		const row = document.createElement("li");
		row.dataset.seriesId = plottedTemp.id;
		row.scrollIntoView = vi.fn();
		document.body.appendChild(row);

		setup([makeDataset("ds1")], [plottedTemp]);
		fireEvent.click(screen.getByRole("button", { name: "temp" }));

		expect(addSeries).not.toHaveBeenCalled();
		expect(setHighlightedSeries).toHaveBeenCalledWith(plottedTemp.id);
		expect(row.scrollIntoView).toHaveBeenCalled();
		expect(row).toHaveClass("sb-series-row--flash");

		vi.runAllTimers();
		expect(row).not.toHaveClass("sb-series-row--flash");
		row.remove();
	});

	it("exports the whole dataset, calculated columns included, as CSV", async () => {
		const ds = makeDataset("ds1");
		setup([ds], []);
		fireEvent.click(
			screen.getByRole("button", { name: "Export Dataset ds1 as CSV" }),
		);
		await waitFor(() =>
			expect(exportDatasetCsv).toHaveBeenCalledWith(
				ds,
				expect.objectContaining({ notify: expect.any(Function) }),
			),
		);
	});

	it("has no axe violations with plotted and unplotted chips", async () => {
		const { container } = setup(
			[makeDataset("ds1"), makeDataset("ds2")],
			[plottedTemp],
		);
		expect(await axe(container)).toHaveNoViolations();
	});
});
