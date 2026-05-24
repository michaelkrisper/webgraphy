import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { Crosshair } from "../Crosshair";

// Mock the canvas context
const mockContext = {
	clearRect: vi.fn(),
	save: vi.fn(),
	restore: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	stroke: vi.fn(),
	setLineDash: vi.fn(),
	fillRect: vi.fn(),
	strokeRect: vi.fn(),
	arc: vi.fn(),
	fill: vi.fn(),
};

beforeEach(() => {
	vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(() => {
		return mockContext as unknown as CanvasRenderingContext2D;
	});

	vi.spyOn(window, "requestAnimationFrame").mockImplementation(
		(cb: FrameRequestCallback) => {
			cb(performance.now());
			return 1;
		},
	);

	vi.spyOn(window, "cancelAnimationFrame").mockImplementation(vi.fn());

	class ResizeObserverMock {
		observe = vi.fn();
		unobserve = vi.fn();
		disconnect = vi.fn();
	}
	vi.stubGlobal("ResizeObserver", ResizeObserverMock);
});

afterEach(() => {
	vi.restoreAllMocks();
	vi.unstubAllGlobals();
});

describe("Crosshair", () => {
	const defaultProps = {
		padding: { top: 10, right: 10, bottom: 10, left: 10 },
		width: 800,
		height: 600,
		isPanning: false,
		xAxes: [],
		yAxes: [],
		datasets: [],
		series: [],
		tooltipColor: "black",
		snapLineColor: "red",
		tooltipDividerColor: "gray",
		tooltipSubColor: "blue",
		plotBg: "white",
	};

	it("renders without crashing", () => {
		const containerRef = React.createRef<HTMLDivElement>();
		const { container } = render(
			<div ref={containerRef}>
				<Crosshair {...defaultProps} containerRef={containerRef} />
			</div>,
		);
		expect(container.querySelector("canvas")).toBeInTheDocument();
		expect(container.querySelector(".chart-tooltip")).toBeInTheDocument();
	});

	it("hides tooltip when isPanning is true", () => {
		const containerRef = React.createRef<HTMLDivElement>();
		render(
			<div ref={containerRef} style={{ width: "800px", height: "600px" }}>
				<Crosshair
					{...defaultProps}
					containerRef={containerRef}
					isPanning={true}
				/>
			</div>,
		);

		if (containerRef.current) {
			vi.spyOn(containerRef.current, "getBoundingClientRect").mockReturnValue({
				left: 0,
				top: 0,
				right: 800,
				bottom: 600,
				width: 800,
				height: 600,
				x: 0,
				y: 0,
				toJSON: () => {},
			});
		}

		act(() => {
			window.dispatchEvent(
				new MouseEvent("mousemove", { clientX: 100, clientY: 100 }),
			);
		});

		const tooltip = screen.getByText(
			(content, element) => element?.className === "chart-tooltip",
		);
		expect(tooltip).toHaveStyle({ display: "none" });
	});

	it("handles mouseleave event", () => {
		const containerRef = React.createRef<HTMLDivElement>();
		const { container } = render(
			<div ref={containerRef} style={{ width: "800px", height: "600px" }}>
				<Crosshair {...defaultProps} containerRef={containerRef} />
			</div>,
		);

		const tooltip = container.querySelector(".chart-tooltip") as HTMLElement;

		act(() => {
			if (containerRef.current) {
				containerRef.current.dispatchEvent(new Event("mouseleave"));
			}
		});

		expect(tooltip).toHaveStyle({ display: "none" });
	});

	it("handles Ctrl+C to copy tooltip text", async () => {
		const mockClipboard = {
			writeText: vi.fn(),
		};
		Object.assign(navigator, { clipboard: mockClipboard });

		const containerRef = React.createRef<HTMLDivElement>();
		render(
			<div ref={containerRef}>
				<Crosshair {...defaultProps} containerRef={containerRef} />
			</div>,
		);

		act(() => {
			window.dispatchEvent(
				new KeyboardEvent("keydown", { key: "c", ctrlKey: true }),
			);
		});

		// We don't have a snap since dataset/series is empty in this test, but we verify it doesn't crash
		expect(mockClipboard.writeText).not.toHaveBeenCalled();
	});
});
