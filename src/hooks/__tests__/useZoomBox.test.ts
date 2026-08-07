import { renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
	isInsidePlot,
	isZoomBoxUsable,
	MIN_ZOOM_BOX_PX,
	normalizeZoomBox,
	useZoomBox,
} from "../useZoomBox";

/**
 * The zoom rectangle used to live as three refs plus an inline DOM writer
 * inside usePanZoom, reachable only by driving window events. Owning it here
 * makes the geometry directly checkable — including the drag-backwards and
 * too-small-to-count cases, which are easy to get wrong and invisible until a
 * user's viewport jumps somewhere unexpected.
 */

const bounds = {
	width: 400,
	height: 300,
	padding: { top: 10, right: 20, bottom: 30, left: 40 },
};

describe("normalizeZoomBox", () => {
	it("orders the corners for a forward drag", () => {
		expect(
			normalizeZoomBox({ startX: 10, startY: 20, endX: 100, endY: 200 }),
		).toEqual({ minX: 10, maxX: 100, minY: 20, maxY: 200 });
	});

	it("orders the corners for a drag up and to the left", () => {
		// Dragging back towards the origin must produce the same rectangle.
		expect(
			normalizeZoomBox({ startX: 100, startY: 200, endX: 10, endY: 20 }),
		).toEqual({ minX: 10, maxX: 100, minY: 20, maxY: 200 });
	});
});

describe("isZoomBoxUsable", () => {
	it("accepts a deliberate drag", () => {
		expect(isZoomBoxUsable({ startX: 0, startY: 0, endX: 50, endY: 50 })).toBe(
			true,
		);
	});

	it("rejects a stray click", () => {
		expect(isZoomBoxUsable({ startX: 7, startY: 7, endX: 7, endY: 7 })).toBe(
			false,
		);
	});

	it("rejects a drag that is thin in only one axis", () => {
		// A horizontal smear would otherwise zoom y to nothing.
		expect(isZoomBoxUsable({ startX: 0, startY: 0, endX: 100, endY: 2 })).toBe(
			false,
		);
	});

	it("requires strictly more than the minimum in both axes", () => {
		const exactly = MIN_ZOOM_BOX_PX;
		expect(
			isZoomBoxUsable({ startX: 0, startY: 0, endX: exactly, endY: exactly }),
		).toBe(false);
		expect(
			isZoomBoxUsable({
				startX: 0,
				startY: 0,
				endX: exactly + 1,
				endY: exactly + 1,
			}),
		).toBe(true);
	});
});

describe("isInsidePlot", () => {
	it("accepts a point in the plot area", () => {
		expect(isInsidePlot(200, 150, bounds)).toBe(true);
	});

	it("rejects points in the gutters", () => {
		expect(isInsidePlot(5, 150, bounds)).toBe(false); // left
		expect(isInsidePlot(395, 150, bounds)).toBe(false); // right
		expect(isInsidePlot(200, 5, bounds)).toBe(false); // top
		expect(isInsidePlot(200, 295, bounds)).toBe(false); // bottom
	});

	it("accepts the boundary itself", () => {
		expect(isInsidePlot(bounds.padding.left, bounds.padding.top, bounds)).toBe(
			true,
		);
	});
});

describe("useZoomBox", () => {
	function setup() {
		const { result } = renderHook(() => useZoomBox());
		const rect = document.createElementNS("http://www.w3.org/2000/svg", "rect");
		result.current.rectRef.current = rect;
		return { box: result.current, rect };
	}

	const attrs = (rect: SVGRectElement) => ({
		x: rect.getAttribute("x"),
		y: rect.getAttribute("y"),
		width: rect.getAttribute("width"),
		height: rect.getAttribute("height"),
	});

	it("starts inactive", () => {
		const { box } = setup();
		expect(box.isDragging()).toBe(false);
		expect(box.end()).toBeNull();
	});

	it("refuses to start a drag outside the plot", () => {
		const { box } = setup();
		// Ctrl-dragging on an axis gutter must not open a zoom rectangle.
		expect(box.begin(5, 150, bounds)).toBe(false);
		expect(box.isDragging()).toBe(false);
	});

	it("starts a drag inside the plot and paints a zero-size rectangle", () => {
		const { box, rect } = setup();

		expect(box.begin(100, 100, bounds)).toBe(true);
		expect(box.isDragging()).toBe(true);
		expect(attrs(rect)).toEqual({
			x: "100",
			y: "100",
			width: "0",
			height: "0",
		});
	});

	it("paints the rectangle as it is dragged", () => {
		const { box, rect } = setup();
		box.begin(100, 100, bounds);

		box.dragTo(200, 180, bounds);

		expect(attrs(rect)).toEqual({
			x: "100",
			y: "100",
			width: "100",
			height: "80",
		});
	});

	it("paints correctly when dragged back past the origin", () => {
		const { box, rect } = setup();
		box.begin(200, 200, bounds);

		box.dragTo(120, 150, bounds);

		// SVG rects cannot have negative width; the corners must be ordered.
		expect(attrs(rect)).toEqual({
			x: "120",
			y: "150",
			width: "80",
			height: "50",
		});
	});

	it("clamps the drag to the plot area", () => {
		const { box, rect } = setup();
		box.begin(100, 100, bounds);

		box.dragTo(10_000, 10_000, bounds);

		// Right edge is width - padding.right = 380, bottom is 300 - 30 = 270.
		expect(attrs(rect)).toEqual({
			x: "100",
			y: "100",
			width: "280",
			height: "170",
		});
	});

	it("ignores a drag that was never started", () => {
		const { box, rect } = setup();
		box.dragTo(200, 200, bounds);
		expect(attrs(rect).width).toBeNull();
	});

	it("returns normalised bounds when the drag ends", () => {
		const { box } = setup();
		box.begin(200, 200, bounds);
		box.dragTo(120, 150, bounds);

		expect(box.end()).toEqual({ minX: 120, maxX: 200, minY: 150, maxY: 200 });
		expect(box.isDragging()).toBe(false);
	});

	it("returns null for a drag too small to be deliberate", () => {
		const { box } = setup();
		box.begin(100, 100, bounds);
		box.dragTo(102, 102, bounds);

		// The caller still needs isDragging() to have been true, so it can clear
		// its zooming flag without moving the viewport.
		expect(box.isDragging()).toBe(true);
		expect(box.end()).toBeNull();
		expect(box.isDragging()).toBe(false);
	});

	it("survives a missing rect element", () => {
		const { result } = renderHook(() => useZoomBox());
		// The overlay is only mounted while zooming; the refs can be null.
		expect(() => {
			result.current.begin(100, 100, bounds);
			result.current.dragTo(200, 200, bounds);
		}).not.toThrow();
		expect(result.current.end()).toEqual({
			minX: 100,
			maxX: 200,
			minY: 100,
			maxY: 200,
		});
	});
});
