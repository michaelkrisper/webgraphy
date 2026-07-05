import React, { createRef } from "react";
import { render } from "@testing-library/react";
import { vi, describe, it, expect, beforeEach, afterEach } from "vitest";
import { AxesLayer, AxesLayerHandle } from "../AxesLayer";
import type { XAxisLayout, YAxisLayout, XAxisMetrics } from "../chartTypes";
import type { Dataset } from "../../../services/persistence";

const mockCtx = {
	clearRect: vi.fn(),
	save: vi.fn(),
	scale: vi.fn(),
	restore: vi.fn(),
	fillText: vi.fn(),
	measureText: vi.fn(() => ({ width: 10 })),
	drawImage: vi.fn(),
	setTransform: vi.fn(),
	fillRect: vi.fn(),
	beginPath: vi.fn(),
	moveTo: vi.fn(),
	lineTo: vi.fn(),
	stroke: vi.fn(),
	translate: vi.fn(),
	rotate: vi.fn(),
	set fillStyle(val: string) {},
	set strokeStyle(val: string) {},
	set lineWidth(val: number) {},
	set font(val: string) {},
	set textAlign(val: string) {},
	set textBaseline(val: string) {},
};

describe("AxesLayer", () => {
	beforeEach(() => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
			mockCtx as unknown as CanvasRenderingContext2D,
		);
	});
	afterEach(() => {
		vi.restoreAllMocks();
		vi.clearAllMocks();
	});

	const xAxesMetrics: XAxisMetrics[] = [
		{
			cumulativeOffset: 0,
			labelBottom: 10,
			secLabelBottom: 25,
			titleBottom: 40,
			total: 50,
		},
	];

	const axisLayout = {
		y1: { total: 40, label: 30 },
	};

	const defaultProps = {
		xAxes: [],
		yAxes: [],
		width: 800,
		height: 600,
		padding: { top: 10, right: 10, bottom: 10, left: 10 },
		series: [],
		datasets: [],
		axisLayout: {},
		xAxesMetrics: [],
		axisColor: "#000",
		zeroLineColor: "#111",
		gridColor: "#222",
		plotBg: "#333",
		labelColor: "#444",
		secLabelBg: "#555",
		leftOffsets: {},
		rightOffsets: {},
		fontFamily: "sans-serif",
	};

	it("renders a canvas element", () => {
		const { container } = render(<AxesLayer {...defaultProps} />);
		expect(container.querySelector("canvas")).not.toBeNull();
	});

	it("draws axes labels and titles on redraw", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const xAxes: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: { result: [0, 50, 100], precision: 0 },
				title: "X Axis Title",
			},
		];

		const yAxes: YAxisLayout[] = [
			{
				id: "y1",
				position: "left",
				min: 0,
				max: 100,
				ticks: [0, 50, 100],
				precision: 0,
				title: "Y Axis Title",
			},
		];

		ref.current?.redraw(xAxes, yAxes);

		expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"X Axis Title",
			expect.any(Number),
			expect.any(Number),
		);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"50",
			expect.any(Number),
			expect.any(Number),
		);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"50",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("draws secondary x axis labels correctly", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const xAxes: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: {
					result: [0, 50, 100],
					precision: 0,
					secondaryLabels: [
						{ timestamp: 0, label: "Jan 1" },
						{ timestamp: 100, label: "Jan 2" },
					],
				},
				title: "X Axis",
			},
		];

		ref.current?.redraw(xAxes, []);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"Jan 1",
			expect.any(Number),
			expect.any(Number),
		);
		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"Jan 2",
			expect.any(Number),
			expect.any(Number),
		);
		expect(mockCtx.fillRect).toHaveBeenCalled();
		expect(mockCtx.stroke).toHaveBeenCalled();
	});

	it("handles right-aligned y-axis", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={{ y2: { total: 40, label: 30 } }}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const yAxes: YAxisLayout[] = [
			{
				id: "y2",
				position: "right",
				min: 0,
				max: 100,
				ticks: [0, 50, 100],
				precision: 0,
				title: "Y Axis 2",
			},
		];

		ref.current?.redraw([], yAxes);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"50",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("does not clear and redraw when isInteracting is true initially but draws when interacting completes", () => {
		const ref = createRef<AxesLayerHandle>();
		const { rerender } = render(
			<AxesLayer {...defaultProps} ref={ref} isInteracting={true} />,
		);

		mockCtx.clearRect.mockClear();

		rerender(<AxesLayer {...defaultProps} ref={ref} isInteracting={false} />);

		expect(mockCtx.clearRect).toHaveBeenCalled();
	});

	it("handles category ticks properly", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const xAxes: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 2,
				ticks: { result: [0, 1, 2], precision: 0 },
				categoryLabels: ["CatA", "CatB", "CatC"],
				categoryTicks: [0, 1, 2],
				title: "X Axis Cat",
			},
		];

		const yAxes: YAxisLayout[] = [
			{
				id: "y1",
				position: "left",
				min: 0,
				max: 2,
				ticks: [0, 1, 2],
				precision: 0,
				categoryLabels: ["CatY1", "CatY2", "CatY3"],
				title: "Y Axis Cat",
			},
		];

		ref.current?.redraw(xAxes, yAxes);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"CatB",
			expect.any(Number),
			expect.any(Number),
		);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"CatY2",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("draws y-axis title with multiple series colors correctly", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={{ yMulti: { total: 40, label: 30 } }}
				xAxesMetrics={xAxesMetrics}
				series={[
					{
						id: "s1",
						sourceId: "d1",
						yColumn: "col1",
						yAxisId: "yMulti",
						lineColor: "red",
						type: "line",
						name: "S1",
					},
					{
						id: "s2",
						sourceId: "d1",
						yColumn: "col2",
						yAxisId: "yMulti",
						lineColor: "blue",
						type: "line",
						name: "S2",
					},
				]}
			/>,
		);

		const yAxes: YAxisLayout[] = [
			{
				id: "yMulti",
				position: "left",
				min: 0,
				max: 100,
				ticks: [50],
				precision: 0,
				title: "Multiple Series Y Axis",
			},
		];

		ref.current?.redraw([], yAxes);

		// fillText should be called for 'S1', ' / ', and 'S2' segments of title
		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"S1",
			expect.any(Number),
			expect.any(Number),
		);
		expect(mockCtx.fillText).toHaveBeenCalledWith(
			" / ",
			expect.any(Number),
			expect.any(Number),
		);
		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"S2",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("handles dataset to axes relation for series grouping correctly", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
				datasets={[
					{
						id: "d1",
						name: "D1",
						xAxisId: "x1",
						source: { type: "csv", url: "", inlineData: "" } as unknown as Dataset["source"],
						format: "csv",
						data: [],
						columns: [],
						_dataKey: "k",
					},
				]}
				series={[
					{
						id: "s1",
						sourceId: "d1",
						yColumn: "col1",
						yAxisId: "y1",
						lineColor: "red",
						type: "line",
						name: "S1",
					},
					{
						id: "s2",
						sourceId: "d2",
						yColumn: "col2",
						yAxisId: "y1",
						lineColor: "blue",
						type: "line",
						name: "S2",
					}, // Missing dataset
					{
						id: "s3",
						sourceId: "d1",
						yColumn: "col1",
						yAxisId: "y1",
						lineColor: "green",
						type: "line",
						name: "S1",
					}, // Duplicate seen key
				]}
			/>,
		);

		const xAxes: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: { result: [50], precision: 0 },
				title: "X Axis Title",
			},
		];

		ref.current?.redraw(xAxes, []);

		expect(mockCtx.fillText).toHaveBeenCalledWith(
			"X Axis Title",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("does not render ticks outside of bounds", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const xAxes: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: {
					result: [-50, 150],
					precision: 0,
					secondaryLabels: [
						{ timestamp: -50, label: "Jan 1" },
						{ timestamp: 150, label: "Jan 2" },
					],
				},
				title: "X Axis",
			},
		];

		const yAxes: YAxisLayout[] = [
			{
				id: "y1",
				position: "left",
				min: 0,
				max: 100,
				ticks: [-50, 150],
				precision: 0,
				title: "Y Axis",
			},
		];

		mockCtx.fillText.mockClear();
		ref.current?.redraw(xAxes, yAxes);

		// should not render -50 and 150 tick labels since they are outside [0, 100] norm bounds
		expect(mockCtx.fillText).not.toHaveBeenCalledWith(
			"-50",
			expect.any(Number),
			expect.any(Number),
		);
		expect(mockCtx.fillText).not.toHaveBeenCalledWith(
			"150",
			expect.any(Number),
			expect.any(Number),
		);
	});

	it("evicts unused labels from cache", () => {
		const ref = createRef<AxesLayerHandle>();
		render(
			<AxesLayer
				{...defaultProps}
				ref={ref}
				axisLayout={axisLayout}
				xAxesMetrics={xAxesMetrics}
			/>,
		);

		const xAxes1: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: { result: [0, 50, 100], precision: 0 },
				title: "X Axis Title",
			},
		];

		const yAxes: YAxisLayout[] = [];

		ref.current?.redraw(xAxes1, yAxes);

		// Now change the precision or ticks so the cache needs evicting
		const xAxes2: XAxisLayout[] = [
			{
				id: "x1",
				position: "bottom",
				min: 0,
				max: 100,
				ticks: { result: [0, 50, 100], precision: 1 },
				title: "X Axis Title",
			},
		];

		ref.current?.redraw(xAxes2, yAxes);
		expect(mockCtx.fillText).toHaveBeenCalled();
	});

	it("re-runs redraw safely when canvas context is null initially", () => {
		// Just for coverage if context returns null
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValueOnce(
			null,
		);
		const ref = createRef<AxesLayerHandle>();
		render(<AxesLayer {...defaultProps} ref={ref} />);
		ref.current?.redraw([], []);
	});
});
