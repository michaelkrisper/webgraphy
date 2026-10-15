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
import { deleteWithUndo, removeSeriesWithUndo } from "../../../store/undoToast";
import { useGraphStore } from "../../../store/useGraphStore";
import { DatasetItem } from "../DatasetItem";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

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
		const setCalculatingDatasetId = vi.fn();
		const setEditingColumn = vi.fn();
		const view = render(
			<DatasetItem
				dataset={datasets[0]}
				setCalculatingDatasetId={setCalculatingDatasetId}
				setEditingColumn={setEditingColumn}
			/>,
		);
		return { ...view, state, setCalculatingDatasetId, setEditingColumn };
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

	it("renames a column on Enter and on blur, and cancels on Escape", () => {
		const { state } = setup([makeDataset("ds1")], []);
		const rename = () =>
			fireEvent.click(screen.getAllByRole("button", { name: "Rename column" })[0]);

		rename();
		let input = screen.getByDisplayValue("temp");
		fireEvent.change(input, { target: { value: "Temperature" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(state.renameColumn).toHaveBeenLastCalledWith(
			"ds1",
			"temp",
			"Temperature",
		);
		expect(screen.queryByDisplayValue("Temperature")).toBeNull();

		rename();
		input = screen.getByDisplayValue("temp");
		fireEvent.change(input, { target: { value: "T2" } });
		fireEvent.blur(input);
		expect(state.renameColumn).toHaveBeenLastCalledWith("ds1", "temp", "T2");

		state.renameColumn.mockClear();
		rename();
		input = screen.getByDisplayValue("temp");
		fireEvent.change(input, { target: { value: "discarded" } });
		fireEvent.keyDown(input, { key: "Escape" });
		expect(screen.queryByDisplayValue("discarded")).toBeNull();
		expect(state.renameColumn).not.toHaveBeenCalled();
		expect(screen.getByRole("button", { name: "temp" })).toBeInTheDocument();
	});

	it("marks calculated columns and offers formula edit and delete", () => {
		const ds = makeDataset("ds1");
		ds.data[2] = { ...ds.data[2], formula: "[temp] * 2" };
		const { state, setEditingColumn } = setup([ds], []);

		const chip = screen.getByRole("button", { name: "ƒ pressure" });
		expect(chip.title).toContain("Formula: [temp] * 2");
		// Only the calculated column gets the formula actions.
		expect(screen.getAllByRole("button", { name: "Edit formula" })).toHaveLength(
			1,
		);

		fireEvent.click(screen.getByRole("button", { name: "Edit formula" }));
		expect(setEditingColumn).toHaveBeenCalledWith({
			datasetId: "ds1",
			name: "pressure",
			formula: "[temp] * 2",
		});

		fireEvent.click(
			screen.getByRole("button", { name: "Delete calculated column" }),
		);
		expect(deleteWithUndo).toHaveBeenCalledWith("pressure", expect.any(Function));
		(deleteWithUndo as Mock).mock.calls[0][1]();
		expect(state.removeCalculatedColumn).toHaveBeenCalledWith("ds1", "pressure");
	});

	it("deletes the dataset through the undo toast", () => {
		const { state } = setup([makeDataset("ds1")], []);
		fireEvent.click(screen.getByRole("button", { name: "Delete Dataset" }));
		expect(deleteWithUndo).toHaveBeenCalledWith(
			"Dataset ds1",
			expect.any(Function),
		);
		(deleteWithUndo as Mock).mock.calls[0][1]();
		expect(state.removeDataset).toHaveBeenCalledWith("ds1");
	});

	it("opens the Calculated Column dialog for this dataset", () => {
		const { setCalculatingDatasetId } = setup([makeDataset("ds1")], []);
		fireEvent.click(
			screen.getByRole("button", { name: "Add Calculated Column" }),
		);
		expect(setCalculatingDatasetId).toHaveBeenCalledWith("ds1");
	});

	it("changes the x column and hides it from the plottable chips", () => {
		const { state } = setup([makeDataset("ds1")], []);
		expect(screen.queryByRole("button", { name: "t" })).toBeNull();
		fireEvent.change(
			screen.getByRole("combobox", { name: "X-axis column for Dataset ds1" }),
			{ target: { value: "temp" } },
		);
		expect(state.updateDataset).toHaveBeenCalledWith("ds1", {
			xAxisColumn: "temp",
		});
	});

	it("uses the point colour for the swatch of a markers-only series", () => {
		setup([makeDataset("ds1")], [{ ...plottedTemp, lineStyle: "none" }]);
		const swatch = screen
			.getByRole("button", { name: "temp" })
			.querySelector(".col-chip-swatch") as HTMLElement;
		expect(swatch.style.backgroundColor).toBe("rgb(18, 52, 86)");
	});

	it("plots a categorical column as a categorical series", () => {
		const ds = makeDataset("ds1");
		ds.data[1] = { ...ds.data[1], categoryLabels: ["low", "high"] };
		setup([ds], []);
		fireEvent.click(screen.getByRole("button", { name: "temp" }));
		expect(addSeries).toHaveBeenCalledTimes(1);
		const added = addSeries.mock.calls[0][0] as SeriesConfig;
		// Categories are discrete: markers only, never a connecting line.
		expect(added).toMatchObject({
			sourceId: "ds1",
			yColumn: "temp",
			lineStyle: "none",
		});
		expect(added.pointStyle).not.toBe("none");
	});

	it("disables log scale when the x axis slot is missing", () => {
		const { state } = setup([makeDataset("ds1", "axis-7")], []);
		const btn = screen.getByRole("button", { name: "Logarithmic X Scale" });
		expect(btn).toBeDisabled();
		fireEvent.click(btn);
		expect(state.setAxisScale).not.toHaveBeenCalled();
	});

	it(
		"has no axe violations with plotted and unplotted chips",
		async () => {
			const { container } = setup(
				[makeDataset("ds1"), makeDataset("ds2")],
				[plottedTemp],
			);
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});
