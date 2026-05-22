import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { CalculatedColumnModal } from "../CalculatedColumnModal";
import { useGraphStore } from "../../../store/useGraphStore";
import type { Dataset } from "../../../services/persistence";

// Mock the graph store
vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

// Mock the formula utils (to simplify live validation)
vi.mock("../../../utils/formula", () => ({
	compileFormula: vi.fn().mockReturnValue({ error: null }),
}));

describe("CalculatedColumnModal", () => {
	const mockDataset = {
		id: "dataset-1",
		name: "Test Dataset",
		columns: ["A", "B"],
		data: [[1, 2]],
	} as unknown as Dataset;

	const mockOnClose = vi.fn();
	const mockAddCalculatedColumn = vi.fn();
	const mockRemoveCalculatedColumn = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup useGraphStore mock implementation
		type StoreState = {
			addCalculatedColumn: typeof mockAddCalculatedColumn;
			removeCalculatedColumn: typeof mockRemoveCalculatedColumn;
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(selector: (state: StoreState) => unknown) => {
				const state: StoreState = {
					addCalculatedColumn: mockAddCalculatedColumn,
					removeCalculatedColumn: mockRemoveCalculatedColumn,
				};
				return selector(state);
			},
		);
	});

	it("renders correctly for adding a new column", () => {
		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		expect(screen.getByText("Add Calculated Series")).toBeDefined();
		expect(screen.getByLabelText("Column Name")).toBeDefined();
		expect(screen.getByLabelText("Formula")).toBeDefined();
	});

	it("renders correctly for editing an existing column", () => {
		render(
			<CalculatedColumnModal
				dataset={mockDataset}
				onClose={mockOnClose}
				initialName="Calc A"
				initialFormula="[A] * 2"
			/>
		);

		expect(screen.getByText("Edit Calculated Series")).toBeDefined();
		expect(screen.getByDisplayValue("Calc A")).toBeDefined();
		expect(screen.getByDisplayValue("[A] * 2")).toBeDefined();
	});

	it("shows error if calculation fails during submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({
			success: false,
			error: "Formula compilation error",
		});

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Series"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("Formula compilation error")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]"
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

    it("shows generic error if addCalculatedColumn throws", async () => {
		mockAddCalculatedColumn.mockRejectedValueOnce(new Error("Network Error"));

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Series"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("Network Error")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]"
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

    it("handles unexpected non-Error throws", async () => {
        mockAddCalculatedColumn.mockRejectedValueOnce("String error throw");

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Series"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("An unexpected error occurred")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]"
		);
		expect(mockOnClose).not.toHaveBeenCalled();
    });

	it("calls onClose on successful calculation", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Series"));

		// Wait for close to be called
		await waitFor(() => {
			expect(mockOnClose).toHaveBeenCalled();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]"
		);
	});

	it("shows validation error for empty name", () => {
		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		fireEvent.click(screen.getByText("Create Series"));

		expect(screen.getByText("Please enter a column name.")).toBeDefined();
		expect(mockAddCalculatedColumn).not.toHaveBeenCalled();
	});

	it("shows validation error for empty formula", () => {
		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "New Calc" },
		});

		fireEvent.click(screen.getByText("Create Series"));

		expect(screen.getByText("Please enter a formula.")).toBeDefined();
		expect(mockAddCalculatedColumn).not.toHaveBeenCalled();
	});

	it("calls removeCalculatedColumn before addCalculatedColumn in edit mode", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(
			<CalculatedColumnModal
				dataset={mockDataset}
				onClose={mockOnClose}
				initialName="Original Name"
				initialFormula="[A] * 2"
			/>
		);

		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "Updated Name" },
		});

		fireEvent.click(screen.getByText("Create Series"));

		await waitFor(() => {
			expect(mockRemoveCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Original Name"
			);
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Updated Name",
				"[A] * 2"
			);
			expect(mockOnClose).toHaveBeenCalled();
		});
	});

	it("auto-closes unbalanced brackets on submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "Auto Close" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "([A] * 2" },
		});

		fireEvent.click(screen.getByText("Create Series"));

		await waitFor(() => {
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Auto Close",
				"([A] * 2)"
			);
		});
	});

	it("auto-closes multiple nested unbalanced brackets on submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(
			<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />
		);

		fireEvent.change(screen.getByLabelText("Column Name"), {
			target: { value: "Nested Auto Close" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "((([A" },
		});

		fireEvent.click(screen.getByText("Create Series"));

		await waitFor(() => {
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Nested Auto Close",
				"((([A])))"
			);
		});
	});
});
