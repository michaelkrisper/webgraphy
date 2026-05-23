import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import { SeriesConfigUI } from "../SeriesConfig";
import { useGraphStore } from "../../../store/useGraphStore";

vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
}));

vi.mock("../ColorPicker", () => ({
	default: ({ color, onChange, onHover, onHoverEnd, ariaLabel }: any) => (
		<div data-testid="color-picker" aria-label={ariaLabel}>
			<button type="button" onClick={() => onChange("#000000")}>Change Color</button>
			<button type="button" onMouseEnter={() => onHover("#111111")} onMouseLeave={onHoverEnd}>Hover Color</button>
			{color}
		</div>
	),
}));

vi.mock("../PopupPicker", () => ({
	PopupPicker: ({ current, onChange, renderTrigger }: any) => (
		<div data-testid="popup-picker" data-current={current}>
			{renderTrigger({ onClick: () => onChange(2), ref: null })}
		</div>
	),
}));

describe("SeriesConfigUI", () => {
	const mockUpdateSeries = vi.fn();
	const mockRemoveSeries = vi.fn();
	const mockUpdateYAxis = vi.fn();
	const mockUpdateSeriesVisibility = vi.fn();
	const mockSetPreviewColor = vi.fn();

	const defaultMockState = {
		updateSeries: mockUpdateSeries,
		removeSeries: mockRemoveSeries,
		yAxes: [{ id: "axis-1", position: "left", showGrid: true }],
		updateYAxis: mockUpdateYAxis,
		updateSeriesVisibility: mockUpdateSeriesVisibility,
		series: [{ id: "s1", yAxisId: "axis-1" }, { id: "s2", yAxisId: "axis-2" }], // multiple series to enable yAxis cycling
		setPreviewColor: mockSetPreviewColor,
	};

	beforeEach(() => {
		vi.clearAllMocks();
		vi.mocked(useGraphStore).mockImplementation((selector: any) => selector(defaultMockState));
	});

	const defaultProps = {
		series: {
			id: "s1",
			sourceId: "ds1",
			yColumn: "col1",
			yAxisId: "axis-1",
			lineStyle: "solid",
			pointStyle: "circle",
			lineColor: "#ff0000",
			pointColor: "#ff0000",
			hidden: false,
		} as any,
		datasets: [
			{
				id: "ds1",
				columns: ["time", "col1", "col2"],
				data: [],
			}
		] as any,
	};

	it("renders series configuration UI", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		expect(screen.getByRole("button", { name: "Hide Series" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Select Y-Axis" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Select Line Style" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Select Point Style" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Delete Series" })).toBeInTheDocument();
		expect(screen.getByRole("combobox", { name: "Y Column for col1" })).toBeInTheDocument();
	});

	it("toggles series visibility", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Hide Series" }));
		expect(mockUpdateSeriesVisibility).toHaveBeenCalledWith("s1", true);
	});

    it("renders properly when hidden", () => {
        render(<SeriesConfigUI {...defaultProps} series={{ ...defaultProps.series, hidden: true }} />);

		fireEvent.click(screen.getByRole("button", { name: "Show Series" }));
		expect(mockUpdateSeriesVisibility).toHaveBeenCalledWith("s1", false);
    });

	it("removes series", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Delete Series" }));
		expect(mockRemoveSeries).toHaveBeenCalledWith("s1");
	});

	it("updates y column", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		const select = screen.getByRole("combobox", { name: "Y Column for col1" });
		fireEvent.change(select, { target: { value: "ds1::col2" } });

		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { sourceId: "ds1", yColumn: "col2" });
	});

	it("handles color changes via ColorPicker", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByText("Change Color"));
		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { lineColor: "#000000", pointColor: "#000000" });

		fireEvent.mouseEnter(screen.getByText("Hover Color"));
		expect(mockSetPreviewColor).toHaveBeenCalledWith({ seriesId: "s1", color: "#111111" });

		fireEvent.mouseLeave(screen.getByText("Hover Color"));
		expect(mockSetPreviewColor).toHaveBeenCalledWith(null);
	});

	it("toggles left/right axis position", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Toggle Left/Right Axis" }));
		expect(mockUpdateYAxis).toHaveBeenCalledWith("axis-1", { position: "right" });
	});

	it("toggles grid", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Toggle Grid" }));
		expect(mockUpdateYAxis).toHaveBeenCalledWith("axis-1", { showGrid: false });
	});

	it("updates line style via PopupPicker trigger", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Select Line Style" }));
		// Note: since our mock passes 2 back, it's called with 2.
		// A more complete test might use dynamic callbacks, but this verifies the wiring.
		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { lineStyle: 2 });
	});

	it("updates point style via PopupPicker trigger", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Select Point Style" }));
		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { pointStyle: 2 });
	});

	it("selects y axis and creates new axis if needed", () => {
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));

		// The next axis logic in the component will see `2` because of our mock,
		// nextAxisId will be `axis-2`. Since allSeries has `axis-2` in our mock state,
		// it shouldn't create a new one, but will update the series.
		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { yAxisId: "axis-2" });
	});

	it("creates new y axis if it does not exist", () => {
		vi.mocked(useGraphStore).mockImplementation((selector: any) =>
			selector({
				...defaultMockState,
				series: [{ id: "s1", yAxisId: "axis-1" }, { id: "s3", yAxisId: "axis-3" }],
			})
		);
		render(<SeriesConfigUI {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Select Y-Axis" }));

		// nextAxisId will be axis-2. allSeries doesn't have it.
		expect(mockUpdateYAxis).toHaveBeenCalledWith("axis-2", { position: "left" });
		expect(mockUpdateSeries).toHaveBeenCalledWith("s1", { yAxisId: "axis-2" });
	});
});
