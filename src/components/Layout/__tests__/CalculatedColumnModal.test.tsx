import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Mock } from "vitest";
import { CalculatedColumnModal } from "../CalculatedColumnModal";
import { useGraphStore } from "../../../store/useGraphStore";
import type { Dataset } from "../../../services/persistence";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

// Mock the graph store
vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

// Mock the formula utils (to simplify live validation)
vi.mock("../../../utils/formula", () => ({
	compileFormula: vi.fn().mockReturnValue({ error: null }),
	matchRegressionFormula: vi.fn().mockReturnValue(null),
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
		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		expect(screen.getByText("Add Calculated Column")).toBeDefined();
		expect(screen.getByLabelText("Column name")).toBeDefined();
		expect(screen.getByLabelText("Formula")).toBeDefined();
	});

	it("starts on the name field with Create Column bottom-right", () => {
		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		expect(screen.getByLabelText("Column name")).toBe(document.activeElement);
		const submit = screen.getByRole("button", { name: "Create Column" });
		expect(submit.closest(".modal-footer")).not.toBeNull();
	});

	it("renders correctly for editing an existing column", () => {
		render(
			<CalculatedColumnModal
				dataset={mockDataset}
				onClose={mockOnClose}
				initialName="Calc A"
				initialFormula="[A] * 2"
			/>,
		);

		expect(screen.getByText("Edit Calculated Column")).toBeDefined();
		expect(screen.getByDisplayValue("Calc A")).toBeDefined();
		expect(screen.getByDisplayValue("[A] * 2")).toBeDefined();
	});

	it("shows error if calculation fails during submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({
			success: false,
			error: "Formula compilation error",
		});

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Column"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("Formula compilation error")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]",
			undefined,
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("shows default error if calculation fails without specific error message", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({
			success: false,
		});

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Column"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("Calculation failed")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]",
			undefined,
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("shows generic error if addCalculatedColumn throws", async () => {
		mockAddCalculatedColumn.mockRejectedValueOnce(new Error("Network Error"));

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Column"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("Network Error")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]",
			undefined,
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("handles unexpected non-Error throws", async () => {
		mockAddCalculatedColumn.mockRejectedValueOnce("String error throw");

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Column"));

		// Wait for error to display
		await waitFor(() => {
			expect(screen.getByText("An unexpected error occurred")).toBeDefined();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]",
			undefined,
		);
		expect(mockOnClose).not.toHaveBeenCalled();
	});

	it("calls onClose on successful calculation", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		// Fill inputs
		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "[A] + [B]" },
		});

		// Submit form
		fireEvent.click(screen.getByText("Create Column"));

		// Wait for close to be called
		await waitFor(() => {
			expect(mockOnClose).toHaveBeenCalled();
		});

		expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
			"dataset-1",
			"New Calc",
			"[A] + [B]",
			undefined,
		);
	});

	it("shows validation error for empty name", () => {
		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		fireEvent.click(screen.getByText("Create Column"));

		expect(screen.getByText("Please enter a column name.")).toBeDefined();
		expect(mockAddCalculatedColumn).not.toHaveBeenCalled();
	});

	it("shows validation error for empty formula", () => {
		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "New Calc" },
		});

		fireEvent.click(screen.getByText("Create Column"));

		expect(screen.getByText("Please enter a formula.")).toBeDefined();
		expect(mockAddCalculatedColumn).not.toHaveBeenCalled();
	});

	it("edits in place via addCalculatedColumn's replace argument", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(
			<CalculatedColumnModal
				dataset={mockDataset}
				onClose={mockOnClose}
				initialName="Original Name"
				initialFormula="[A] * 2"
			/>,
		);

		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "Updated Name" },
		});

		fireEvent.click(screen.getByText("Save Column"));

		await waitFor(() => {
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Updated Name",
				"[A] * 2",
				"Original Name",
			);
			expect(mockOnClose).toHaveBeenCalled();
		});
		// Removing first would record a second undo step and lose the column
		// if the new formula failed.
		expect(mockRemoveCalculatedColumn).not.toHaveBeenCalled();
	});

	it("auto-closes unbalanced brackets on submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "Auto Close" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "([A] * 2" },
		});

		fireEvent.click(screen.getByText("Create Column"));

		await waitFor(() => {
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Auto Close",
				"([A] * 2)",
				undefined,
			);
		});
	});

	it("auto-closes multiple nested unbalanced brackets on submit", async () => {
		mockAddCalculatedColumn.mockResolvedValueOnce({ success: true });

		render(<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />);

		fireEvent.change(screen.getByLabelText("Column name"), {
			target: { value: "Nested Auto Close" },
		});
		fireEvent.change(screen.getByLabelText("Formula"), {
			target: { value: "((([A" },
		});

		fireEvent.click(screen.getByText("Create Column"));

		await waitFor(() => {
			expect(mockAddCalculatedColumn).toHaveBeenCalledWith(
				"dataset-1",
				"Nested Auto Close",
				"((([A])))",
				undefined,
			);
		});
	});

	it(
		"has no axe violations",
		async () => {
			const { container } = render(
				<CalculatedColumnModal dataset={mockDataset} onClose={mockOnClose} />,
			);
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});
