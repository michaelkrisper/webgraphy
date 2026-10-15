import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DataSeriesSection } from "../DataSeriesSection";
import { useGraphStore } from "../../../store/useGraphStore";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

// Mock the graph store
vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

// Mock the child component to simplify testing
vi.mock("../SeriesConfig", () => ({
	SeriesConfigUI: ({
		series,
		onHandleMouseDown,
	}: {
		series: { id: string; name?: string; columnId?: string };
		onHandleMouseDown?: (e: React.MouseEvent) => void;
	}) => (
		<div
			data-testid={`series-config-${series.id}`}
			onMouseDown={onHandleMouseDown}
		>
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
		vi
			.mocked(useGraphStore)
			.mockImplementation(
				(
					selector: (state: {
						series: unknown[];
						datasets: unknown[];
						setHighlightedSeries: (id: string | null) => void;
						reorderSeries: (id: string, index: number) => void;
					}) => unknown,
				) => {
					const store = {
						series: [],
						datasets: [],
						setHighlightedSeries: mockSetHighlightedSeries,
						reorderSeries: mockReorderSeries,
					};
					return selector(store);
				},
			);
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

		vi
			.mocked(useGraphStore)
			.mockImplementation(
				(
					selector: (state: {
						series: unknown[];
						datasets: unknown[];
						setHighlightedSeries: (id: string | null) => void;
						reorderSeries: (id: string, index: number) => void;
					}) => unknown,
				) => {
					const store = {
						series: mockSeries,
						datasets: [],
						setHighlightedSeries: mockSetHighlightedSeries,
						reorderSeries: mockReorderSeries,
					};
					return selector(store);
				},
			);

		render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);

		expect(
			screen.queryByText("Add columns from data sources"),
		).not.toBeInTheDocument();
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
		const mockSeries = [{ id: "s1", columnId: "col1", name: "Series 1" }];

		vi
			.mocked(useGraphStore)
			.mockImplementation(
				(
					selector: (state: {
						series: unknown[];
						datasets: unknown[];
						setHighlightedSeries: (id: string | null) => void;
						reorderSeries: (id: string, index: number) => void;
					}) => unknown,
				) => {
					const store = {
						series: mockSeries,
						datasets: [],
						setHighlightedSeries: mockSetHighlightedSeries,
						reorderSeries: mockReorderSeries,
					};
					return selector(store);
				},
			);

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
		expect(
			screen.queryByText("Add columns from data sources"),
		).not.toBeInTheDocument();
	});

	describe("drag to reorder", () => {
		const threeSeries = [
			{ id: "s1", name: "Series 1" },
			{ id: "s2", name: "Series 2" },
			{ id: "s3", name: "Series 3" },
		];
		// Rows stacked 20px apart: s1 at 0, s2 at 20, s3 at 40.
		const TOP: Record<string, number> = { s1: 0, s2: 20, s3: 40 };

		beforeEach(() => {
			vi.mocked(useGraphStore).mockImplementation(((
				selector: (s: unknown) => unknown,
			) =>
				selector({
					series: threeSeries,
					datasets: [],
					setHighlightedSeries: mockSetHighlightedSeries,
					reorderSeries: mockReorderSeries,
				})) as never);
			vi
				.spyOn(HTMLElement.prototype, "getBoundingClientRect")
				.mockImplementation(function (this: HTMLElement) {
					const top = TOP[this.dataset.seriesId ?? ""] ?? 0;
					return { top, height: 20 } as DOMRect;
				});
		});

		afterEach(() => {
			vi.restoreAllMocks();
		});

		it("moves a dragged row to where it is dropped, showing a ghost meanwhile", () => {
			render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);
			fireEvent.mouseDown(screen.getByTestId("series-config-s1"), {
				clientY: 10,
			});
			fireEvent.mouseMove(window, { clientY: 55 });

			expect(document.querySelector(".sb-series-row--ghost")).not.toBeNull();

			fireEvent.mouseUp(window);
			// Past s3's midpoint: the end of the remaining two rows.
			expect(mockReorderSeries).toHaveBeenCalledWith("s1", 2);
			expect(document.querySelector(".sb-series-row--ghost")).toBeNull();
		});

		it("drops before the first row whose midpoint is below the pointer", () => {
			render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);
			fireEvent.mouseDown(screen.getByTestId("series-config-s3"), {
				clientY: 50,
			});
			fireEvent.mouseMove(window, { clientY: 5 });
			fireEvent.mouseUp(window);
			expect(mockReorderSeries).toHaveBeenCalledWith("s3", 0);
		});

		it("treats a press without movement as a click, not a reorder", () => {
			render(<DataSeriesSection open={true} onToggle={mockOnToggle} />);
			fireEvent.mouseDown(screen.getByTestId("series-config-s2"), {
				clientY: 30,
			});
			fireEvent.mouseMove(window, { clientY: 33 });
			fireEvent.mouseUp(window);
			expect(mockReorderSeries).not.toHaveBeenCalled();

			// The listeners are gone after mouseup.
			fireEvent.mouseMove(window, { clientY: 200 });
			fireEvent.mouseUp(window);
			expect(mockReorderSeries).not.toHaveBeenCalled();
		});
	});

	it(
		"has no axe violations with series rendered",
		async () => {
			const mockSeries = [
				{ id: "s1", columnId: "col1", name: "Series 1" },
				{ id: "s2", columnId: "col2", name: "Series 2" },
			];

			vi
				.mocked(useGraphStore)
				.mockImplementation(
					(
						selector: (state: {
							series: unknown[];
							datasets: unknown[];
							setHighlightedSeries: (id: string | null) => void;
							reorderSeries: (id: string, index: number) => void;
						}) => unknown,
					) => {
						const store = {
							series: mockSeries,
							datasets: [],
							setHighlightedSeries: mockSetHighlightedSeries,
							reorderSeries: mockReorderSeries,
						};
						return selector(store);
					},
				);

			const { container } = render(
				<DataSeriesSection open={true} onToggle={mockOnToggle} />,
			);
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});
