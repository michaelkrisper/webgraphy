import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "../../themes";
import { CanvasSizeError, exportImage, exportToPNG } from "../export";
import { embeddedFontCss, waitForFonts } from "../exportFonts";
import type { Dataset, SeriesConfig, YAxisConfig } from "../persistence";
import { PNG_1X1, physOf, readChunks } from "./pngFixture";

vi.mock("../exportFonts", () => ({
	embeddedFontCss: vi.fn(async () => "@font-face{font-family:Mock}"),
	waitForFonts: vi.fn(async () => {}),
}));

const dataset: Dataset = {
	id: "d",
	name: "D",
	columns: ["X", "Y"],
	rowCount: 2,
	xAxisColumn: "X",
	xAxisId: "axis-1",
	data: [
		{
			data: new Float32Array([0, 1]),
			bounds: { min: 0, max: 1 },
			isFloat64: false,
			refPoint: 0,
		},
		{
			data: new Float32Array([0, 1]),
			bounds: { min: 0, max: 1 },
			isFloat64: false,
			refPoint: 0,
		},
	],
};
const series: SeriesConfig[] = [
	{
		id: "s",
		sourceId: "d",
		name: "Signal",
		yColumn: "Y",
		yAxisId: "y1",
		pointStyle: "none",
		pointColor: "#000",
		lineStyle: "solid",
		lineColor: "#000",
	},
];
const yAxes: YAxisConfig[] = [
	{
		id: "y1",
		name: "",
		min: 0,
		max: 1,
		position: "left",
		color: "#000",
		showGrid: true,
	},
];
const plot = {
	datasets: [dataset],
	series,
	xAxes: [
		{
			id: "axis-1",
			name: "",
			min: 0,
			max: 1,
			showGrid: true,
			xMode: "numeric" as const,
		},
	],
	yAxes,
};

let ctx: {
	scale: ReturnType<typeof vi.fn>;
	fillRect: ReturnType<typeof vi.fn>;
	drawImage: ReturnType<typeof vi.fn>;
	measureText: ReturnType<typeof vi.fn>;
	fillStyle: string;
	font: string;
};
let canvas: {
	width: number;
	height: number;
	getContext: ReturnType<typeof vi.fn>;
	toDataURL: ReturnType<typeof vi.fn>;
	toBlob: ReturnType<typeof vi.fn>;
};
let blobs: Blob[];
let downloads: string[];

beforeEach(() => {
	ctx = {
		scale: vi.fn(),
		fillRect: vi.fn(),
		drawImage: vi.fn(),
		measureText: vi.fn(() => ({ width: 40 })),
		fillStyle: "",
		font: "",
	};
	canvas = {
		width: 0,
		height: 0,
		getContext: vi.fn(() => ctx),
		toDataURL: vi.fn(() => "data:image/png;base64,AA"),
		toBlob: vi.fn((cb: (b: Blob | null) => void) =>
			cb(new Blob(["png"], { type: "image/png" })),
		),
	};
	const create = document.createElement.bind(document);
	vi
		.spyOn(document, "createElement")
		.mockImplementation(((tag: string) =>
			tag === "canvas" ? canvas : create(tag)) as typeof document.createElement);
	class MockImage {
		onload: (() => void) | null = null;
		decode = vi.fn(async () => {});
		set src(_v: string) {
			setTimeout(() => this.onload?.(), 0);
		}
	}
	vi.stubGlobal("Image", MockImage);
	blobs = [];
	downloads = [];
	vi.stubGlobal("URL", {
		createObjectURL: vi.fn((b: Blob) => {
			blobs.push(b);
			return `blob:${blobs.length}`;
		}),
		revokeObjectURL: vi.fn(),
	});
	vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
		this: HTMLAnchorElement,
	) {
		downloads.push(this.download);
	});
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("exportToPNG", () => {
	it("rasterises at the requested pixel ratio", async () => {
		await exportToPNG(
			[dataset],
			series,
			plot.xAxes,
			yAxes,
			800,
			600,
			THEMES.light,
			{
				pixelRatio: 3,
			},
		);
		expect([canvas.width, canvas.height]).toEqual([2400, 1800]);
		expect(ctx.scale).toHaveBeenCalledWith(3, 3);
		expect(ctx.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 800, 600);
	});

	it("keeps the canvas transparent when asked", async () => {
		await exportToPNG([], [], [], [], 100, 100, THEMES.light, {
			pixelRatio: 1,
			transparent: true,
		});
		expect(ctx.fillRect).not.toHaveBeenCalled();
	});

	it("refuses a canvas beyond the browser limit without allocating it", async () => {
		await expect(
			exportToPNG([], [], [], [], 6000, 4000, THEMES.light, { pixelRatio: 3 }),
		).rejects.toThrow(CanvasSizeError);
		expect(canvas.getContext).not.toHaveBeenCalled();
	});
});

describe("exportImage", () => {
	it("downloads an SVG with fonts, legend and title", async () => {
		await exportImage(
			plot,
			{
				format: "svg",
				width: 640,
				height: 480,
				pixelRatio: 1,
				legend: "outside-right",
				title: "My <plot>",
			},
			THEMES.light,
		);
		expect(embeddedFontCss).toHaveBeenCalledWith(THEMES.light.fontFamily);
		expect(waitForFonts).toHaveBeenCalled();
		expect(downloads).toEqual(["webgraphy-export.svg"]);
		const svg = await blobs[0].text();
		expect(blobs[0].type).toBe("image/svg+xml");
		expect(svg).toContain("<style>@font-face{font-family:Mock}</style>");
		expect(svg).toContain(">My &lt;plot&gt;</text>");
		expect(svg).toContain(">Signal</text>");
	});

	it("downloads a PNG blob at the requested size", async () => {
		await exportImage(
			plot,
			{ format: "png", width: 500, height: 400, pixelRatio: 2 },
			THEMES.light,
		);
		expect([canvas.width, canvas.height]).toEqual([1000, 800]);
		expect(canvas.toBlob).toHaveBeenCalled();
		expect(downloads).toEqual(["webgraphy-export.png"]);
		expect(blobs.at(-1)?.type).toBe("image/png");
	});

	it.each([
		// 300 dpi millimetre export: pixelRatio = dpi / 96.
		[300 / 96, 11811],
		// Pixel export at 2×: tagged 192 dpi, so it opens at on-screen size.
		[2, 7559],
	])("tags the PNG with pHYs at pixel ratio %s", async (pixelRatio, ppm) => {
		canvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) =>
			cb(new Blob([PNG_1X1], { type: "image/png" })),
		);
		await exportImage(
			plot,
			{ format: "png", width: 100, height: 100, pixelRatio },
			THEMES.light,
		);
		const png = blobs.at(-1) as Blob;
		expect(png.type).toBe("image/png");
		const chunks = readChunks(new Uint8Array(await png.arrayBuffer()));
		expect(chunks[1].type).toBe("pHYs");
		expect(physOf(chunks[1])).toEqual({ x: ppm, y: ppm, unit: 1 });
	});

	it("fails fast with a size error before loading fonts", async () => {
		await expect(
			exportImage(
				plot,
				{ format: "png", width: 20000, height: 100, pixelRatio: 1 },
				THEMES.light,
			),
		).rejects.toMatchObject({
			name: "CanvasSizeError",
			message: expect.stringMatching(/16384 px per side/),
		});
		expect(embeddedFontCss).not.toHaveBeenCalled();
		expect(downloads).toEqual([]);
	});

	it("reports a canvas the browser could not encode", async () => {
		canvas.toBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));
		await expect(
			exportImage(
				plot,
				{ format: "png", width: 500, height: 400, pixelRatio: 1 },
				THEMES.light,
			),
		).rejects.toThrow(CanvasSizeError);
	});
});
