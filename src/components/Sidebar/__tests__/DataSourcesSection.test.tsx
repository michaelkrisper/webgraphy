import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { Mock } from "vitest";
import { DataSourcesSection } from "../DataSourcesSection";
import { useGraphStore } from "../../../store/useGraphStore";

// Mock calculated column modal to simplify testing
vi.mock("../../Layout/CalculatedColumnModal", () => ({
	CalculatedColumnModal: ({ onClose }: { onClose: () => void }) => (
		<div data-testid="calc-modal">
			Calc Modal <button onClick={onClose} data-testid="close-calc-modal">Close</button>
		</div>
	),
}));

// Mock ErrorBoundary
vi.mock("../../ErrorBoundary", () => ({
	default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>
}));

// Mock PopupPicker
vi.mock("../PopupPicker", () => ({
	PopupPicker: ({ renderTrigger }: any) => renderTrigger({ onClick: vi.fn(), ref: null })
}));

// Mock hooks
vi.mock("../../../store/useGraphStore", () => {
	const store = vi.fn() as ReturnType<typeof vi.fn> & {
		getState: ReturnType<typeof vi.fn>;
		setState: ReturnType<typeof vi.fn>;
	};
	store.getState = vi.fn();
	store.setState = vi.fn();
	return { useGraphStore: store };
});

describe("DataSourcesSection", () => {
	const mockOnToggle = vi.fn();
	const mockImportFile = vi.fn();
	const mockFileInputRef = { current: null };

	const mockRemoveDataset = vi.fn();
	const mockUpdateDataset = vi.fn();
	const mockAddSeries = vi.fn();
	const mockRemoveCalculatedColumn = vi.fn();
	const mockRenameColumn = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		const defaultState = {
			datasets: [],
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof defaultState) => unknown) =>
				sel ? sel(defaultState) : defaultState,
		);
	});

	const renderComponent = (open = true) => {
		return render(
			<DataSourcesSection
				open={open}
				onToggle={mockOnToggle}
				fileInputRef={mockFileInputRef}
				importFile={mockImportFile}
			/>
		);
	};

	it("renders correctly with no datasets", () => {
		renderComponent();
		expect(screen.getByText("Data Sources")).toBeInTheDocument();
		expect(screen.getByText(/Add datasources by importing or drag and drop on the graph surface/)).toBeInTheDocument();
	});

	it("toggles section when header is clicked", () => {
		renderComponent();
		const header = screen.getByText("Data Sources").closest("button");
		fireEvent.click(header!);
		expect(mockOnToggle).toHaveBeenCalled();
	});

	it("renders datasets and handles dataset deletion", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent();

		expect(screen.getByText("Dataset 1")).toBeInTheDocument();
		expect(screen.getByText("100 lines")).toBeInTheDocument();

		const deleteBtn = screen.getByTitle("Delete Dataset");
		fireEvent.click(deleteBtn);
		expect(mockRemoveDataset).toHaveBeenCalledWith("ds1");
	});

	it("allows changing X-axis column", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y", "z"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent();

		const select = screen.getByTitle("X-Axis");
		fireEvent.change(select, { target: { value: "y" } });
		expect(mockUpdateDataset).toHaveBeenCalledWith("ds1", { xAxisColumn: "y" });
	});

	it("shows Add Calculated Column modal when button is clicked", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent();

		const calcBtn = screen.getByTitle("Add Calculated Column");
		fireEvent.click(calcBtn);

		expect(screen.getByTestId("calc-modal")).toBeInTheDocument();

		// Close the modal
		fireEvent.click(screen.getByTestId("close-calc-modal"));
		expect(screen.queryByTestId("calc-modal")).not.toBeInTheDocument();
	});

	it("does not render dataset details if section is not open", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent(false);

		expect(screen.getByText("Data Sources")).toBeInTheDocument();
		expect(screen.queryByText("Dataset 1")).not.toBeInTheDocument();
	});

	it("allows renaming a column", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent();

		const renameBtn = screen.getByTitle("Rename column");
		fireEvent.click(renameBtn);

		const input = screen.getByDisplayValue("y");
		fireEvent.change(input, { target: { value: "y_new" } });
		fireEvent.keyDown(input, { key: "Enter" });

		expect(mockRenameColumn).toHaveBeenCalledWith("ds1", "y", "y_new");
	});

	it("handles creating a series from a column", () => {
		const datasets = [
			{ id: "ds1", name: "Dataset 1", rowCount: 100, columns: ["x", "y"], xAxisColumn: "x", xAxisId: "axis-1", data: [{}, {}] }
		];
		(useGraphStore as unknown as Mock).mockImplementation((sel) => sel({
			datasets,
			series: [],
			removeDataset: mockRemoveDataset,
			updateDataset: mockUpdateDataset,
			addSeries: mockAddSeries,
			removeCalculatedColumn: mockRemoveCalculatedColumn,
			renameColumn: mockRenameColumn,
		}));

		renderComponent();

		const createSeriesBtn = screen.getByRole("button", { name: "y" });
		fireEvent.click(createSeriesBtn);

		expect(mockAddSeries).toHaveBeenCalled();
	});

});
