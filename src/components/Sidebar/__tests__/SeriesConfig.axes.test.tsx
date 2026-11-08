import "@testing-library/jest-dom";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { axe } from "vitest-axe";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Dataset, SeriesConfig } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import { SeriesConfigUI } from "../SeriesConfig";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: vi.fn(),
	withHistory: (_label: string, fn: () => unknown) => fn(),
	latestHistoryId: vi.fn(),
	undoIfLatest: vi.fn(),
}));

const mk = (
	id: string,
	yAxisId: string,
	name: string,
	lineColor: string,
): SeriesConfig => ({
	id,
	sourceId: "ds1",
	name,
	yColumn: name,
	yAxisId,
	lineStyle: "solid",
	pointStyle: "circle",
	lineColor,
	pointColor: lineColor,
	hidden: false,
});

const datasets = [
	{ id: "ds1", columns: ["t", "Temp", "Dew", "Wind"], data: [] },
] as unknown as Dataset[];

const updateSeries = vi.fn();
const updateYAxis = vi.fn();

function setStore(
	series: SeriesConfig[],
	positions: Record<string, "left" | "right"> = {},
	titles: Record<string, string> = {},
) {
	const state = {
		updateSeries,
		removeSeries: vi.fn(),
		yAxes: Array.from({ length: 9 }, (_, i) => ({
			id: `axis-${i + 1}`,
			position: positions[`axis-${i + 1}`] ?? "left",
			showGrid: true,
			title: titles[`axis-${i + 1}`],
		})),
		updateYAxis,
		updateSeriesVisibility: vi.fn(),
		series,
		setPreviewColor: vi.fn(),
		setPreviewStyle: vi.fn(),
	};
	vi
		.mocked(useGraphStore)
		.mockImplementation(((selector: (s: typeof state) => unknown) =>
			selector(state)) as unknown as typeof useGraphStore);
}

const temp = mk("s1", "axis-1", "Temp", "#ff0000");
const dew = mk("s2", "axis-1", "Dew", "#0000ff");
const wind = mk("s3", "axis-3", "Wind", "#00ff00");

describe("SeriesConfigUI axis controls", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		setStore([temp, dew, wind]);
	});

	it("shows side, grid and log scale only on the first row of each axis", () => {
		const { unmount } = render(
			<SeriesConfigUI series={temp} datasets={datasets} />,
		);
		expect(
			screen.getByRole("button", { name: "Toggle Left/Right Axis" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Toggle Grid" }),
		).toBeInTheDocument();
		unmount();

		const { container } = render(
			<SeriesConfigUI series={dew} datasets={datasets} />,
		);
		expect(
			screen.queryByRole("button", { name: "Toggle Left/Right Axis" }),
		).toBeNull();
		expect(screen.queryByRole("button", { name: "Toggle Grid" })).toBeNull();
		expect(
			screen.queryByRole("button", { name: "Logarithmic Y Scale" }),
		).toBeNull();
		// One muted marker spans the three cells and says where they went.
		const hints = container.querySelectorAll(".sc-shared-axis");
		expect(hints).toHaveLength(1);
		expect(hints[0]).toHaveAttribute(
			"title",
			"Side, grid and scale of Y1 are set on its first row",
		);
	});

	it("lists used axes with their title and swatches, plus New axis", () => {
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));

		const popover = document.getElementById("y-axis-popover-s2");
		if (!popover) throw new Error("popover not open");
		const items = within(popover).getAllByRole("button");
		expect(items.map((b) => b.textContent)).toEqual([
			"Y1Temp / Dew",
			"Y3Wind",
			"New axis",
		]);
		expect(items[0].querySelectorAll(".sc-axis-swatch")).toHaveLength(2);
		expect(items[0]).toHaveAttribute("title", "Y axis 1: Temp / Dew");
		// Keyboard users land on the first option.
		expect(items[0]).toHaveFocus();
	});

	it("moves the series to the first free slot via New axis", () => {
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));
		const newAxis = screen.getByRole("button", { name: "New axis" });
		expect(newAxis).toHaveAttribute("title", "Move to Y axis 2");
		fireEvent.click(newAxis);
		// Temp keeps Y1 on the left, so the new axis opens on the right.
		expect(updateYAxis).toHaveBeenCalledWith("axis-2", { position: "right" });
		expect(updateSeries).toHaveBeenCalledWith("s2", { yAxisId: "axis-2" });
	});

	it("opens a new axis on the left when no other series uses that side", () => {
		// Wind alone on Y1 (left), Dew on Y3 (right).
		setStore(
			[mk("s3", "axis-1", "Wind", "#00ff00"), mk("s2", "axis-3", "Dew", "#00f")],
			{ "axis-3": "right" },
		);
		render(
			<SeriesConfigUI
				series={mk("s3", "axis-1", "Wind", "#00ff00")}
				datasets={datasets}
			/>,
		);
		fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));
		fireEvent.click(screen.getByRole("button", { name: "New axis" }));
		// Moving Wind empties the left side, so its new axis takes it.
		expect(updateYAxis).toHaveBeenCalledWith("axis-2", { position: "left" });
	});

	it("titles axes by their custom title where set", () => {
		setStore([temp, dew, wind], {}, { "axis-1": "Air" });
		render(<SeriesConfigUI series={dew} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));
		const popover = document.getElementById("y-axis-popover-s2");
		if (!popover) throw new Error("popover not open");
		expect(
			within(popover)
				.getAllByRole("button")
				.map((b) => b.textContent),
		).toEqual(["Y1Air", "Y3Wind", "New axis"]);
	});

	it("shows the slot as Y1 on the axis button", () => {
		render(<SeriesConfigUI series={temp} datasets={datasets} />);
		expect(
			screen.getByRole("button", { name: "Select Y axis" }),
		).toHaveTextContent("Y1");
	});

	it("disables New axis with a reason when all nine are in use", () => {
		const all = Array.from({ length: 9 }, (_, i) =>
			mk(`s${i + 1}`, `axis-${i + 1}`, `C${i + 1}`, "#123456"),
		);
		setStore(all);
		render(<SeriesConfigUI series={all[0]} datasets={datasets} />);
		fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));
		const newAxis = screen.getByRole("button", { name: "New axis" });
		expect(newAxis).toBeDisabled();
		expect(newAxis).toHaveAttribute("title", "All 9 Y axes are in use");
	});

	it(
		"has no axe violations with the picker open",
		async () => {
			render(<SeriesConfigUI series={dew} datasets={datasets} />);
			fireEvent.click(screen.getByRole("button", { name: "Select Y axis" }));
			// The popover is portalled to <body>; landmarks are the app shell's job.
			expect(
				await axe(document.body, { rules: { region: { enabled: false } } }),
			).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});
