// The demo hand-over against the real store: one undo step, X axis 1.
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DataColumn, ParsedDataset } from "../../services/persistence";
import { clearHistory, useGraphStore } from "../../store/useGraphStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import type { ImportSettings } from "../../types/import";
import { parseDataInWorker } from "../../workers/parserClient";
import { useDataImport } from "../useDataImport";

vi.mock("../../services/persistence", () => ({
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		clearAppState: vi.fn().mockResolvedValue(undefined),
	},
}));

vi.mock("../../workers/parserClient", () => ({
	parseDataInWorker: vi.fn(),
	previewJsonInWorker: vi.fn(),
}));

const settings: ImportSettings = {
	delimiter: ",",
	decimalPoint: ".",
	startRow: 1,
	columnConfigs: [],
};

const col = (values: number[]): DataColumn => ({
	isFloat64: false,
	refPoint: 0,
	bounds: { min: Math.min(...values), max: Math.max(...values) },
	data: new Float32Array(values),
});

const userData: ParsedDataset = {
	id: "mine",
	name: "mine.csv",
	columns: ["t", "v"],
	data: [col([1000, 2000]), col([3, 4])],
	rowCount: 2,
	xAxisColumn: "t",
};

async function importUserData() {
	const hook = renderHook(() => useDataImport());
	await act(() => hook.result.current.importFiles([new File(["t,v"], "a.csv")]));
	vi.mocked(parseDataInWorker).mockResolvedValueOnce([userData]);
	await act(() => hook.result.current.confirmImport(settings));
}

describe("importing over demo data", () => {
	beforeEach(() => {
		useGraphStore.setState({
			datasets: [],
			series: [],
			isLoaded: true,
		});
		clearHistory();
		useNotificationStore.setState({ notifications: [] });
	});

	it("replaces the demo, takes X axis 1 and undoes in one step", async () => {
		await useGraphStore.getState().loadDemoData();
		const demo = useGraphStore.getState();
		expect(demo.datasets[0].demo).toBe(true);

		await importUserData();

		const s = useGraphStore.getState();
		expect(s.datasets.map((d) => [d.id, d.xAxisId])).toEqual([
			["mine", "axis-1"],
		]);
		expect(s.series.map((x) => x.sourceId)).toEqual(["mine"]);
		// The demo's axis titles go with it.
		expect(s.yAxes[0].name).toBe("Axis 1");
		expect(s.xAxes[0]).toMatchObject({ min: 1000, max: 2000 });

		const toast = useNotificationStore.getState().notifications.at(-1);
		expect(toast?.message).toBe("Replaced the demo data");
		act(() => toast?.action?.onAction());

		const back = useGraphStore.getState();
		expect(back.datasets).toBe(demo.datasets);
		expect(back.series).toBe(demo.series);
	});

	it("adds beside user data without a replace toast", async () => {
		useGraphStore.getState().addDataset({ ...userData, id: "earlier" });
		await importUserData();

		expect(useGraphStore.getState().datasets.map((d) => d.xAxisId)).toEqual([
			"axis-1",
			"axis-2",
		]);
		expect(
			useNotificationStore.getState().notifications.map((n) => n.message),
		).not.toContain("Replaced the demo data");
	});
});
