import { beforeEach, describe, expect, it, vi } from "vitest";
import { drawCanvas } from "../drawCanvas";
import type { SnapGroup, SnapResult } from "../types";

/**
 * jsdom has no 2D canvas implementation, so the context is mocked and the
 * assertions are about the sequence of drawing calls. That is enough to pin
 * the parts that actually go wrong: markers leaking into the axis gutters,
 * and the wrong glyph being drawn for a point style.
 */

const PADDING = { top: 10, right: 10, bottom: 10, left: 10 };
const WIDTH = 200;
const HEIGHT = 100;

function makeCtx() {
	return {
		clearRect: vi.fn(),
		save: vi.fn(),
		restore: vi.fn(),
		scale: vi.fn(),
		beginPath: vi.fn(),
		moveTo: vi.fn(),
		lineTo: vi.fn(),
		stroke: vi.fn(),
		fill: vi.fn(),
		arc: vi.fn(),
		fillRect: vi.fn(),
		strokeRect: vi.fn(),
		setLineDash: vi.fn(),
		strokeStyle: "",
		fillStyle: "",
		lineWidth: 0,
	};
}

let ctx: ReturnType<typeof makeCtx>;
let canvas: HTMLCanvasElement;

const item = (over: Partial<SnapGroup["items"][number]> = {}) => ({
	label: "Temp",
	value: 5,
	color: "#ff0000",
	xScreen: 100,
	yScreen: 50,
	pointStyle: "circle",
	...over,
});

const snapWith = (...items: SnapGroup["items"]): SnapResult => ({
	snapScreenX: 100,
	entries: [{ xLabel: "5", xAxisName: "Time", items }],
});

const draw = (over: Record<string, unknown> = {}) =>
	drawCanvas({
		canvas,
		snap: snapWith(item()),
		pos: { x: 100, y: 50 },
		isPanning: false,
		snapLineColor: "#999999",
		padding: PADDING,
		width: WIDTH,
		height: HEIGHT,
		plotBg: "#ffffff",
		...over,
	});

beforeEach(() => {
	ctx = makeCtx();
	canvas = {
		width: WIDTH,
		height: HEIGHT,
		getContext: vi.fn().mockReturnValue(ctx),
	} as unknown as HTMLCanvasElement;
});

describe("drawCanvas", () => {
	it("does nothing without a canvas", () => {
		expect(() => draw({ canvas: null })).not.toThrow();
	});

	it("does nothing when the 2D context is unavailable", () => {
		canvas = {
			width: WIDTH,
			height: HEIGHT,
			getContext: vi.fn().mockReturnValue(null),
		} as unknown as HTMLCanvasElement;

		draw();

		expect(ctx.clearRect).not.toHaveBeenCalled();
	});

	it("clears without drawing when there is nothing to show", () => {
		for (const over of [
			{ snap: null },
			{ pos: null },
			{ isPanning: true },
		] as const) {
			ctx = makeCtx();
			canvas = {
				width: WIDTH,
				height: HEIGHT,
				getContext: vi.fn().mockReturnValue(ctx),
			} as unknown as HTMLCanvasElement;

			draw(over);

			// The previous frame must still be wiped, otherwise a stale
			// crosshair stays on screen during a pan.
			expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, WIDTH, HEIGHT);
			expect(ctx.save).not.toHaveBeenCalled();
		}
	});

	it("draws the dashed snap line down the plot area", () => {
		draw();

		expect(ctx.setLineDash).toHaveBeenCalledWith([3, 3]);
		expect(ctx.moveTo).toHaveBeenCalledWith(100, PADDING.top);
		expect(ctx.lineTo).toHaveBeenCalledWith(100, HEIGHT - PADDING.bottom);
		// Dashing is reset before the markers so they are drawn solid.
		expect(ctx.setLineDash).toHaveBeenLastCalledWith([]);
		expect(ctx.restore).toHaveBeenCalled();
	});

	it("scales by the device pixel ratio", () => {
		const original = window.devicePixelRatio;
		Object.defineProperty(window, "devicePixelRatio", {
			value: 2,
			configurable: true,
		});

		draw();

		expect(ctx.scale).toHaveBeenCalledWith(2, 2);
		Object.defineProperty(window, "devicePixelRatio", {
			value: original,
			configurable: true,
		});
	});

	it("draws a circle marker by default", () => {
		draw();

		expect(ctx.arc).toHaveBeenCalledTimes(2);
		// Halo first, then the smaller coloured glyph on top.
		expect(ctx.arc.mock.calls[0][2]).toBeGreaterThan(ctx.arc.mock.calls[1][2]);
		expect(ctx.fillRect).not.toHaveBeenCalled();
	});

	it("draws a square marker for the square point style", () => {
		draw({ snap: snapWith(item({ pointStyle: "square" })) });

		expect(ctx.fillRect).toHaveBeenCalledTimes(2);
		expect(ctx.strokeRect).toHaveBeenCalledTimes(1);
		expect(ctx.arc).not.toHaveBeenCalled();
	});

	it("draws two strokes for the cross point style", () => {
		draw({ snap: snapWith(item({ pointStyle: "cross" })) });

		expect(ctx.arc).not.toHaveBeenCalled();
		expect(ctx.fillRect).not.toHaveBeenCalled();
		// Halo pass plus coloured pass, four line segments in total.
		expect(ctx.moveTo.mock.calls.length).toBeGreaterThanOrEqual(5);
	});

	it("skips markers that fall outside the plot area", () => {
		// One marker per gutter — all four must be dropped so they cannot draw
		// over the axis labels.
		const outside = snapWith(
			item({ yScreen: PADDING.top - 1 }),
			item({ yScreen: HEIGHT - PADDING.bottom + 1 }),
			item({ xScreen: PADDING.left - 1 }),
			item({ xScreen: WIDTH - PADDING.right + 1 }),
		);

		draw({ snap: outside });

		expect(ctx.arc).not.toHaveBeenCalled();
	});

	it("still draws markers exactly on the plot boundary", () => {
		draw({ snap: snapWith(item({ yScreen: PADDING.top })) });
		expect(ctx.arc).toHaveBeenCalled();
	});

	it("draws every item of every group", () => {
		const twoGroups: SnapResult = {
			snapScreenX: 100,
			entries: [
				{ xLabel: "5", xAxisName: "Time", items: [item(), item()] },
				{ xLabel: "7", xAxisName: "Distance", items: [item()] },
			],
		};

		draw({ snap: twoGroups });

		// Three circle markers, two arcs each.
		expect(ctx.arc).toHaveBeenCalledTimes(6);
	});
});
