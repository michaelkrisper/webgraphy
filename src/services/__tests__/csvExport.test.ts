import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	dismissNotification,
	notify,
	useNotificationStore,
} from "../../store/useNotificationStore";
import { datasetCsvTable, toCsvString, UTF8_BOM } from "../../utils/csv-export";
import { processRawColumn } from "../../utils/data-processing";
import {
	buildCsvBlob,
	CSV_FILE_TYPE,
	exportDatasetCsv,
	exportVisibleCsv,
} from "../csvExport";
import type { Dataset, SeriesConfig, XAxisConfig } from "../persistence";

const col = (values: number[]) => ({
	isFloat64: false,
	...processRawColumn(values),
});

const N = 5000;
const dataset: Dataset = {
	id: "ds-1",
	name: "big.csv",
	columns: ["x", "y"],
	rowCount: N,
	xAxisColumn: "x",
	xAxisId: "axis-1",
	data: [
		col(Array.from({ length: N }, (_, i) => i)),
		col(Array.from({ length: N }, (_, i) => Math.sin(i))),
	],
};

const series = [
	{
		id: "s1",
		sourceId: "ds-1",
		name: "Y",
		yColumn: "y",
		yAxisId: "axis-1",
		hidden: false,
	},
] as unknown as SeriesConfig[];

const xAxes = (min: number, max: number) =>
	[
		{ id: "axis-1", name: "", min, max, showGrid: true, xMode: "numeric" },
	] as XAxisConfig[];

const feedback = { notify, dismiss: dismissNotification };

let createSpy: ReturnType<typeof vi.fn>;
let revokeSpy: ReturnType<typeof vi.fn>;
let clickSpy: ReturnType<typeof vi.spyOn>;
let blobs: Blob[];
let names: string[];

beforeEach(() => {
	blobs = [];
	names = [];
	createSpy = vi.fn((b: Blob) => {
		blobs.push(b);
		return `blob:mock-${blobs.length}`;
	});
	revokeSpy = vi.fn();
	URL.createObjectURL = createSpy as unknown as typeof URL.createObjectURL;
	URL.revokeObjectURL = revokeSpy as unknown as typeof URL.revokeObjectURL;
	clickSpy = vi
		.spyOn(HTMLAnchorElement.prototype, "click")
		.mockImplementation(function (this: HTMLAnchorElement) {
			names.push(this.download);
		});
	useNotificationStore.setState({ notifications: [] });
});

afterEach(() => {
	clickSpy.mockRestore();
	vi.useRealTimers();
});

describe("buildCsvBlob", () => {
	it("produces exactly the serialised text, BOM first, as UTF-8", async () => {
		const table = datasetCsvTable(dataset);
		const blob = await buildCsvBlob(table);
		expect(blob.type).toBe("text/csv;charset=utf-8");
		const bytes = new Uint8Array(await blob.arrayBuffer());
		expect(Array.from(bytes.slice(0, 3))).toEqual([0xef, 0xbb, 0xbf]);
		const text = new TextDecoder("utf-8", { ignoreBOM: true }).decode(bytes);
		expect(text).toBe(toCsvString(table));
		expect(text.startsWith(UTF8_BOM)).toBe(true);
	});

	it("yields to the event loop on long exports", async () => {
		const timeout = vi.spyOn(globalThis, "setTimeout");
		let now = 0;
		const perf = vi
			.spyOn(performance, "now")
			.mockImplementation(() => (now += 5));
		await buildCsvBlob(datasetCsvTable(dataset));
		expect(timeout).toHaveBeenCalledWith(expect.any(Function), 0);
		perf.mockRestore();
		timeout.mockRestore();
	});
});

describe("with the save picker", () => {
	let written: Blob[];
	let picker: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		written = [];
		picker = vi.fn(async ({ suggestedName }: { suggestedName: string }) => ({
			name: `chosen-${suggestedName}`,
			createWritable: async () => ({
				write: async (b: Blob) => {
					written.push(b);
				},
				close: async () => {},
				abort: async () => {},
			}),
		}));
		vi.stubGlobal("showSaveFilePicker", picker);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it("saves where the user picks and names that file in the toast", async () => {
		await exportDatasetCsv(dataset, feedback);
		expect(picker).toHaveBeenCalledWith(
			expect.objectContaining({
				suggestedName: "big.csv",
				types: [CSV_FILE_TYPE],
			}),
		);
		expect(names).toEqual([]);
		expect((await written[0].text()).trimEnd().split("\r\n")).toHaveLength(N + 1);
		const [toast] = useNotificationStore.getState().notifications;
		expect(toast).toMatchObject({
			kind: "success",
			message: "Exported 5,000 rows to chosen-big.csv",
		});
	});

	it("stays silent when the user cancels", async () => {
		picker.mockRejectedValueOnce(new DOMException("aborted", "AbortError"));
		await exportDatasetCsv(dataset, feedback);
		expect(names).toEqual([]);
		expect(written).toEqual([]);
		expect(useNotificationStore.getState().notifications).toEqual([]);
	});

	it("asks for a single visible dataset", async () => {
		await exportVisibleCsv(
			{ series, datasets: [dataset], xAxes: xAxes(10, 19) },
			feedback,
		);
		expect(picker).toHaveBeenCalledTimes(1);
		expect(written).toHaveLength(1);
	});

	it("downloads several visible datasets without asking", async () => {
		const other: Dataset = { ...dataset, id: "ds-2", name: "other.csv" };
		await exportVisibleCsv(
			{
				series: [...series, { ...series[0], id: "s2", sourceId: "ds-2" }],
				datasets: [dataset, other],
				xAxes: xAxes(10, 19),
			},
			feedback,
		);
		expect(picker).not.toHaveBeenCalled();
		expect(names).toEqual(["big-visible.csv", "other-visible.csv"]);
	});
});

describe("exportDatasetCsv", () => {
	it("downloads every row and reports success", async () => {
		await exportDatasetCsv(dataset, feedback);
		expect(names).toEqual(["big.csv"]);
		const text = await blobs[0].text();
		expect(text.trimEnd().split("\r\n")).toHaveLength(N + 1);
		const [toast] = useNotificationStore.getState().notifications;
		expect(toast.kind).toBe("success");
		expect(toast.message).toMatch(/5,000 rows/);
	});

	it("reports a failure as an error toast", async () => {
		createSpy.mockImplementation(() => {
			throw new Error("quota");
		});
		await exportDatasetCsv(dataset, feedback);
		const [toast] = useNotificationStore.getState().notifications;
		expect(toast.kind).toBe("error");
		expect(toast.message).toMatch(/quota/);
	});
});

describe("exportVisibleCsv", () => {
	it("exports only the rows inside the x-axis range", async () => {
		await exportVisibleCsv(
			{
				series,
				datasets: [dataset],
				xAxes: xAxes(10, 19),
			},
			feedback,
		);
		expect(names).toEqual(["big-visible.csv"]);
		const lines = (await blobs[0].text()).trimEnd().split("\r\n");
		// `Blob.text()` decodes as UTF-8 and so consumes the BOM.
		expect(lines[0]).toBe("x,y");
		expect(lines).toHaveLength(11);
		expect(lines[1].startsWith("10,")).toBe(true);
		expect(lines[10].startsWith("19,")).toBe(true);
	});

	it("says so instead of downloading an empty file", async () => {
		await exportVisibleCsv(
			{
				series,
				datasets: [dataset],
				xAxes: xAxes(-10, -5),
			},
			feedback,
		);
		expect(names).toEqual([]);
		const [toast] = useNotificationStore.getState().notifications;
		expect(toast.kind).toBe("info");
	});
});
