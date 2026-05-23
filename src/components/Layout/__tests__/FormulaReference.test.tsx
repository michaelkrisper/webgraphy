import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi, afterEach } from "vitest";
import "@testing-library/jest-dom";
import { FormulaReference } from "../FormulaReference";

describe("FormulaReference", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		vi.unstubAllGlobals();
	});

	it("renders correctly with initial state", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		expect(screen.getByPlaceholderText(/Search functions/)).toBeInTheDocument();
		expect(screen.getByRole("combobox")).toHaveValue("all");
		expect(screen.getByRole("heading", { name: "Math" })).toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Constants" })).toBeInTheDocument();
	});

	it("filters items by a text search query", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		const searchInput = screen.getByPlaceholderText(/Search functions/);
		fireEvent.change(searchInput, { target: { value: "rolling" } });

		// Checking heading text which is more reliable
		expect(screen.queryByRole("heading", { name: "Math" })).not.toBeInTheDocument();
		expect(screen.getByRole("heading", { name: "Rolling / smoothing" })).toBeInTheDocument();
	});

	it("filters items by category select", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		const select = screen.getByRole("combobox");
		fireEvent.change(select, { target: { value: "math" } });

		expect(screen.getByRole("heading", { name: "Math" })).toBeInTheDocument();
		expect(screen.queryByRole("heading", { name: "Logic" })).not.toBeInTheDocument();
	});

	it("shows an empty state message when a search query yields no results", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		const searchInput = screen.getByPlaceholderText(/Search functions/);
		fireEvent.change(searchInput, {
			target: { value: "notafunctionthatshouldeverexist" },
		});

		expect(screen.getByText(/No functions match/)).toBeInTheDocument();
	});

	it("calls onInsert prop when a function button is clicked", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		const insertButtons = screen.getAllByRole("button");
		const mathInsertButton = insertButtons.find((b) =>
			b.title.includes("abs("),
		);
		if (!mathInsertButton)
			throw new Error("Could not find insert button for abs");

		fireEvent.click(mathInsertButton);
		expect(onInsert).toHaveBeenCalledWith("abs(", true);
	});

	it("calls onInsert prop when a constant button is clicked", () => {
		const onInsert = vi.fn();
		render(<FormulaReference onInsert={onInsert} />);

		const insertButtons = screen.getAllByRole("button");
		const constantInsertButton = insertButtons.find((b) =>
			b.title.includes("Insert pi"),
		);
		if (!constantInsertButton)
			throw new Error("Could not find insert button for pi");

		fireEvent.click(constantInsertButton);
		expect(onInsert).toHaveBeenCalledWith("pi", false);
	});
});
