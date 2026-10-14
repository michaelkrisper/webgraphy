import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { exportDatasetCsv } from "../../../services/csvExport";
import type { Dataset } from "../../../services/persistence";
import { useGraphStore } from "../../../store/useGraphStore";
import { DatasetItem } from "../DatasetItem";

vi.mock("../../../services/csvExport", () => ({
	exportDatasetCsv: vi.fn(() => Promise.resolve()),
}));

vi.mock("../PopupPicker", () => ({
	PopupPicker: ({
		renderTrigger,
	}: {
		renderTrigger: (args: {
			onClick: () => void;
			ref: null;
			isOpen: boolean;
		}) => ReactNode;
	}) => renderTrigger({ onClick: vi.fn(), ref: null, isOpen: false }),
}));

vi.mock("../../../store/useGraphStore", () => ({ useGraphStore: vi.fn() }));

const dataset = {
	id: "ds-1",
	name: "Sensors",
	columns: ["time", "temp", "calc"],
	rowCount: 2,
	xAxisColumn: "time",
	xAxisId: "axis-1",
	data: [
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 1 },
			data: new Float32Array(2),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 1 },
			data: new Float32Array(2),
		},
		{
			isFloat64: false,
			refPoint: 0,
			bounds: { min: 0, max: 1 },
			data: new Float32Array(2),
			formula: "[temp] * 2",
		},
	],
} as unknown as Dataset;

describe("DatasetItem", () => {
	beforeEach(() => {
		vi.mocked(exportDatasetCsv).mockClear();
		const state = {
			datasets: [dataset],
			series: [],
			removeDataset: vi.fn(),
			updateDataset: vi.fn(),
			addSeries: vi.fn(),
			removeCalculatedColumn: vi.fn(),
			renameColumn: vi.fn(),
		};
		(useGraphStore as unknown as Mock).mockImplementation(
			(sel: (s: typeof state) => unknown) => sel(state),
		);
	});

	const renderItem = () =>
		render(
			<DatasetItem
				dataset={dataset}
				setCalculatingDatasetId={vi.fn()}
				setEditingColumn={vi.fn()}
			/>,
		);

	it("exports the whole dataset as CSV", async () => {
		renderItem();
		fireEvent.click(
			screen.getByRole("button", { name: "Export Sensors as CSV" }),
		);
		await waitFor(() =>
			expect(exportDatasetCsv).toHaveBeenCalledWith(
				dataset,
				expect.objectContaining({ notify: expect.any(Function) }),
			),
		);
	});

	it("has no axe violations", async () => {
		const { container } = renderItem();
		expect(await axe(container)).toHaveNoViolations();
	});
});
