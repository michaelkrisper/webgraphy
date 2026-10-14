import { beforeEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { axe } from "vitest-axe";
import type { Mock } from "vitest";
import { useDataImport } from "../../../hooks/useDataImport";
import { removeSeriesWithUndo } from "../../../store/undoToast";
import { exportImage } from "../../../services/export";
import { useGraphStore } from "../../../store/useGraphStore";
import { useNotificationStore } from "../../../store/useNotificationStore";
import { Sidebar } from "../Sidebar";

vi.mock("../../../store/undoToast", () => ({
	deleteWithUndo: vi.fn(),
	removeSeriesWithUndo: vi.fn(),
}));

// Mock the components
vi.mock("../ImportSettingsDialog", () => ({
	ImportSettingsDialog: () => (
		<div data-testid="import-settings-dialog">Import Settings</div>
	),
}));
vi.mock("../CalculatedColumnModal", () => ({
	CalculatedColumnModal: () => <div data-testid="calc-modal">Calc Modal</div>,
}));
vi.mock("../ImprintModal", () => ({
	ImprintModal: () => <div data-testid="imprint-modal">Imprint</div>,
}));
vi.mock("../HelpModal", () => ({
	HelpModal: () => <div data-testid="help-modal">Help</div>,
}));
vi.mock("../LicenseModal", () => ({
	LicenseModal: () => <div data-testid="license-modal">License</div>,
}));
vi.mock("../CollapsedMenuButton", () => ({
	CollapsedMenuButton: ({ onClick }: { onClick: () => void }) => (
		<button type="button" onClick={onClick} data-testid="collapsed-menu-button">
			Menu
		</button>
	),
}));
vi.mock("../../Sidebar/SeriesConfig", () => ({
	SeriesConfigUI: () => <div data-testid="series-config-ui">Series Config</div>,
}));

// Mock the services/export
vi.mock("../../../services/export", () => ({
	exportToSVG: vi.fn().mockReturnValue("<svg></svg>"),
	exportToPNG: vi.fn().mockResolvedValue("data:image/png;base64,..."),
	downloadFile: vi.fn(),
	exportImage: vi.fn().mockResolvedValue(undefined),
}));

// Mock indexedDB for the Reset/Demo buttons
const mockClear = vi.fn();
vi.fn().mockReturnValue({
	objectStore: vi.fn().mockReturnValue({ clear: mockClear }),
	oncomplete: vi.fn(),
});
const mockOpen = vi.fn().mockReturnValue({
	onsuccess: vi.fn(),
});

global.indexedDB = {
	open: mockOpen,
} as unknown;

// Mock window.confirm
const mockConfirm = vi.fn();
window.confirm = mockConfirm;

// Mock localStorage
const mockRemoveItem = vi.fn();
const mockSetItem = vi.fn();
const mockGetItem = vi.fn();
Object.defineProperty(window, "localStorage", {
	value: {
		removeItem: mockRemoveItem,
		setItem: mockSetItem,
		getItem: mockGetItem,
	},
});

// Mock hooks
vi.mock("../../../store/useGraphStore", () => {
	const store = vi.fn() as ReturnType<typeof vi.fn> & {
		getState: ReturnType<typeof vi.fn>;
		setState: ReturnType<typeof vi.fn>;
	};
	store.getState = vi.fn();
	store.setState = vi.fn();
	return {
		useGraphStore: store,
		useGraphHistory: (sel: (s: { past: []; future: [] }) => unknown) =>
			sel({ past: [], future: [] }),
	};
});

vi.mock("../../../hooks/useDataImport", () => ({
	useDataImport: vi.fn(),
}));

describe("Sidebar Component", () => {
	const mockLoadDemoData = vi.fn().mockResolvedValue(undefined);
	const mockImportFile = vi.fn();

	beforeEach(() => {
		vi.clearAllMocks();

		// Default mock returns
		const defaultState = {
			datasets: [],
			series: [],
			xAxes: [],
			yAxes: [],
			legendVisible: true,
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			updateXAxis: vi.fn(),
			reorderSeries: vi.fn(),
			loadDemoData: mockLoadDemoData,
			setHighlightedSeries: vi.fn(),
			addSeries: vi.fn(),
			setLegendVisible: vi.fn(),
			removeCalculatedColumn: vi.fn(),
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof defaultState) => unknown) =>
				sel ? sel(defaultState) : defaultState,
		);

		(useDataImport as unknown as Mock).mockReturnValue({
			importFiles: mockImportFile,
			confirmImport: vi.fn(),
			cancelImport: vi.fn(),
			pendingFile: null,
			isImporting: false,
		});

		// Set a predictable window size to test both mobile and desktop states
		window.innerWidth = 1024;
		window.innerHeight = 768;
	});

	it("renders correctly with default state", () => {
		render(<Sidebar />);
		expect(screen.getByText("Data Sources")).toBeInTheDocument();
		const sidebar = screen.getByRole("complementary");
		expect(sidebar).toBeInTheDocument();
	});

	it("opens modals when links are clicked", async () => {
		render(<Sidebar />);

		const more = screen.getByRole("button", { name: "More" });
		fireEvent.click(more);
		fireEvent.click(screen.getByText("Imprint"));
		expect(await screen.findByTestId("imprint-modal")).toBeInTheDocument();

		fireEvent.click(more);
		fireEvent.click(screen.getByText("License"));
		expect(await screen.findByTestId("license-modal")).toBeInTheDocument();

		fireEvent.click(screen.getByRole("button", { name: "Help" }));
		expect(await screen.findByTestId("help-modal")).toBeInTheDocument();
	});

	it("shows ImportSettingsDialog when there is a pending file", async () => {
		(useDataImport as unknown as Mock).mockReturnValue({
			importFiles: mockImportFile,
			confirmImport: vi.fn(),
			cancelImport: vi.fn(),
			pendingFile: {
				file: new File([""], "test.csv"),
				preview: "a,b\n1,2",
				type: "text/csv",
			},
			isImporting: false,
		});

		render(<Sidebar />);
		expect(
			await screen.findByTestId("import-settings-dialog"),
		).toBeInTheDocument();
	});

	it("shows a plotted column as pressed and toggles it off on click", () => {
		const mockDatasets = [
			{
				id: "ds-1",
				name: "Dataset 1",
				columns: ["time", "value1", "value2"],
				xAxisColumn: "time",
				xAxisId: "axis-1",
				data: [{}, {}, {}],
				rowCount: 0,
			},
		];
		const mockSeries = [
			{
				id: "s-1",
				sourceId: "ds-1",
				yColumn: "value1",
				yAxisId: "axis-1",
				hidden: false,
			},
		];
		const mockXAxes = [{ id: "axis-1", name: "X-Axis 1", xMode: "numeric" }];
		const mockAddSeries = vi.fn();

		const state = {
			datasets: mockDatasets,
			series: mockSeries,
			xAxes: mockXAxes,
			yAxes: [],
			legendVisible: true,
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			updateXAxis: vi.fn(),
			reorderSeries: vi.fn(),
			loadDemoData: mockLoadDemoData,
			setHighlightedSeries: vi.fn(),
			addSeries: mockAddSeries,
			setLegendVisible: vi.fn(),
			removeCalculatedColumn: vi.fn(),
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
		);

		(useGraphStore.getState as Mock).mockReturnValue(state);

		render(<Sidebar />);

		// value1 is plotted: a pressed toggle whose click removes its series
		// instead of adding a duplicate.
		const value1Button = screen.getByRole("button", { name: "value1" });
		expect(value1Button).not.toBeDisabled();
		expect(value1Button).toHaveAttribute("aria-pressed", "true");
		fireEvent.click(value1Button);
		expect(mockAddSeries).not.toHaveBeenCalled();
		expect(removeSeriesWithUndo).toHaveBeenCalledWith("value1", ["s-1"]);

		const value2Button = screen.getByRole("button", { name: "value2" });
		expect(value2Button).toHaveAttribute("aria-pressed", "false");
		fireEvent.click(value2Button);
		expect(mockAddSeries).toHaveBeenCalledTimes(1);
	});

	describe("image export", () => {
		const openMenu = () =>
			fireEvent.click(screen.getByRole("button", { name: "Session & Export" }));

		it("exports the view as on screen from the one-click entries", async () => {
			const plot = document.createElement("div");
			plot.className = "plot-area";
			Object.defineProperty(plot, "clientWidth", { value: 640 });
			Object.defineProperty(plot, "clientHeight", { value: 480 });
			document.body.appendChild(plot);
			try {
				render(<Sidebar />);
				openMenu();
				fireEvent.click(
					screen.getByRole("button", { name: "Export as SVG (vector)" }),
				);
				await vi.waitFor(() => expect(exportImage).toHaveBeenCalledTimes(1));
				expect((exportImage as Mock).mock.calls[0][1]).toMatchObject({
					format: "svg",
					width: 640,
					height: 480,
					legend: "auto",
				});
			} finally {
				plot.remove();
			}
		});

		it("opens the options dialog and exports with its choices", async () => {
			render(<Sidebar />);
			openMenu();
			fireEvent.click(screen.getByRole("button", { name: "Export image…" }));
			const dialog = await screen.findByRole("dialog", { name: "Export Image" });
			expect(dialog).toBeInTheDocument();
			fireEvent.change(screen.getByLabelText("Title"), {
				target: { value: "Run 7" },
			});
			fireEvent.click(screen.getByRole("radio", { name: "SVG (vector)" }));
			fireEvent.click(screen.getByRole("button", { name: "Export" }));
			await vi.waitFor(() => expect(exportImage).toHaveBeenCalledTimes(1));
			// No plot on screen: the current view falls back to 1200 × 800.
			expect((exportImage as Mock).mock.calls[0][1]).toMatchObject({
				format: "svg",
				width: 1200,
				height: 800,
				title: "Run 7",
			});
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		});

		it("reports a too-large image in an error toast", async () => {
			const tooLarge = Object.assign(new Error("Image too large: 99999 px"), {
				name: "CanvasSizeError",
			});
			(exportImage as Mock).mockRejectedValueOnce(tooLarge);
			const plot = document.createElement("div");
			plot.className = "plot-area";
			document.body.appendChild(plot);
			try {
				render(<Sidebar />);
				openMenu();
				fireEvent.click(
					screen.getByRole("button", { name: "Export as PNG (pixel)" }),
				);
				await vi.waitFor(() =>
					expect(useNotificationStore.getState().notifications).toContainEqual(
						expect.objectContaining({
							kind: "error",
							message: "Image too large: 99999 px",
						}),
					),
				);
			} finally {
				plot.remove();
			}
		});
	});

	it("has no axe violations with datasets and series", async () => {
		const state = {
			datasets: [
				{
					id: "ds-1",
					name: "Dataset 1",
					columns: ["time", "value1", "value2"],
					xAxisColumn: "time",
					xAxisId: "axis-1",
					data: [{}, {}, {}],
					rowCount: 3,
				},
			],
			series: [
				{
					id: "s-1",
					sourceId: "ds-1",
					yColumn: "value1",
					yAxisId: "axis-1",
					hidden: false,
				},
			],
			xAxes: [{ id: "axis-1", name: "X-Axis 1", xMode: "numeric" }],
			yAxes: [],
			legendVisible: true,
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			updateXAxis: vi.fn(),
			reorderSeries: vi.fn(),
			loadDemoData: mockLoadDemoData,
			setHighlightedSeries: vi.fn(),
			addSeries: vi.fn(),
			setLegendVisible: vi.fn(),
			removeCalculatedColumn: vi.fn(),
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel?: (s: typeof state) => unknown) => (sel ? sel(state) : state),
		);

		const { container } = render(<Sidebar />);
		expect(await axe(container)).toHaveNoViolations();
	});
});
