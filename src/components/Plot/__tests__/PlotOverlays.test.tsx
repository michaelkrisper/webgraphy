import { render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import React from "react";
import { describe, it, expect } from "vitest";
import { PlotDragOverlay, ZoomBoxOverlay } from "../PlotOverlays";

describe("PlotDragOverlay", () => {
	it("renders nothing when visible is false", () => {
		const { container } = render(<PlotDragOverlay visible={false} />);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders 'Drop to import' text when visible is true", () => {
		render(<PlotDragOverlay visible={true} />);
		expect(screen.getByText("Drop to import")).toBeInTheDocument();
	});
});

describe("ZoomBoxOverlay", () => {
	it("renders nothing when visible is false", () => {
		const svgRef = React.createRef<SVGSVGElement>();
		const rectRef = React.createRef<SVGRectElement>();
		const { container } = render(
			<ZoomBoxOverlay visible={false} svgRef={svgRef} rectRef={rectRef} />
		);
		expect(container).toBeEmptyDOMElement();
	});

	it("renders SVG with correct title and rect when visible is true", () => {
		const svgRef = React.createRef<SVGSVGElement>();
		const rectRef = React.createRef<SVGRectElement>();

		render(<ZoomBoxOverlay visible={true} svgRef={svgRef} rectRef={rectRef} />);

		const title = screen.getByText("Zoom Selection Box");
		expect(title).toBeInTheDocument();

		const svg = title.closest("svg");
		expect(svg).toBeInTheDocument();

		const rect = svg?.querySelector("rect");
		expect(rect).toBeInTheDocument();
	});
});
