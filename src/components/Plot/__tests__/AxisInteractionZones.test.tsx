import React from "react";
import { render, fireEvent, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { XAxisInteractionZones, YAxisInteractionZones } from "../AxisInteractionZones";
import { useGraphStore } from "../../../store/useGraphStore";

vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: {
		getState: vi.fn(),
	},
}));

describe("XAxisInteractionZones", () => {
	const defaultProps = {
		xAxesMetrics: [
			{
				id: "x1",
				cumulativeOffset: 0,
				height: 50,
				titleBottom: 40,
				labelBottom: 10,
				secLabelBottom: 25,
				total: 50,
			},
		],
		xAxesLayout: [{ id: "x1", title: "Test X Axis" } as any],
		padding: { top: 10, right: 20, bottom: 30, left: 40 },
		editingXAxisId: null,
		setEditingXAxisId: vi.fn(),
		themeColors: {
			fontFamily: "sans-serif",
			labelColor: "#000",
			plotBg: "#fff",
			gridColor: "#ccc",
		},
		onWheel: vi.fn(),
		onMouseDown: vi.fn(),
		onTouchStart: vi.fn(),
		onAutoScaleX: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders X axis interaction zones", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		expect(screen.getByRole("region", { name: "X-Axis x1 interaction area" })).toBeInTheDocument();
	});

	it("calls onWheel when wheel event occurs", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "X-Axis x1 interaction area" });
		fireEvent.wheel(zone);
		expect(defaultProps.onWheel).toHaveBeenCalledTimes(1);
		expect(defaultProps.onWheel).toHaveBeenCalledWith(expect.any(Object), { xAxisId: "x1" });
	});

	it("calls onMouseDown when mouse down event occurs", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "X-Axis x1 interaction area" });
		fireEvent.mouseDown(zone);
		expect(defaultProps.onMouseDown).toHaveBeenCalledTimes(1);
		expect(defaultProps.onMouseDown).toHaveBeenCalledWith(expect.any(Object), { xAxisId: "x1" });
	});

	it("calls onTouchStart when touch start event occurs", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "X-Axis x1 interaction area" });
		fireEvent.touchStart(zone);
		expect(defaultProps.onTouchStart).toHaveBeenCalledTimes(1);
		expect(defaultProps.onTouchStart).toHaveBeenCalledWith(expect.any(Object), { xAxisId: "x1" });
	});

	it("calls setEditingXAxisId when double clicking title area", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "X-Axis x1 interaction area" });

		// titleBottom is 40. Bottom 30px is title area.
		// So yInside >= 40 - 30 = 10.
		// getBoundingClientRect returns top=0 by default in JSDOM
		// e.clientY = 15 -> yInside = 15 (>= 10, should edit title)
		fireEvent.doubleClick(zone, { clientY: 15 });
		expect(defaultProps.setEditingXAxisId).toHaveBeenCalledWith("x1");
		expect(defaultProps.onAutoScaleX).not.toHaveBeenCalled();
	});

	it("calls onAutoScaleX when double clicking outside title area", () => {
		render(<XAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "X-Axis x1 interaction area" });

		// yInside < 10 (e.g., 5) should trigger auto scale
		fireEvent.doubleClick(zone, { clientY: 5 });
		expect(defaultProps.onAutoScaleX).toHaveBeenCalledWith("x1");
		expect(defaultProps.setEditingXAxisId).not.toHaveBeenCalled();
	});

	it("renders input when editingXAxisId matches", () => {
		render(<XAxisInteractionZones {...defaultProps} editingXAxisId="x1" />);
		const input = screen.getByDisplayValue("Test X Axis");
		expect(input).toBeInTheDocument();
	});

	it("updates X axis name on input blur", () => {
		const updateXAxisMock = vi.fn();
		(useGraphStore.getState as any).mockReturnValue({
			updateXAxis: updateXAxisMock,
		});

		render(<XAxisInteractionZones {...defaultProps} editingXAxisId="x1" />);
		const input = screen.getByDisplayValue("Test X Axis");

		fireEvent.change(input, { target: { value: "New X Axis Title" } });
		fireEvent.blur(input);

		expect(updateXAxisMock).toHaveBeenCalledWith("x1", { name: "New X Axis Title" });
		expect(defaultProps.setEditingXAxisId).toHaveBeenCalledWith(null);
	});

	it("cancels editing on Escape key", () => {
		render(<XAxisInteractionZones {...defaultProps} editingXAxisId="x1" />);
		const input = screen.getByDisplayValue("Test X Axis");

		fireEvent.keyDown(input, { key: "Escape" });
		expect(defaultProps.setEditingXAxisId).toHaveBeenCalledWith(null);
	});

	it("blurs input on Enter key", () => {
		render(<XAxisInteractionZones {...defaultProps} editingXAxisId="x1" />);
		const input = screen.getByDisplayValue("Test X Axis");

		const blurSpy = vi.spyOn(input, 'blur');
		fireEvent.keyDown(input, { key: "Enter" });

		expect(blurSpy).toHaveBeenCalled();
	});
});

describe("YAxisInteractionZones", () => {
	const defaultProps = {
		axes: [
			{ id: "y1", position: "left" as const },
			{ id: "y2", position: "right" as const },
		],
		axisLayout: {
			y1: { total: 40, label: 30 },
			y2: { total: 50, label: 40 },
		},
		leftOffsets: { y1: 0 },
		rightOffsets: { y2: 0 },
		padding: { top: 10, right: 20, bottom: 30, left: 40 },
		width: 800,
		containerRef: { current: { getBoundingClientRect: () => ({ top: 100 }) } } as any,
		onWheel: vi.fn(),
		onMouseDown: vi.fn(),
		onTouchStart: vi.fn(),
		onAutoScaleY: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("renders Y axis interaction zones", () => {
		render(<YAxisInteractionZones {...defaultProps} />);
		expect(screen.getByRole("region", { name: "Y-Axis y1 interaction area" })).toBeInTheDocument();
		expect(screen.getByRole("region", { name: "Y-Axis y2 interaction area" })).toBeInTheDocument();
	});

	it("calls onWheel when wheel event occurs", () => {
		render(<YAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y1 interaction area" });
		fireEvent.wheel(zone);
		expect(defaultProps.onWheel).toHaveBeenCalledTimes(1);
		expect(defaultProps.onWheel).toHaveBeenCalledWith(expect.any(Object), { yAxisId: "y1" });
	});

	it("calls onMouseDown when mouse down event occurs", () => {
		render(<YAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y1 interaction area" });
		fireEvent.mouseDown(zone);
		expect(defaultProps.onMouseDown).toHaveBeenCalledTimes(1);
		expect(defaultProps.onMouseDown).toHaveBeenCalledWith(expect.any(Object), { yAxisId: "y1" });
	});

	it("calls onTouchStart when touch start event occurs", () => {
		render(<YAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y1 interaction area" });
		fireEvent.touchStart(zone);
		expect(defaultProps.onTouchStart).toHaveBeenCalledTimes(1);
		expect(defaultProps.onTouchStart).toHaveBeenCalledWith(expect.any(Object), { yAxisId: "y1" });
	});

	it("calls onAutoScaleY when double clicking", () => {
		render(<YAxisInteractionZones {...defaultProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y1 interaction area" });

		// clientY = 150, container top = 100 -> mouseY = 50
		fireEvent.doubleClick(zone, { clientY: 150 });
		expect(defaultProps.onAutoScaleY).toHaveBeenCalledWith("y1", 50);
	});

	it("falls back to default total width when axisLayout[a.id] is missing", () => {
		const customProps = {
			...defaultProps,
			axes: [{ id: "y3", position: "left" as const }],
			axisLayout: {}, // missing y3
			leftOffsets: { y3: 5 },
		};
		render(<YAxisInteractionZones {...customProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y3 interaction area" });
		// xP = padding.left (40) - leftOffsets[a.id] (5) - am.total (40 default) = -5
		expect(zone).toHaveStyle({ left: "-5px" });
	});

	it("falls back to 0 when leftOffsets[a.id] is missing", () => {
		const customProps = {
			...defaultProps,
			axes: [{ id: "y4", position: "left" as const }],
			axisLayout: { y4: { total: 20, label: 10 } },
			leftOffsets: {}, // missing y4
		};
		render(<YAxisInteractionZones {...customProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y4 interaction area" });
		// xP = padding.left (40) - leftOffsets (0) - total (20) = 20
		expect(zone).toHaveStyle({ left: "20px" });
	});

	it("falls back to 0 when rightOffsets[a.id] is missing for right-positioned axis", () => {
		const customProps = {
			...defaultProps,
			axes: [{ id: "y5", position: "right" as const }],
			axisLayout: { y5: { total: 30, label: 15 } },
			rightOffsets: {}, // missing y5
		};
		render(<YAxisInteractionZones {...customProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y5 interaction area" });
		// xP = width (800) - padding.right (20) + rightOffsets (0) = 780
		expect(zone).toHaveStyle({ left: "780px" });
	});

	it("handles auto-scale when containerRef is null", () => {
		const customProps = {
			...defaultProps,
			containerRef: { current: null },
		};
		render(<YAxisInteractionZones {...customProps} />);
		const zone = screen.getByRole("region", { name: "Y-Axis y1 interaction area" });
		fireEvent.doubleClick(zone, { clientY: 150 });
		expect(customProps.onAutoScaleY).toHaveBeenCalledWith("y1", undefined);
	});
});

describe("XAxisInteractionZones additional branches", () => {
	const defaultProps = {
		xAxesMetrics: [
			{
				id: "x2",
				cumulativeOffset: 0,
				height: 50,
				titleBottom: 40,
				labelBottom: 10,
				secLabelBottom: 25,
				total: 50,
			},
		],
		xAxesLayout: [{ id: "x1", title: "Should Not Find Me" } as any],
		padding: { top: 10, right: 20, bottom: 30, left: 40 },
		editingXAxisId: null,
		setEditingXAxisId: vi.fn(),
		themeColors: {
			fontFamily: "sans-serif",
			labelColor: "#000",
			plotBg: "#fff",
			gridColor: "#ccc",
		},
		onWheel: vi.fn(),
		onMouseDown: vi.fn(),
		onTouchStart: vi.fn(),
		onAutoScaleX: vi.fn(),
	};

	it("falls back to empty string when title is undefined", () => {
		// xAxesLayout does not have x2, so title fallback "" should hit
		const customProps = {
			...defaultProps,
			editingXAxisId: "x2",
		};
		render(<XAxisInteractionZones {...customProps} />);
		const input = screen.getByRole("textbox");
		expect(input).toHaveValue("");
	});

	it("ignores unrelated keys in keydown when editing", () => {
		const customProps = {
			...defaultProps,
			editingXAxisId: "x2",
		};
		render(<XAxisInteractionZones {...customProps} />);
		const input = screen.getByRole("textbox");

		fireEvent.keyDown(input, { key: "Shift" });
		expect(defaultProps.setEditingXAxisId).not.toHaveBeenCalled();
	});
});
