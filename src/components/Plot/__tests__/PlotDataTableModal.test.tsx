import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { exportVisibleCsv } from "../../../services/csvExport";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
} from "../../../services/persistence";
import {
	dismissNotification,
	notify,
	useNotificationStore,
} from "../../../store/useNotificationStore";
import { PlotDataTableModal } from "../PlotDataTableModal";

const feedback = { notify, dismiss: dismissNotification };

vi.mock("../../../services/csvExport", () => ({
	exportVisibleCsv: vi.fn(() => Promise.resolve()),
}));

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
				feedback={feedback}
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
				feedback={feedback}
				onClose={vi.fn()}
			/>,
		);

		expect(screen.queryByRole("table")).not.toBeInTheDocument();
		expect(screen.getByText(/No data series are displayed/)).toBeInTheDocument();
	});

	describe("actions", () => {
		const renderModal = (s = series) =>
			render(
				<PlotDataTableModal
					series={s}
					datasets={[dataset]}
					xAxes={xAxes}
					feedback={feedback}
					onClose={vi.fn()}
				/>,
			);

		beforeEach(() => {
			useNotificationStore.setState({ notifications: [] });
			vi.mocked(exportVisibleCsv).mockClear();
		});

		it("copies the shown rows as TSV and confirms with a toast", async () => {
			const writeText = vi.fn(() => Promise.resolve());
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText },
				configurable: true,
			});
			renderModal();
			fireEvent.click(screen.getByRole("button", { name: /Copy table/ }));
			await waitFor(() =>
				expect(useNotificationStore.getState().notifications).toHaveLength(1),
			);
			expect(writeText).toHaveBeenCalledWith(
				"Time\tTemperature\n0\t10\n1\t20\n2\t30\n3\t40\n",
			);
			const [toast] = useNotificationStore.getState().notifications;
			expect(toast.kind).toBe("success");
			expect(toast.message).toMatch(/4 rows/);
		});

		it("reports a rejected clipboard write", async () => {
			Object.defineProperty(navigator, "clipboard", {
				value: { writeText: () => Promise.reject(new Error("denied")) },
				configurable: true,
			});
			renderModal();
			fireEvent.click(screen.getByRole("button", { name: /Copy table/ }));
			await waitFor(() =>
				expect(useNotificationStore.getState().notifications).toHaveLength(1),
			);
			const [toast] = useNotificationStore.getState().notifications;
			expect(toast.kind).toBe("error");
			expect(toast.message).toMatch(/denied/);
		});

		it("reports a missing clipboard API", async () => {
			Object.defineProperty(navigator, "clipboard", {
				value: undefined,
				configurable: true,
			});
			renderModal();
			fireEvent.click(screen.getByRole("button", { name: /Copy table/ }));
			await waitFor(() =>
				expect(useNotificationStore.getState().notifications[0]?.kind).toBe(
					"error",
				),
			);
		});

		it("exports the visible range as CSV", () => {
			renderModal();
			fireEvent.click(screen.getByRole("button", { name: /Export CSV/ }));
			expect(exportVisibleCsv).toHaveBeenCalledWith(
				{ series, datasets: [dataset], xAxes },
				feedback,
			);
		});

		it("puts the actions in the footer and focuses Export CSV", () => {
			renderModal();
			const exportBtn = screen.getByRole("button", { name: /Export CSV/ });
			expect(exportBtn.closest(".modal-footer")).not.toBeNull();
			expect(exportBtn).toHaveFocus();
		});

		it("disables both when nothing is plotted", () => {
			renderModal([]);
			expect(screen.getByRole("button", { name: /Copy table/ })).toBeDisabled();
			expect(screen.getByRole("button", { name: /Export CSV/ })).toBeDisabled();
		});
	});

	it("has no axe violations", async () => {
		const { container } = render(
			<PlotDataTableModal
				series={series}
				datasets={[dataset]}
				xAxes={xAxes}
				feedback={feedback}
				onClose={vi.fn()}
			/>,
		);
		expect(await axe(container)).toHaveNoViolations();
	});
});
