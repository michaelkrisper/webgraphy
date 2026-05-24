import type React from "react";
import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { usePanZoom } from "../usePanZoom";

type PanZoomOptions = Parameters<typeof usePanZoom>[0];

describe("usePanZoom", () => {
	const mockSyncViewport = vi.fn();
	const mockHandleAutoScaleX = vi.fn();
	const mockHandleAutoScaleY = vi.fn();
	const mockOnPanEnd = vi.fn();

	let baseOptions: PanZoomOptions;

	beforeEach(() => {
		vi.useFakeTimers();
		vi.stubGlobal(
			"requestAnimationFrame",
			(cb: FrameRequestCallback) => setTimeout(() => cb(performance.now()), 0),
		);
		vi.stubGlobal("cancelAnimationFrame", (id: number) => clearTimeout(id));

		const containerRef = {
			current: {
				getBoundingClientRect: () => ({
					left: 0,
					top: 0,
					width: 800,
					height: 600,
				}),
			},
		};

		const activeXAxes = [{ id: "x1", min: 0, max: 100 }];
		const activeYAxes = [{ id: "y1", min: 0, max: 100 }];

		baseOptions = {
			containerRef,
			width: 800,
			height: 600,
			padding: { top: 10, right: 10, bottom: 10, left: 10 },
			chartWidth: 780,
			chartHeight: 580,
			activeXAxes,
			activeYAxes,
			xAxes: activeXAxes,
			yAxes: activeYAxes,
			targetXAxes: { current: { x1: { min: 0, max: 100 } } },
			targetYs: { current: { y1: { min: 0, max: 100 } } },
			syncViewport: mockSyncViewport,
			xAxesMetrics: [],
			axisLayout: {},
			leftAxes: [],
			rightAxes: [],
			handleAutoScaleX: mockHandleAutoScaleX,
			handleAutoScaleY: mockHandleAutoScaleY,
			pressedKeys: { current: new Set() },
			onPanEnd: mockOnPanEnd,
			panStateRef: {
				current: {
					active: false,
					startX: 0,
					startY: 0,
					currentX: 0,
					currentY: 0,
					target: null,
					startTargetX: {},
					startTargetY: {},
				},
			},
		} as unknown as PanZoomOptions;
	});

	afterEach(() => {
		vi.runOnlyPendingTimers();
		vi.useRealTimers();
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("initializes correctly", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		expect(result.current.panTarget).toBeNull();
		expect(result.current.isInteracting).toBe(false);
		expect(result.current.isZooming).toBe(false);
	});

	it("handles mouse down and start panning", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			result.current.handleMouseDown(
				{ clientX: 100, clientY: 100, button: 0 } as unknown as React.MouseEvent,
				"all"
			);
		});

		expect(result.current.panTarget).toBe("all");
		expect(result.current.isInteracting).toBe(true);
	});

	it("handles mouse panning correctly", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			result.current.handleMouseDown(
				{ clientX: 100, clientY: 100, button: 0 } as unknown as React.MouseEvent,
				"all"
			);
		});

		// Simulate global mousemove
		act(() => {
			const moveEvent = new MouseEvent("mousemove", {
				clientX: 150,
				clientY: 120,
			});
			window.dispatchEvent(moveEvent);
			vi.advanceTimersByTime(16); // advance rAF
		});

		// Mouse moved dx=50, dy=20
		// shiftWorld = -dx / (chartWidth / range) = -50 / (780 / 100) = -50 / 7.8 = -6.41
		const newXMin = baseOptions.targetXAxes.current["x1"].min;
		expect(newXMin).toBeLessThan(0); // Should have panned left
	});

	it("handles mouse up and ends panning", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			result.current.handleMouseDown(
				{ clientX: 100, clientY: 100, button: 0 } as unknown as React.MouseEvent,
				"all"
			);
		});

		act(() => {
			const upEvent = new MouseEvent("mouseup");
			window.dispatchEvent(upEvent);
		});

		expect(result.current.panTarget).toBeNull();
		expect(mockOnPanEnd).toHaveBeenCalled();
	});

	it("handles wheel zoom correctly", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			const preventDefault = vi.fn();
			result.current.handleWheel(
				{
					clientX: 400,
					clientY: 300,
					deltaY: 100,
					preventDefault,
				} as unknown as React.WheelEvent,
				"all"
			);
		});

		// Wheel logic synchronously updates targetAxes
		expect(baseOptions.targetXAxes.current["x1"].min).toBeLessThan(0);
		expect(baseOptions.targetXAxes.current["x1"].max).toBeGreaterThan(100);
		expect(mockSyncViewport).toHaveBeenCalled();

		act(() => {
			vi.runAllTimers();
		});
	});

	it("handles single touch down", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			result.current.handleTouchStart(
				{ touches: [{ clientX: 100, clientY: 100 }] } as unknown as React.TouchEvent,
				"all"
			);
		});

		expect(result.current.panTarget).toBe("all");
	});

	it("handles double tap to auto scale", () => {
		const { result } = renderHook(() => usePanZoom(baseOptions));

		act(() => {
			result.current.handleTouchStart(
				{ touches: [{ clientX: 100, clientY: 100 }] } as unknown as React.TouchEvent,
				"all"
			);
		});

		// Trigger another touch immediately
		act(() => {
			result.current.handleTouchStart(
				{ touches: [{ clientX: 100, clientY: 100 }] } as unknown as React.TouchEvent,
				"all"
			);
		});

		expect(mockHandleAutoScaleX).toHaveBeenCalled();
		expect(mockHandleAutoScaleY).toHaveBeenCalledWith("y1");
	});
});
