import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	clearHistory,
	useGraphHistory,
	useGraphStore,
} from "../../store/useGraphStore";
import { useNotificationStore } from "../../store/useNotificationStore";
import { useSessionPrompt } from "../../store/useSessionPrompt";
import {
	type Dataset,
	persistence,
	type SeriesConfig,
	type XAxisConfig,
	type YAxisConfig,
} from "../persistence";
import {
	decodeSession,
	encodeSession,
	openSession,
	SESSION_FORMAT_VERSION,
	type SessionContent,
	SessionError,
	sessionFileName,
} from "../session";

vi.mock("../persistence", async (importOriginal) => ({
	...(await importOriginal<typeof import("../persistence")>()),
	persistence: {
		saveDataset: vi.fn(),
		deleteDataset: vi.fn(),
		saveViewport: vi.fn(),
		saveConfig: vi.fn(),
		clearAppState: vi.fn().mockResolvedValue(undefined),
	},
}));

const xAxes = (): XAxisConfig[] =>
	Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: "",
		min: 0,
		max: 100,
		showGrid: i === 0,
		xMode: "numeric",
	}));
const yAxes = (): YAxisConfig[] =>
	Array.from({ length: 9 }, (_, i) => ({
		id: `axis-${i + 1}`,
		name: `Axis ${i + 1}`,
		min: 0,
		max: 100,
		position: i % 2 === 0 ? "left" : "right",
		color: "#475569",
		showGrid: i === 0,
	}));

const series = (
	id: string,
	sourceId: string,
	yColumn: string,
): SeriesConfig => ({
	id,
	sourceId,
	name: yColumn,
	yColumn,
	yAxisId: "axis-2",
	pointStyle: "square",
	pointColor: "#123456",
	lineStyle: "dashed",
	lineColor: "#abcdef",
	hidden: true,
});

/** Bit patterns that a value-based comparison would miss (NaN payload, -0, subnormal). */
const tricky = () => {
	const bits = new Uint32Array([0x7fc00001, 0x80000000, 0x00000001, 0x3f800000]);
	return new Float32Array(bits.buffer);
};

function sampleContent(): SessionContent {
	const main: Dataset = {
		id: "ds-1",
		name: "Sensor log",
		columns: ["Time", "Temp", "Kind", "Temp x2"],
		rowCount: 4,
		xAxisColumn: "Time",
		xAxisId: "axis-1",
		data: [
			{
				isFloat64: true,
				refPoint: 1_700_000_000_000.5,
				bounds: { min: 1_700_000_000_000, max: 1_700_000_003_000 },
				data: new Float32Array([0, 1000, 2000, 3000]),
			},
			{
				isFloat64: false,
				refPoint: 0,
				bounds: { min: -1, max: 1 },
				data: tricky(),
			},
			{
				isFloat64: false,
				refPoint: 0,
				bounds: { min: 0, max: 1 },
				data: new Float32Array([0, 1, 1, 0]),
				categoryLabels: ["a", "b"],
			},
			{
				isFloat64: false,
				refPoint: 0,
				bounds: { min: Infinity, max: -Infinity },
				data: new Float32Array([NaN, NaN, NaN, NaN]),
				formula: "[Temp] * 2",
			},
		],
	};
	const sparse: Dataset = {
		id: "ds-1-sparse-avg-uuid",
		name: "avg",
		columns: ["Time", "avg"],
		rowCount: 2,
		xAxisColumn: "Time",
		xAxisId: "axis-1",
		data: [
			{
				isFloat64: true,
				refPoint: 1_700_000_000_000.5,
				bounds: { min: 1, max: 2 },
				data: new Float32Array([0, 86_400_000]),
			},
			{
				isFloat64: false,
				refPoint: 0,
				bounds: { min: 3, max: 4 },
				data: new Float32Array([3, 4]),
				formula: "avgDay([Temp])",
			},
		],
	};
	const x = xAxes();
	x[0] = { ...x[0], min: 12.5, max: 99.25, xMode: "date", name: "When" };
	const y = yAxes();
	y[1] = { ...y[1], min: -3, max: 7, color: "#ff0000", position: "right" };
	return {
		datasets: [main, sparse],
		series: [series("s-1", "ds-1", "Temp"), series("s-2", sparse.id, "avg")],
		xAxes: x,
		yAxes: y,
		legendVisible: false,
		crosshairVisible: true,
	};
}

const bitsOf = (a: Float32Array) =>
	Array.from(new Uint32Array(a.buffer, a.byteOffset, a.length));

async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
	const stream = new ReadableStream<BufferSource>({
		start(c) {
			c.enqueue(bytes as BufferSource);
			c.close();
		},
	}).pipeThrough(new DecompressionStream("gzip"));
	return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Rewrites the uncompressed container's JSON header (keeps the data section aligned). */
function withHeader(
	raw: Uint8Array,
	edit: (h: Record<string, unknown>) => void,
) {
	const view = new DataView(raw.buffer, raw.byteOffset);
	const len = view.getUint32(12, true);
	const header = JSON.parse(
		new TextDecoder().decode(raw.subarray(16, 16 + len)),
	);
	const dataStart = 16 + len + ((4 - ((16 + len) % 4)) % 4);
	edit(header);
	const json = new TextEncoder().encode(JSON.stringify(header));
	const pad = (4 - ((16 + json.length) % 4)) % 4;
	const out = new Uint8Array(16 + json.length + pad + raw.length - dataStart);
	out.set(raw.subarray(0, 12));
	new DataView(out.buffer).setUint32(12, json.length, true);
	out.set(json, 16);
	out.set(raw.subarray(dataStart), 16 + json.length + pad);
	return out;
}

const bufferOf = (u: Uint8Array) =>
	u.buffer.slice(u.byteOffset, u.byteOffset + u.byteLength) as ArrayBuffer;

describe("session format", () => {
	it("round-trips datasets and state, Float32 bit-exact", async () => {
		const content = sampleContent();
		const file = await encodeSession(content);
		expect([file[0], file[1]]).toEqual([0x1f, 0x8b]);

		const back = await decodeSession(bufferOf(file));

		expect(back.series).toEqual(content.series);
		expect(back.xAxes).toEqual(content.xAxes);
		expect(back.yAxes).toEqual(content.yAxes);
		expect(back.legendVisible).toBe(false);
		expect(back.crosshairVisible).toBe(true);
		expect(back.datasets).toHaveLength(2);
		content.datasets.forEach((ds, d) => {
			const got = back.datasets[d];
			expect(got).toMatchObject({
				id: ds.id,
				name: ds.name,
				columns: ds.columns,
				rowCount: ds.rowCount,
				xAxisColumn: ds.xAxisColumn,
				xAxisId: ds.xAxisId,
			});
			expect(got.data).toHaveLength(ds.data.length);
			ds.data.forEach((col, c) => {
				const { data, ...colMeta } = col;
				const { data: gotData, ...gotColMeta } = got.data[c];
				expect(gotColMeta).toEqual(colMeta);
				expect(gotData).toBeInstanceOf(Float32Array);
				expect(bitsOf(gotData)).toEqual(bitsOf(data));
			});
		});
		// The bounds of an all-NaN column survive JSON.
		expect(back.datasets[0].data[3].bounds).toEqual({
			min: Infinity,
			max: -Infinity,
		});
	});

	it("gives every column its own buffer", async () => {
		const back = await decodeSession(
			bufferOf(await encodeSession(sampleContent())),
		);
		const buffers = back.datasets.flatMap((d) =>
			d.data.map((c) => c.data.buffer),
		);
		expect(new Set(buffers).size).toBe(buffers.length);
	});

	it("encodes column views without their surrounding buffer", async () => {
		const content = sampleContent();
		const big = new Float32Array([9, 8, 1, 2, 3, 4, 7]);
		content.datasets[0].data[0].data = big.subarray(2, 6);
		const back = await decodeSession(bufferOf(await encodeSession(content)));
		expect(Array.from(back.datasets[0].data[0].data)).toEqual([1, 2, 3, 4]);
	});

	it("names the file with the date and a .webgraphy extension", () => {
		expect(sessionFileName(new Date(2026, 9, 4, 8, 5))).toBe(
			"webgraphy-2026-10-04-0805.webgraphy",
		);
	});
});

describe("session validation", () => {
	const raw = async () => gunzip(await encodeSession(sampleContent()));
	const reason = async (bytes: Uint8Array) => {
		try {
			await decodeSession(bufferOf(bytes));
		} catch (err) {
			expect(err).toBeInstanceOf(SessionError);
			return (err as Error).message;
		}
		throw new Error("expected rejection");
	};

	it("also reads an uncompressed container", async () => {
		const back = await decodeSession(bufferOf(await raw()));
		expect(back.datasets).toHaveLength(2);
	});

	it("rejects a newer format version", async () => {
		const bytes = await raw();
		new DataView(bytes.buffer).setUint32(8, SESSION_FORMAT_VERSION + 1, true);
		expect(await reason(bytes)).toMatch(/newer version of WebGraphy/);
	});

	it("rejects version 0", async () => {
		const bytes = await raw();
		new DataView(bytes.buffer).setUint32(8, 0, true);
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects files that are not sessions", async () => {
		expect(await reason(new TextEncoder().encode("Time,Value\n1,2\n"))).toMatch(
			/not a WebGraphy session/,
		);
		expect(await reason(new Uint8Array(0))).toMatch(/not a WebGraphy session/);
	});

	it("rejects a truncated gzip stream", async () => {
		const file = await encodeSession(sampleContent());
		expect(await reason(file.subarray(0, file.length >> 1))).toMatch(/damaged/);
	});

	it("rejects a header that runs past the end", async () => {
		const bytes = await raw();
		new DataView(bytes.buffer).setUint32(12, bytes.length, true);
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects a header that is not JSON", async () => {
		const bytes = await raw();
		bytes[16] = 0x7b + 1;
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects a header failing the schema", async () => {
		const bytes = withHeader(await raw(), (h) => {
			(h.config as { series: unknown[] }).series[0] = { id: 1 };
		});
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects column data outside the file", async () => {
		const bytes = withHeader(await raw(), (h) => {
			const ds = (h.datasets as { columns: { length: number }[] }[])[0];
			ds.columns[0].length = 1e6;
		});
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects misaligned column offsets", async () => {
		const bytes = withHeader(await raw(), (h) => {
			const ds = (h.datasets as { columns: { offset: number }[] }[])[0];
			ds.columns[0].offset = 2;
		});
		expect(await reason(bytes)).toMatch(/damaged/);
	});

	it("rejects duplicate dataset ids and a missing x column", async () => {
		const dup = withHeader(await raw(), (h) => {
			const ds = h.datasets as { id: string }[];
			ds[1].id = ds[0].id;
		});
		expect(await reason(dup)).toMatch(/damaged/);
		const noX = withHeader(await raw(), (h) => {
			(h.datasets as { xAxisColumn: string }[])[0].xAxisColumn = "Nope";
		});
		expect(await reason(noX)).toMatch(/damaged/);
	});
});

describe("openSession", () => {
	const emptyState = () => ({
		datasets: [],
		series: [],
		xAxes: xAxes(),
		yAxes: yAxes(),
		legendVisible: true,
		crosshairVisible: true,
		isLoaded: true,
	});
	const sessionFile = async (content = sampleContent()) =>
		new File([bufferOf(await encodeSession(content))], "saved.webgraphy");
	const toasts = () => useNotificationStore.getState().notifications;

	beforeEach(() => {
		useGraphStore.setState(emptyState());
		clearHistory();
		useNotificationStore.setState({ notifications: [] });
		useSessionPrompt.setState({ prompt: null });
		vi.clearAllMocks();
	});

	it("loads into an empty workspace without asking", async () => {
		expect(await openSession(await sessionFile())).toBe(true);
		const s = useGraphStore.getState();
		expect(s.datasets.map((d) => d.id)).toEqual(["ds-1", "ds-1-sparse-avg-uuid"]);
		expect(s.series.map((x) => x.id)).toEqual(["s-1", "s-2"]);
		expect(s.xAxes[0]).toMatchObject({ min: 12.5, max: 99.25, name: "When" });
		expect(s.legendVisible).toBe(false);
		expect(useGraphHistory.getState().past.at(-1)?.label).toBe(
			"open session 'saved.webgraphy'",
		);
		expect(toasts().at(-1)).toMatchObject({ kind: "success" });
	});

	it("asks before replacing, and keeps the workspace on cancel", async () => {
		const existing = sampleContent().datasets[1];
		useGraphStore.setState({ datasets: [{ ...existing, id: "keep" }] });
		const opening = openSession(await sessionFile());
		await vi.waitFor(() =>
			expect(useSessionPrompt.getState().prompt).not.toBeNull(),
		);
		expect(useSessionPrompt.getState().prompt?.summary).toBe(
			"2 datasets, 2 series",
		);
		useSessionPrompt.getState().prompt?.resolve(false);
		expect(await opening).toBe(false);
		expect(useGraphStore.getState().datasets.map((d) => d.id)).toEqual(["keep"]);
		expect(useSessionPrompt.getState().prompt).toBeNull();
	});

	it("replaces as one undoable step", async () => {
		const existing = { ...sampleContent().datasets[1], id: "keep" };
		useGraphStore.setState({ datasets: [existing] });
		const opening = openSession(await sessionFile());
		await vi.waitFor(() =>
			expect(useSessionPrompt.getState().prompt).not.toBeNull(),
		);
		useSessionPrompt.getState().prompt?.resolve(true);
		expect(await opening).toBe(true);
		expect(useGraphStore.getState().datasets).toHaveLength(2);
		expect(persistence.deleteDataset).toHaveBeenCalledWith("keep");
		expect(persistence.saveDataset).toHaveBeenCalledTimes(2);

		useGraphStore.getState().undo();
		const s = useGraphStore.getState();
		expect(s.datasets).toEqual([existing]);
		expect(s.series).toEqual([]);
		expect(s.legendVisible).toBe(true);
	});

	it("reports a corrupt file and leaves the workspace alone", async () => {
		const before = useGraphStore.getState().datasets;
		const bad = new File(["nope"], "broken.webgraphy");
		expect(await openSession(bad)).toBe(false);
		expect(useGraphStore.getState().datasets).toBe(before);
		expect(toasts().at(-1)).toMatchObject({
			kind: "error",
			message: expect.stringContaining(
				'Could not open session "broken.webgraphy"',
			),
		});
		expect(useSessionPrompt.getState().prompt).toBeNull();
	});
});
