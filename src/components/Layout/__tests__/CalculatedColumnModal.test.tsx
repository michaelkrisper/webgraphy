import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { CalculatedColumnModal } from "../CalculatedColumnModal";
import { useGraphStore } from "../../../store/useGraphStore";

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
	};

	const mockOnClose = vi.fn();
	const mockAddCalculatedColumn = vi.fn();
	const mockRemoveCalculatedColumn = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Setup useGraphStore mock implementation
		(useGraphStore as any).mockImplementation((selector: any) => {
			const state = {
				addCalculatedColumn: mockAddCalculatedColumn,
				removeCalculatedColumn: mockRemoveCalculatedColumn,
			};
			return selector(state);
		});
	});

	it("renders correctly for adding a new column", () => {
		render(
			<CalculatedColumnModal dataset={mockDataset as any} onClose={mockOnClose} />
		);

		expect(screen.getByText("Add Calculated Series")).toBeDefined();
		expect(screen.getByLabelText("Column Name")).toBeDefined();
		expect(screen.getByLabelText("Formula")).toBeDefined();
	});

	it("renders correctly for editing an existing column", () => {
		render(
			<CalculatedColumnModal
				dataset={mockDataset as any}
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
			<CalculatedColumnModal dataset={mockDataset as any} onClose={mockOnClose} />
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
			<CalculatedColumnModal dataset={mockDataset as any} onClose={mockOnClose} />
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
			<CalculatedColumnModal dataset={mockDataset as any} onClose={mockOnClose} />
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
			<CalculatedColumnModal dataset={mockDataset as any} onClose={mockOnClose} />
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
});
