import "@testing-library/jest-dom";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import { PlotDataTableModal } from "../PlotDataTableModal";

const dataset = {
	id: "ds-1",
	name: "Sensors",
	columns: ["time", "temp"],
	rowCount: 4,
	xAxisColumn: "time",
	xAxisId: "axis-1",
	data: [
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 3 },
			data: new Float32Array([0, 1, 2, 3]),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 10, max: 40 },
			data: new Float32Array([10, 20, 30, 40]),
		},
	],
} as unknown as Dataset;

const series = [
	{
		id: "s1",
		sourceId: "ds-1",
		name: "Temperature",
		yColumn: "temp",
		yAxisId: "axis-1",
		hidden: false,
	},
] as unknown as SeriesConfig[];

const xAxes = [
	{
		id: "axis-1",
		name: "Time",
		min: 0,
		max: 3,
		showGrid: true,
		xMode: "numeric",
	},
] as XAxisConfig[];

describe("PlotDataTableModal", () => {
	it("renders the plotted values as a real table", () => {
		render(
			<PlotDataTableModal
				series={series}
				datasets={[dataset]}
				xAxes={xAxes}
				onClose={vi.fn()}
			/>,
		);

		const table = screen.getByRole("table", { name: "Temperature" });
		expect(table).toBeInTheDocument();
		expect(
			screen.getByRole("columnheader", { name: "Time" }),
		).toBeInTheDocument();
		// Every plotted value is present, not just a summary of them.
		for (const value of ["10", "20", "30", "40"]) {
			expect(screen.getByRole("cell", { name: value })).toBeInTheDocument();
		}
	});

	it("says so rather than rendering an empty table when nothing is plotted", () => {
		render(
			<PlotDataTableModal
				series={[]}
				datasets={[dataset]}
				xAxes={xAxes}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.queryByRole("table")).not.toBeInTheDocument();
		expect(screen.getByText(/No data series are displayed/)).toBeInTheDocument();
	});

	it("has no axe violations", async () => {
		const { container } = render(
			<PlotDataTableModal
				series={series}
				datasets={[dataset]}
				xAxes={xAxes}
				onClose={vi.fn()}
			/>,
		);
		expect(await axe(container)).toHaveNoViolations();
	});
});
