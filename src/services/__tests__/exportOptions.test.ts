import { describe, expect, it } from "vitest";
import {
	buildExportRequest,
	canvasLimitError,
	DEFAULT_EXPORT_OPTIONS,
	effectiveUnit,
	type ImageExportOptions,
	loadExportOptions,
	MAX_CANVAS_SIDE,
	mmToPx,
	resolveExportSize,
	saveExportOptions,
	validateExportOptions,
} from "../exportOptions";

const memoryStorage = () => {
	const data = new Map<string, string>();
	return {
		getItem: (k: string) => data.get(k) ?? null,
		setItem: (k: string, v: string) => void data.set(k, v),
		data,
	};
};

const opts = (o: Partial<ImageExportOptions> = {}): ImageExportOptions => ({
	...DEFAULT_EXPORT_OPTIONS,
	...o,
});
const view = { width: 900, height: 600 };

describe("export option persistence", () => {
	it("returns the defaults when nothing is stored", () => {
		expect(loadExportOptions(memoryStorage())).toEqual(DEFAULT_EXPORT_OPTIONS);
	});

	it("round-trips the last used options", () => {
		const storage = memoryStorage();
		const chosen = opts({
			format: "svg",
			preset: "custom",
			customWidth: 170,
			customHeight: 90,
			customUnit: "mm",
			dpi: 600,
			scale: 3,
			legend: false,
			legendPosition: "outside-right",
			title: "Run 7",
			transparent: true,
		});
		saveExportOptions(chosen, storage);
		expect(loadExportOptions(storage)).toEqual(chosen);
	});

	it("falls back field by field on invalid stored values", () => {
		const storage = memoryStorage();
		storage.setItem(
			"webgraphy-export-options",
			JSON.stringify({
				format: "gif",
				preset: "1920x1080",
				scale: 5,
				dpi: 5,
				customWidth: "wide",
				legendPosition: "center",
				title: 42,
				transparent: true,
			}),
		);
		expect(loadExportOptions(storage)).toEqual(
			opts({ preset: "1920x1080", transparent: true }),
		);
	});

	it("survives corrupt JSON and a throwing storage", () => {
		const storage = memoryStorage();
		storage.setItem("webgraphy-export-options", "{nope");
		expect(loadExportOptions(storage)).toEqual(DEFAULT_EXPORT_OPTIONS);
		const throwing = {
			getItem: () => {
				throw new Error("denied");
			},
			setItem: () => {
				throw new Error("quota");
			},
		};
		expect(loadExportOptions(throwing)).toEqual(DEFAULT_EXPORT_OPTIONS);
		expect(() =>
			saveExportOptions(DEFAULT_EXPORT_OPTIONS, throwing),
		).not.toThrow();
	});

	it("uses localStorage by default", () => {
		saveExportOptions(opts({ title: "stored" }));
		expect(loadExportOptions().title).toBe("stored");
		localStorage.removeItem("webgraphy-export-options");
	});
});

describe("export size math", () => {
	it("converts millimetres at a dpi", () => {
		expect(mmToPx(25.4, 300)).toBe(300);
		expect(mmToPx(85, 96)).toBeCloseTo(321.26, 2);
	});

	it("uses the on-screen size for the current view, times the scale", () => {
		expect(resolveExportSize(opts({ preset: "view", scale: 2 }), view)).toEqual({
			width: 900,
			height: 600,
			pixelWidth: 1800,
			pixelHeight: 1200,
			pixelRatio: 2,
		});
	});

	it("resolves a pixel preset", () => {
		const s = resolveExportSize(opts({ preset: "1920x1080", scale: 1 }), view);
		expect([s.width, s.height, s.pixelWidth, s.pixelHeight]).toEqual([
			1920, 1080, 1920, 1080,
		]);
		expect(s.physical).toBeUndefined();
	});

	it("lays a journal column out at 96 dpi and rasterises at the chosen dpi", () => {
		const s = resolveExportSize(
			opts({ preset: "journal-single", dpi: 300, scale: 3 }),
			view,
		);
		expect(s.width).toBeCloseTo(321.26, 2);
		expect(s.height).toBeCloseTo(241.89, 2);
		// 85 mm × 64 mm at 300 dpi; the px scale factor does not apply.
		expect(s.pixelWidth).toBe(1004);
		expect(s.pixelHeight).toBe(756);
		expect(s.pixelRatio).toBeCloseTo(3.125);
		expect(s.physical).toEqual({ widthMm: 85, heightMm: 64 });
		expect(Math.round(s.width * s.pixelRatio)).toBe(s.pixelWidth);
	});

	it("resolves the double column preset", () => {
		const s = resolveExportSize(
			opts({ preset: "journal-double", dpi: 600 }),
			view,
		);
		expect(s.pixelWidth).toBe(Math.round((178 / 25.4) * 600));
		expect(s.physical).toEqual({ widthMm: 178, heightMm: 110 });
	});

	it("resolves custom sizes in px and mm", () => {
		const px = resolveExportSize(
			opts({ preset: "custom", customWidth: 640.4, customHeight: 480, scale: 2 }),
			view,
		);
		expect([px.width, px.pixelWidth]).toEqual([640, 1280]);
		const mm = resolveExportSize(
			opts({
				preset: "custom",
				customUnit: "mm",
				customWidth: 50.8,
				customHeight: 25.4,
				dpi: 150,
			}),
			view,
		);
		expect([mm.pixelWidth, mm.pixelHeight]).toEqual([300, 150]);
		expect([mm.width, mm.height]).toEqual([192, 96]);
	});

	it("reports the unit a preset is given in", () => {
		expect(effectiveUnit(opts({ preset: "view" }))).toBe("px");
		expect(effectiveUnit(opts({ preset: "journal-double" }))).toBe("mm");
		expect(effectiveUnit(opts({ preset: "custom", customUnit: "mm" }))).toBe(
			"mm",
		);
	});
});

describe("canvas limits", () => {
	it("allows sizes within the limits", () => {
		expect(canvasLimitError(MAX_CANVAS_SIDE, MAX_CANVAS_SIDE)).toBeNull();
	});

	it("rejects a side beyond the limit", () => {
		expect(canvasLimitError(MAX_CANVAS_SIDE + 1, 10)).toMatch(
			/16384 px per side/,
		);
	});

	it("rejects an area beyond the limit", () => {
		expect(
			canvasLimitError(3000, 3000, { maxSide: 32767, maxArea: 8_000_000 }),
		).toMatch(/3000 × 3000 px exceeds the browser limit of 8 megapixels/);
	});
});

describe("validateExportOptions", () => {
	it("accepts the defaults", () => {
		expect(validateExportOptions(DEFAULT_EXPORT_OPTIONS, view)).toBeNull();
	});

	it("rejects custom sizes below the minimum or not numbers", () => {
		expect(
			validateExportOptions(opts({ preset: "custom", customWidth: 20 }), view),
		).toMatch(/at least 100 px/);
		expect(
			validateExportOptions(
				opts({ preset: "custom", customUnit: "mm", customHeight: Number.NaN }),
				view,
			),
		).toMatch(/at least 20 mm/);
	});

	it("checks the dpi only where it applies", () => {
		const bad = { dpi: 10, preset: "journal-single" as const };
		expect(validateExportOptions(opts({ ...bad, format: "png" }), view)).toMatch(
			/between 72 and 1200 dpi/,
		);
		expect(
			validateExportOptions(opts({ ...bad, format: "svg" }), view),
		).toBeNull();
	});

	it("flags a PNG past the canvas limit but not the same SVG", () => {
		const huge = opts({
			preset: "custom",
			customWidth: 8000,
			customHeight: 6000,
			scale: 3,
		});
		expect(validateExportOptions({ ...huge, format: "png" }, view)).toMatch(
			/Image too large: 24000 × 18000 px/,
		);
		expect(validateExportOptions({ ...huge, format: "svg" }, view)).toBeNull();
	});
});

describe("buildExportRequest", () => {
	it("carries size, legend, title and background", () => {
		expect(
			buildExportRequest(
				opts({
					format: "png",
					preset: "1200x800",
					scale: 3,
					legendPosition: "bottom-left",
					title: "  Title  ",
					transparent: true,
				}),
				view,
			),
		).toEqual({
			format: "png",
			width: 1200,
			height: 800,
			pixelRatio: 3,
			physical: undefined,
			title: "Title",
			legend: "bottom-left",
			transparent: true,
		});
	});

	it("leaves the legend out when it is switched off", () => {
		expect(buildExportRequest(opts({ legend: false }), view).legend).toBeNull();
	});
});
