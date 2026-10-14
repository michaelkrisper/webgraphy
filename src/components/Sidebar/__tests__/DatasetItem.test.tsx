import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import "@testing-library/jest-dom";
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import { exportDatasetCsv } from "../../../services/csvExport";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import { removeSeriesWithUndo } from "../../../store/undoToast";
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

vi.mock("../../../store/undoToast", () => ({
	deleteWithUndo: vi.fn(),
	removeSeriesWithUndo: vi.fn(),
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

	const setAxisScale = vi.fn();

	const setup = (
		datasets: Dataset[],
		series: SeriesConfig[],
		xAxis: Partial<XAxisConfig> = {},
	) => {
		const state = {
			datasets,
			series,
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			addSeries,
			removeCalculatedColumn: vi.fn(),
			renameColumn: vi.fn(),
			yAxes: [],
			xAxes: [
				{
					id: "axis-1",
					name: "",
					min: 0,
					max: 1,
					showGrid: true,
					xMode: "numeric",
					...xAxis,
				},
			],
			setAxisScale,
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
	it("toggles the dataset's x axis between linear and log", () => {
		setup([makeDataset("ds1")], []);
		const btn = screen.getByRole("button", { name: "Logarithmic X Scale" });
		expect(btn).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(btn);
		expect(setAxisScale).toHaveBeenCalledWith("x", "axis-1", "log");
	});

	it("shows a log x axis as pressed and switches it back to linear", () => {
		setup([makeDataset("ds1")], [], { scale: "log", min: 1 });
		const btn = screen.getByRole("button", { name: "Logarithmic X Scale" });
		expect(btn).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(btn);
		expect(setAxisScale).toHaveBeenCalledWith("x", "axis-1", "linear");
	});

	it("disables log scale for date x axes", () => {
		setup([makeDataset("ds1")], [], { xMode: "date" });
		expect(
			screen.getByRole("button", { name: "Logarithmic X Scale" }),
		).toBeDisabled();
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

	it("toggles a plotted column off, removing its series with undo", () => {
		setup([makeDataset("ds1")], [plottedTemp]);
		fireEvent.click(screen.getByRole("button", { name: "temp" }));

		expect(addSeries).not.toHaveBeenCalled();
		expect(removeSeriesWithUndo).toHaveBeenCalledWith("temp", [plottedTemp.id]);
	});

	it("removes every series of a column plotted more than once in one call", () => {
		const second = { ...plottedTemp, id: "s-temp-2" };
		const otherDataset = { ...plottedTemp, id: "s-other", sourceId: "ds2" };
		setup([makeDataset("ds1")], [plottedTemp, otherDataset, second]);
		fireEvent.click(screen.getByRole("button", { name: "temp" }));

		expect(removeSeriesWithUndo).toHaveBeenCalledTimes(1);
		expect(removeSeriesWithUndo).toHaveBeenCalledWith("temp", [
			plottedTemp.id,
			second.id,
		]);
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
