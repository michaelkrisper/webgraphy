import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import type { Mock } from "vitest";
import { useGraphStore } from "../../../store/useGraphStore";
import { useTheme } from "../../../hooks/useTheme";
import { SidebarHeader } from "../SidebarHeader";

vi.mock("../../../store/useGraphStore", () => {
	const store = vi.fn() as ReturnType<typeof vi.fn> & {
		getState: ReturnType<typeof vi.fn>;
		setState: ReturnType<typeof vi.fn>;
	};
	store.getState = vi.fn();
	store.setState = vi.fn();
	return { useGraphStore: store };
});

vi.mock("../../../hooks/useTheme", () => ({
	useTheme: vi.fn(),
}));

vi.mock("../../Sidebar/PopupPicker", () => ({
	PopupPicker: ({ options, current, onChange, renderTrigger, popoverId }: any) => {
		return (
			<div data-testid={`popup-picker-${popoverId}`}>
				{renderTrigger({
					onClick: () => {
						// For testing export, we'll just simulate a click firing onChange
						if (popoverId === "export-popover") {
							// We'll expose buttons to trigger both PNG and SVG exports for the test
							onChange("svg");
						}
					},
					ref: { current: null },
					isOpen: false,
				})}
				{/* Hidden buttons to trigger specific onChange calls in tests */}
				{popoverId === "export-popover" && (
					<>
						<button data-testid="export-svg-trigger" onClick={() => onChange("svg")} />
						<button data-testid="export-png-trigger" onClick={() => onChange("png")} />
					</>
				)}
				{popoverId === "theme-popover" && (
					<button data-testid="theme-trigger" onClick={() => onChange("dark")} />
				)}
			</div>
		);
	},
}));

describe("SidebarHeader", () => {
	const mockOnCollapse = vi.fn();
	const mockOnImport = vi.fn();
	const mockOnExportSVG = vi.fn();
	const mockOnExportPNG = vi.fn();

	const mockLoadDemoData = vi.fn();
	const mockUpdateXAxis = vi.fn();
	const mockSetLegendVisible = vi.fn();
	const mockSetCrosshairVisible = vi.fn();
	const mockSetTheme = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		const defaultState = {
			loadDemoData: mockLoadDemoData,
			updateXAxis: mockUpdateXAxis,
			xAxes: [{ id: "axis-1", showGrid: true }],
			legendVisible: true,
			setLegendVisible: mockSetLegendVisible,
			crosshairVisible: true,
			setCrosshairVisible: mockSetCrosshairVisible,
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof defaultState) => unknown) =>
				sel ? sel(defaultState) : defaultState,
		);

		(useTheme as unknown as Mock).mockReturnValue(["light", vi.fn(), mockSetTheme]);
	});

	it("renders correctly", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		expect(screen.getByTitle("Import Data Source")).toBeInTheDocument();
		expect(screen.getByTitle("Load Demo Data")).toBeInTheDocument();
		expect(screen.getByTitle("Hide Vertical Grid")).toBeInTheDocument();
		expect(screen.getByTitle("Hide Crosshair")).toBeInTheDocument();
		expect(screen.getByTitle("Hide Legend")).toBeInTheDocument();
		expect(screen.getByTitle("Collapse Sidebar")).toBeInTheDocument();
		// Webgraphy logo button (first button)
		expect(screen.getByLabelText("Collapse Sidebar")).toBeInTheDocument();
	});

	it("calls onCollapse when logo button is clicked", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByLabelText("Collapse Sidebar"));
		expect(mockOnCollapse).toHaveBeenCalled();
	});

	it("calls onCollapse when collapse button is clicked", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Collapse Sidebar"));
		expect(mockOnCollapse).toHaveBeenCalled();
	});

	it("calls onImport when import button is clicked", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Import Data Source"));
		expect(mockOnImport).toHaveBeenCalled();
	});

	it("calls loadDemoData when demo data button is clicked", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Load Demo Data"));
		expect(mockLoadDemoData).toHaveBeenCalled();
	});

	it("toggles vertical grid visibility", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Hide Vertical Grid"));
		expect(mockUpdateXAxis).toHaveBeenCalledWith("axis-1", { showGrid: false });
	});

	it("toggles crosshair visibility", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Hide Crosshair"));
		expect(mockSetCrosshairVisible).toHaveBeenCalledWith(false);
	});

	it("toggles legend visibility", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTitle("Hide Legend"));
		expect(mockSetLegendVisible).toHaveBeenCalledWith(false);
	});

	it("handles export triggers correctly", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTestId("export-svg-trigger"));
		expect(mockOnExportSVG).toHaveBeenCalled();

		fireEvent.click(screen.getByTestId("export-png-trigger"));
		expect(mockOnExportPNG).toHaveBeenCalled();
	});

	it("handles theme selection correctly", () => {
		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		fireEvent.click(screen.getByTestId("theme-trigger"));
		expect(mockSetTheme).toHaveBeenCalledWith("dark");
	});

	it("renders alternate states correctly based on store", () => {
		const alternativeState = {
			loadDemoData: mockLoadDemoData,
			updateXAxis: mockUpdateXAxis,
			xAxes: [{ id: "axis-1", showGrid: false }],
			legendVisible: false,
			setLegendVisible: mockSetLegendVisible,
			crosshairVisible: false,
			setCrosshairVisible: mockSetCrosshairVisible,
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof alternativeState) => unknown) =>
				sel ? sel(alternativeState) : alternativeState,
		);

		render(
			<SidebarHeader
				onCollapse={mockOnCollapse}
				onImport={mockOnImport}
				onExportSVG={mockOnExportSVG}
				onExportPNG={mockOnExportPNG}
			/>
		);

		expect(screen.getByTitle("Show Vertical Grid")).toBeInTheDocument();
		expect(screen.getByTitle("Show Crosshair")).toBeInTheDocument();
		expect(screen.getByTitle("Show Legend")).toBeInTheDocument();
	});
});
