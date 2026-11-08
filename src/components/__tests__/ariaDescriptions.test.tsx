import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { computeAccessibleName } from "dom-accessibility-api";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { AXE_TIMEOUT_MS } from "../../__tests__/axeTimeout";
import type {
	DataColumn,
	Dataset,
	SeriesConfig,
} from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { notify, useNotificationStore } from "../../store/useNotificationStore";
import ErrorBoundary from "../ErrorBoundary";
import { CalculatedColumnModal } from "../Layout/CalculatedColumnModal";
import { ConfirmDialog } from "../Layout/ConfirmDialog";
import { ExportImageDialog } from "../Layout/ExportImageDialog";
import { HelpModal } from "../Layout/HelpModal";
import { ImportSettingsDialog } from "../Layout/ImportSettingsDialog";
import { ImprintModal } from "../Layout/ImprintModal";
import { KeyboardShortcutsModal } from "../Layout/KeyboardShortcutsModal";
import { LicenseModal } from "../Layout/LicenseModal";
import { Sidebar } from "../Layout/Sidebar";
import { Toaster } from "../Layout/Toaster";
import {
	XAxisInteractionZones,
	YAxisInteractionZones,
} from "../Plot/AxisInteractionZones";
import AxisRangePopover from "../Plot/AxisRangePopover";
import { ChartActionButtons } from "../Plot/ChartActionButtons";
import { ChartLegend } from "../Plot/ChartLegend";
import { EmptyState } from "../Plot/EmptyState";
import type { XAxisLayout } from "../Plot/chartTypes";
import { MeasureReadout, StatsPanel } from "../Plot/measure/MeasurePanels";
import { PlotDataTableModal } from "../Plot/PlotDataTableModal";
import { WebGLRenderer } from "../Plot/WebGLRenderer";

/**
 * Every control must say what it is (accessible name) and what it does
 * (accessible description, distinct from the name). New controls fail here
 * until they get both, so the descriptions cannot quietly erode.
 *
 * Names come from dom-accessibility-api. Descriptions are read through
 * jest-dom's matcher: the dom-accessibility-api copy Testing Library hoists
 * (0.5) predates ARIA 1.3 and ignores `aria-description`, falling back to
 * `title` — which on most icon buttons equals the name. jest-dom bundles a
 * newer copy that follows the browser order (aria-describedby, then
 * aria-description, then title).
 */

const CONTROLS = [
	"button",
	"input",
	"select",
	"textarea",
	"[role=button]",
	"[role=menuitem]",
	"[role=option]",
	"[role=tab]",
	"[role=switch]",
	'[tabindex="0"]',
].join(",");

// Hidden file inputs (display: none) are only ever clicked programmatically by
// the visible Import buttons: never focused, not in the accessibility tree, so
// there is nothing for them to announce.
const isExempt = (el: Element) => el.matches('input[type="file"]');

function expectNamedAndDescribed(root: ParentNode = document.body) {
	const controls = Array.from(root.querySelectorAll<HTMLElement>(CONTROLS));
	const checked = controls.filter((el) => !isExempt(el));
	expect(checked.length).toBeGreaterThan(0);
	for (const el of checked) {
		const name = computeAccessibleName(el);
		const where = el.outerHTML.slice(0, 160);
		expect.soft(name, `name of ${where}`).not.toBe("");
		expect.soft(el, `description of ${where}`).toHaveAccessibleDescription();
		expect
			.soft(el, `description repeats the name of ${where}`)
			.not.toHaveAccessibleDescription(name);
	}
	return checked.length;
}

async function expectNoAxeViolations(root: Element = document.body) {
	expect(await axe(root)).toHaveNoViolations();
}

vi.mock("../Plot/renderBackend", () => {
	const backend = {
		setViewport: vi.fn(),
		setPlotBg: vi.fn(),
		setSeries: vi.fn(),
		setOverlay: vi.fn(),
		setLabels: vi.fn(),
		sceneShared: vi.fn(() => false),
		setSceneContext: vi.fn(),
		redraw: vi.fn(),
		dispose: vi.fn(),
	};
	return {
		acquireRenderBackend: vi.fn(() => backend),
		releaseRenderBackend: vi.fn(),
	};
});

const column = (values: number[], formula?: string): DataColumn => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min: Math.min(...values), max: Math.max(...values) },
	data: Float32Array.from(values),
	...(formula ? { formula } : {}),
});

const datasets: Dataset[] = [
	{
		id: "ds-a",
		name: "Station A",
		columns: ["Time", "Temp", "Dew", "Temp x2"],
		data: [
			column([0, 1, 2]),
			column([10, 12, 11]),
			column([5, 6, 5]),
			column([20, 24, 22], "[Temp] * 2"),
		],
		rowCount: 3,
		xAxisColumn: "Time",
		xAxisId: "axis-1",
	},
	{
		id: "ds-b",
		name: "Station B",
		columns: ["t", "Pressure"],
		data: [column([0, 1, 2]), column([1000, 1010, 990])],
		rowCount: 3,
		xAxisColumn: "t",
		xAxisId: "axis-2",
	},
];

const seriesOf = (
	id: string,
	sourceId: string,
	yColumn: string,
	yAxisId: string,
	lineColor: string,
	hidden = false,
): SeriesConfig => ({
	id,
	sourceId,
	name: yColumn,
	yColumn,
	yAxisId,
	lineStyle: "solid",
	pointStyle: "circle",
	lineColor,
	pointColor: lineColor,
	hidden,
});

const series: SeriesConfig[] = [
	seriesOf("s1", "ds-a", "Temp", "axis-1", "#2951eb"),
	seriesOf("s2", "ds-a", "Dew", "axis-1", "#bb7804"),
	seriesOf("s3", "ds-b", "Pressure", "axis-2", "#049967", true),
];

const initialStore = useGraphStore.getState();

beforeEach(() => {
	useGraphStore.setState({
		...initialStore,
		datasets,
		series,
		yAxes: initialStore.yAxes.map((a) =>
			a.id === "axis-2" ? { ...a, position: "right" } : a,
		),
	});
	useNotificationStore.setState({ notifications: [] });
});

describe("accessible names and descriptions", () => {
	describe("sidebar", () => {
		it(
			"header, data sources, series rows and footer",
			async () => {
				render(<Sidebar />);
				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);

		it("the collapsed menu", () => {
			render(<Sidebar />);
			fireEvent.click(
				screen.getAllByRole("button", { name: "Collapse Sidebar" })[0],
			);
			expect(screen.getByRole("button", { name: "Open Menu" })).toBeVisible();
			expectNamedAndDescribed();
		});

		it("a column being renamed", () => {
			render(<Sidebar />);
			fireEvent.click(screen.getAllByRole("button", { name: "Rename column" })[0]);
			expect(
				screen.getByRole("textbox", { name: "New name for Temp" }),
			).toBeVisible();
			expectNamedAndDescribed();
		});

		it(
			"an open picker: named popover, haspopup trigger, pressed option",
			async () => {
				render(<Sidebar />);
				const trigger = screen.getAllByRole("button", {
					name: "Series Style",
				})[0];
				expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
				expect(trigger).toHaveAttribute("aria-expanded", "false");

				fireEvent.click(trigger);
				expect(trigger).toHaveAttribute("aria-expanded", "true");
				const popover = screen.getByRole("dialog", { name: "Series style" });
				expect(
					within(popover).getAllByRole("button", { pressed: true }),
				).toHaveLength(3);
				expect(
					within(popover).getByRole("button", {
						name: "Dashed line, circles",
						pressed: false,
					}),
				).toBeInTheDocument();

				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);

		it("an action menu exposes no pressed state", () => {
			render(<Sidebar />);
			const trigger = screen.getByRole("button", { name: "Session & Export" });
			fireEvent.click(trigger);
			const menu = screen.getByRole("dialog", { name: "Session & Export" });
			for (const item of within(menu).getAllByRole("button")) {
				expect(item).not.toHaveAttribute("aria-pressed");
			}
			expect(
				within(menu).getByRole("button", { name: "Copy chart as image" }),
			).toHaveAccessibleDescription(/clipboard/);
			// The shortcut hints at the right stay out of the item names.
			expect(
				within(menu).getByRole("button", { name: "Save session…" }),
			).toHaveAccessibleDescription(/Ctrl\+S/);
			expectNamedAndDescribed();
		});

		it("toasts with an action", () => {
			notify({
				kind: "info",
				message: "Deleted 'Temp'",
				action: { label: "Undo", onAction: vi.fn() },
			});
			render(<Toaster />);
			expect(
				screen.getByRole("button", { name: "Undo" }),
			).toHaveAccessibleDescription("Deleted 'Temp'");
			expectNamedAndDescribed();
		});
	});

	describe("plot", () => {
		const padding = { top: 10, right: 60, bottom: 50, left: 60 };
		const themeColors = {
			fontFamily: "sans-serif",
			labelColor: "#000",
			plotBg: "#fff",
			gridColor: "#ccc",
			textMuted: "#666",
		};
		const noop = vi.fn();

		it(
			"canvas, fit buttons, legend and axis zones",
			async () => {
				const { xAxes, yAxes } = useGraphStore.getState();
				const { container } = render(
					<div>
						<WebGLRenderer
							datasets={datasets}
							series={series}
							xAxes={xAxes}
							yAxes={yAxes}
							width={600}
							height={400}
							padding={padding}
							plotBg="#ffffff"
						/>
						<ChartActionButtons
							padding={padding}
							themeColors={themeColors}
							onFitAll={noop}
							onStackedFit={noop}
						/>
						<ChartLegend
							series={series}
							onToggleVisibility={noop}
							onHighlight={noop}
						/>
						<XAxisInteractionZones
							xAxesMetrics={[
								{
									id: "axis-1",
									cumulativeOffset: 0,
									height: 50,
									titleBottom: 40,
									labelBottom: 10,
									secLabelBottom: 25,
									total: 50,
								},
							]}
							xAxesLayout={[{ id: "axis-1", title: "Time" } as XAxisLayout]}
							padding={padding}
							editingXAxisId="axis-1"
							setEditingXAxisId={noop}
							themeColors={themeColors}
							onWheel={noop}
							onMouseDown={noop}
							onTouchStart={noop}
							onAutoScaleX={noop}
							onAxisStep={noop}
							onEditRange={noop}
						/>
						<YAxisInteractionZones
							axes={[
								{ id: "axis-1", position: "left" },
								{ id: "axis-2", position: "right" },
							]}
							titles={{ "axis-1": "Temp / Dew", "axis-2": "Pressure" }}
							axisLayout={{
								"axis-1": { total: 40, label: 30 },
								"axis-2": { total: 40, label: 30 },
							}}
							leftOffsets={{}}
							rightOffsets={{}}
							padding={padding}
							width={600}
							height={400}
							themeColors={themeColors}
							containerRef={{ current: null }}
							onWheel={noop}
							onMouseDown={noop}
							onTouchStart={noop}
							onAutoScaleY={noop}
							onAxisStep={noop}
							onEditRange={noop}
						/>
					</div>,
				);
				expect(
					screen.getByRole("group", { name: "X axis 1: Time" }),
				).toHaveAccessibleDescription(/pan, .* zoom/);
				expect(expectNamedAndDescribed(container)).toBeGreaterThanOrEqual(9);
				await expectNoAxeViolations(container);
			},
			AXE_TIMEOUT_MS,
		);

		it("empty state", () => {
			render(
				<EmptyState
					width={600}
					height={400}
					padding={padding}
					onImportFiles={noop}
					onLoadDemo={noop}
				/>,
			);
			expectNamedAndDescribed();
		});

		it("measurement readout and statistics", () => {
			const { xAxes, yAxes } = useGraphStore.getState();
			const point = {
				seriesId: "s1",
				label: "Temp",
				color: "#2951eb",
				lineStyle: "solid",
				pointStyle: "circle",
				xAxisId: "axis-1",
				yAxisId: "axis-1",
				x: 1,
				y: 12,
				xLabel: "1",
			};
			render(
				<>
					<MeasureReadout
						a={{ xAxisId: "axis-1", x: 1, points: [point] }}
						b={{ xAxisId: "axis-1", x: 2, points: [{ ...point, x: 2 }] }}
						xAxes={xAxes}
						yAxes={yAxes}
						xAxisNames={{ "axis-1": "Time" }}
						onClose={noop}
					/>
					<StatsPanel
						series={series}
						datasets={datasets}
						xAxes={xAxes}
						yAxes={yAxes}
						onClose={noop}
					/>
				</>,
			);
			expectNamedAndDescribed();
		});
	});

	describe("dialogs", () => {
		it(
			"Import settings (CSV)",
			async () => {
				render(
					<ImportSettingsDialog
						fileName="weather.csv"
						fileContent={
							"Time,Temp,Site\n2024-01-01,1.5,North\n2024-01-02,2.5,South\n2024-01-03,3.5,North"
						}
						fileType="csv"
						onConfirm={vi.fn()}
						onCancel={vi.fn()}
					/>,
				);
				const dialog = screen.getByRole("dialog", { name: "weather.csv" });
				expect(dialog).toHaveAccessibleDescription(/X axis/);
				expect(screen.getByRole("checkbox")).toBeInTheDocument();
				expect(
					screen.getByRole("textbox", { name: /date format/ }),
				).toBeInTheDocument();
				fireEvent.click(screen.getByRole("button", { name: "Numeric" }));
				expect(
					screen.getByRole("dialog", { name: "Type of Temp" }),
				).toBeInTheDocument();
				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);

		it("Import settings (Excel with sheets)", () => {
			render(
				<ImportSettingsDialog
					fileName="book.xlsx"
					fileContent={"a,b\n1,2"}
					fileType="excel"
					sheets={["One", "Two"]}
					selectedSheet="One"
					onSheetChange={vi.fn()}
					onConfirm={vi.fn()}
					onCancel={vi.fn()}
				/>,
			);
			expect(screen.getByRole("combobox", { name: "Sheet:" })).toBeVisible();
			expectNamedAndDescribed();
		});

		it(
			"Calculated Column, with suggestions and the function reference",
			async () => {
				render(<CalculatedColumnModal dataset={datasets[0]} onClose={vi.fn()} />);
				fireEvent.click(screen.getByRole("button", { name: "Function reference" }));
				fireEvent.change(screen.getByRole("textbox", { name: "Formula" }), {
					target: { value: "[Te" },
				});
				expect(screen.getAllByRole("option").length).toBeGreaterThan(0);
				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);

		it(
			"Export image, through every size option",
			async () => {
				render(
					<ExportImageDialog
						viewSize={{ width: 800, height: 600 }}
						onExport={vi.fn()}
						onClose={vi.fn()}
					/>,
				);
				fireEvent.click(screen.getByRole("radio", { name: "PNG (pixel)" }));
				fireEvent.change(screen.getByRole("combobox", { name: "Size" }), {
					target: { value: "custom" },
				});
				expect(screen.getByRole("combobox", { name: "Scale" })).toBeVisible();
				expectNamedAndDescribed();

				fireEvent.change(screen.getByRole("combobox", { name: "Unit" }), {
					target: { value: "mm" },
				});
				expect(
					screen.getByRole("spinbutton", { name: "Resolution" }),
				).toBeVisible();
				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);

		it.each([
			["Help", () => <HelpModal onClose={vi.fn()} />],
			["Keyboard shortcuts", () => <KeyboardShortcutsModal onClose={vi.fn()} />],
			["Imprint", () => <ImprintModal onClose={vi.fn()} />],
			["License", () => <LicenseModal onClose={vi.fn()} />],
			[
				"Plotted data",
				() => (
					<PlotDataTableModal
						series={series}
						datasets={datasets}
						xAxes={useGraphStore.getState().xAxes}
						feedback={{ notify: vi.fn(), dismiss: vi.fn() }}
						onClose={vi.fn()}
					/>
				),
			],
			[
				"Confirm",
				() => (
					<ConfirmDialog
						title="Load demo data?"
						message="Added alongside."
						confirmLabel="Add alongside"
						confirmDescription="Adds the demo dataset next to your data"
						onConfirm={vi.fn()}
						onCancel={vi.fn()}
					/>
				),
			],
		])("%s", (_name, renderDialog) => {
			render(renderDialog());
			expectNamedAndDescribed();
		});

		it(
			"Axis range popover",
			async () => {
				render(
					<AxisRangePopover
						kind="y"
						axisId="axis-2"
						min={1}
						max={100}
						isDate={false}
						log
						style={{}}
						onApply={vi.fn()}
						onCancel={vi.fn()}
					/>,
				);
				expect(
					screen.getByRole("dialog", { name: "Range of Y axis 2" }),
				).toBeInTheDocument();
				expectNamedAndDescribed();
				await expectNoAxeViolations();
			},
			AXE_TIMEOUT_MS,
		);
	});

	describe("error boundary", () => {
		const Boom = () => {
			throw new Error("boom");
		};

		it.each(["top", "component"] as const)("%s level", (level) => {
			vi.spyOn(console, "error").mockImplementation(() => {});
			render(
				<ErrorBoundary level={level}>
					<Boom />
				</ErrorBoundary>,
			);
			expectNamedAndDescribed();
			if (level === "top") {
				fireEvent.click(screen.getByRole("button", { name: "Reset workspace…" }));
				expectNamedAndDescribed();
			}
		});
	});
});
