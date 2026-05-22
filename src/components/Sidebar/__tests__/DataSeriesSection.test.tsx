import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { DataSeriesSection } from "../DataSeriesSection";
import { useGraphStore } from "../../../store/useGraphStore";

// Mock the graph store
vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

// Mock the child component to simplify testing
vi.mock("../SeriesConfig", () => ({
	SeriesConfigUI: ({ series, onHandleMouseDown }: { series: { id: string; name?: string; columnId?: string }; onHandleMouseDown?: (e: React.MouseEvent) => void }) => (
		<div data-testid={`series-config-${series.id}`} onMouseDown={onHandleMouseDown}>
			{series.name || series.columnId}
		</div>
	),
}));

describe("DataSeriesSection", () => {
	const mockSetHighlightedSeries = vi.fn();
	const mockReorderSeries = vi.fn();
	const mockOnToggle = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Default store setup
		vi.mocked(useGraphStore).mockImplementation((selector: (state: { series: unknown[]; datasets: unknown[]; setHighlightedSeries: (id: string | null) => void; reorderSeries: (id: string, index: number) => void }) => unknown) => {
			const store = {
				series: [],
				datasets: [],
				setHighlightedSeries: mockSetHighlightedSeries,
				reorderSeries: mockReorderSeries,
			};
			return selector(store);
		});
	});

	it("renders empty state message when no series exist", () => {
		render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);

		expect(screen.getByText("Data Series")).toBeInTheDocument();
		expect(screen.getByText("Add columns from data sources")).toBeInTheDocument();
	});

	it("renders series rows when series exist", () => {
		const mockSeries = [
			{ id: "s1", columnId: "col1", name: "Series 1" },
			{ id: "s2", columnId: "col2", name: "Series 2" },
		];

		vi.mocked(useGraphStore).mockImplementation((selector: (state: { series: unknown[]; datasets: unknown[]; setHighlightedSeries: (id: string | null) => void; reorderSeries: (id: string, index: number) => void }) => unknown) => {
			const store = {
				series: mockSeries,
				datasets: [],
				setHighlightedSeries: mockSetHighlightedSeries,
				reorderSeries: mockReorderSeries,
			};
			return selector(store);
		});

		render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);

		expect(screen.queryByText("Add columns from data sources")).not.toBeInTheDocument();
		expect(screen.getByTestId("series-config-s1")).toBeInTheDocument();
		expect(screen.getByTestId("series-config-s2")).toBeInTheDocument();
	});

	it("calls onToggle when section header is clicked", () => {
		render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);

		const toggleButton = screen.getByRole("button", { name: /Data Series/i });
		fireEvent.click(toggleButton);

		expect(mockOnToggle).toHaveBeenCalledTimes(1);
	});

	it("calls setHighlightedSeries on mouse enter/leave", () => {
		const mockSeries = [
			{ id: "s1", columnId: "col1", name: "Series 1" },
		];

		vi.mocked(useGraphStore).mockImplementation((selector: (state: { series: unknown[]; datasets: unknown[]; setHighlightedSeries: (id: string | null) => void; reorderSeries: (id: string, index: number) => void }) => unknown) => {
			const store = {
				series: mockSeries,
				datasets: [],
				setHighlightedSeries: mockSetHighlightedSeries,
				reorderSeries: mockReorderSeries,
			};
			return selector(store);
		});

		render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);

		// The <li> element has the data-series-id
		const row = document.querySelector('[data-series-id="s1"]');
		expect(row).toBeInTheDocument();

		if (row) {
			fireEvent.mouseEnter(row);
			expect(mockSetHighlightedSeries).toHaveBeenCalledWith("s1");

			fireEvent.mouseLeave(row);
			expect(mockSetHighlightedSeries).toHaveBeenCalledWith(null);
		}
	});

	it("does not render contents when closed", () => {
		render(<DataSeriesSection open={false} onToggle={mockOnToggle} />);

		expect(screen.getByText("Data Series")).toBeInTheDocument();
		// The list container should not be there
		expect(screen.queryByText("Add columns from data sources")).not.toBeInTheDocument();
	});
});
