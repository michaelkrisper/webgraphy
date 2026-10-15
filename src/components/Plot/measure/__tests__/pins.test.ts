import { describe, expect, it } from "vitest";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../../services/persistence";
import type { SeriesMetadata } from "../../crosshair/types";
import { addPin, NO_PINS, type Pin, pinAtScreen, removePin } from "../pins";

const PADDING = { top: 10, right: 10, bottom: 10, left: 10 };
const WIDTH = 310;
const HEIGHT = 110;
const CHART_W = WIDTH - PADDING.left - PADDING.right;

function meta(
	x: Partial<XAxisConfig>,
	y: Partial<YAxisConfig>,
	xs: number[],
	ys: number[],
	refX = 0,
): SeriesMetadata {
	return {
		series: {
			id: "s1",
			name: "Temp",
			yColumn: "t",
			sourceId: "ds-1",
			yAxisId: "axis-1",
			lineColor: "#f00",
			lineStyle: "dashed",
			pointStyle: "circle",
		} as SeriesConfig,
		ds: { id: "ds-1" } as Dataset,
		axis: { id: "axis-1", min: 0, max: 100, ...y } as YAxisConfig,
		xAxis: {
			id: "axis-1",
			min: 0,
			max: 10,
			xMode: "numeric",
			...x,
		} as XAxisConfig,
		xIdx: 0,
		yIdx: 1,
		xCol: { data: Float32Array.from(xs), refPoint: refX },
		yCol: { data: Float32Array.from(ys), refPoint: 0 },
	};
}

const at = (
	sx: number,
	metadata: SeriesMetadata[],
	liveX: Record<string, { min: number; max: number }> = {},
) =>
	pinAtScreen(
		{ x: sx, y: 50 },
		metadata,
		liveX,
		{},
		{ "axis-1": "Time" },
		WIDTH,
		HEIGHT,
		PADDING,
	);

describe("pinAtScreen", () => {
	it("inverts a linear x axis and snaps to the nearest sample", () => {
		const m = meta({}, {}, [0, 2, 4, 6, 8, 10], [0, 20, 40, 60, 80, 100]);
		// 3.4 on a 0..10 axis: nearest sample is x = 4.
		const pin = at(PADDING.left + 0.34 * CHART_W, [m]);
		expect(pin?.x).toBe(4);
		expect(pin?.xAxisId).toBe("axis-1");
		expect(pin?.points).toHaveLength(1);
		expect(pin?.points[0]).toMatchObject({
			seriesId: "s1",
			label: "Temp",
			x: 4,
			y: 40,
			xLabel: "4",
			lineStyle: "dashed",
		});
	});

	it("inverts a log x axis in log space", () => {
		const m = meta(
			{ min: 1, max: 1000, scale: "log" },
			{ min: 1, max: 1000, scale: "log" },
			[1, 10, 100, 1000],
			[1, 10, 100, 1000],
		);
		// One third of the way across 1..1000 (log) is x = 10; on a linear
		// mapping it would be ~334, whose nearest sample is 100.
		const pin = at(PADDING.left + CHART_W / 3 + 2, [m]);
		expect(pin?.x).toBe(10);
		expect(pin?.points[0].y).toBe(10);
		// 40 is nearer 10 by value but nearer 100 in log space.
		const pin2 = at(PADDING.left + (Math.log10(40) / 3) * CHART_W, [m]);
		expect(pin2?.x).toBe(100);
	});

	it("uses the live axis range over the committed one", () => {
		const m = meta({}, {}, [0, 2, 4, 6, 8, 10], [0, 20, 40, 60, 80, 100]);
		// Committed 0..10 would give x = 0; the live range 8..10 puts the
		// left edge at 8.
		const pin = at(PADDING.left + 1, [m], { "axis-1": { min: 8, max: 10 } });
		expect(pin?.x).toBe(8);
	});

	it("keeps the full value of offset (refPoint) columns", () => {
		const ref = 1_700_000_000;
		const m = meta(
			{ min: ref, max: ref + 10, xMode: "date" },
			{},
			[0, 5, 10],
			[1, 2, 3],
			ref,
		);
		const pin = at(PADDING.left + CHART_W / 2, [m]);
		expect(pin?.x).toBe(ref + 5);
	});

	it("returns null without series", () => {
		expect(at(100, [])).toBeNull();
	});
});

describe("addPin / removePin", () => {
	const pin = (x: number): Pin => ({ xAxisId: "axis-1", x, points: [] });

	it("sets A first, then B, and later clicks move B", () => {
		const one = addPin(NO_PINS, pin(1));
		expect(one).toEqual({ a: pin(1), b: null });
		const two = addPin(one, pin(2));
		expect(two).toEqual({ a: pin(1), b: pin(2) });
		expect(addPin(two, pin(3))).toEqual({ a: pin(1), b: pin(3) });
	});

	it("promotes B when A is removed", () => {
		const both = { a: pin(1), b: pin(2) };
		expect(removePin(both, "a")).toEqual({ a: pin(2), b: null });
		expect(removePin(both, "b")).toEqual({ a: pin(1), b: null });
	});
});
