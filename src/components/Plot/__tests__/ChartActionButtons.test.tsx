import { render, screen, fireEvent } from "@testing-library/react";
import { describe, it, expect, vi } from "vitest";
import { ChartActionButtons } from "../ChartActionButtons";
import "@testing-library/jest-dom";

describe("ChartActionButtons", () => {
	const defaultProps = {
		padding: { bottom: 50, left: 50 },
		themeColors: { textMuted: "#888" },
		onStackedFit: vi.fn(),
		onFitAll: vi.fn(),
	};

	it("renders buttons with correct layout based on padding", () => {
		render(<ChartActionButtons {...defaultProps} />);

		const stackedFitBtn = screen.getByTitle("Stacked Fit — each Y-axis fitted to its own slice");
		const fitAllBtn = screen.getByTitle("Fit All");

		expect(stackedFitBtn).toBeInTheDocument();
		expect(fitAllBtn).toBeInTheDocument();

		// Check initial opacity style
		expect(stackedFitBtn).toHaveStyle({ opacity: "0.6" });
		expect(fitAllBtn).toHaveStyle({ opacity: "0.6" });

        // Stacked fit should be shifted left by 28 compared to fit all
        expect(stackedFitBtn).toHaveStyle({ bottom: "21px", left: "-7px" });
        expect(fitAllBtn).toHaveStyle({ bottom: "21px", left: "21px" });
	});

	it("calls appropriate callbacks when buttons are clicked", () => {
		render(<ChartActionButtons {...defaultProps} />);

		const stackedFitBtn = screen.getByTitle("Stacked Fit — each Y-axis fitted to its own slice");
		const fitAllBtn = screen.getByTitle("Fit All");

		fireEvent.click(stackedFitBtn);
		expect(defaultProps.onStackedFit).toHaveBeenCalledTimes(1);

		fireEvent.click(fitAllBtn);
		expect(defaultProps.onFitAll).toHaveBeenCalledTimes(1);
	});

	it("updates opacity correctly on mouse enter and leave", () => {
		render(<ChartActionButtons {...defaultProps} />);

		const stackedFitBtn = screen.getByTitle("Stacked Fit — each Y-axis fitted to its own slice");
		const fitAllBtn = screen.getByTitle("Fit All");

		// Test stacked fit hover
		fireEvent.mouseEnter(stackedFitBtn);
		expect(stackedFitBtn).toHaveStyle({ opacity: "1" });

		fireEvent.mouseLeave(stackedFitBtn);
		expect(stackedFitBtn).toHaveStyle({ opacity: "0.6" });

		// Test fit all hover
		fireEvent.mouseEnter(fitAllBtn);
		expect(fitAllBtn).toHaveStyle({ opacity: "1" });

		fireEvent.mouseLeave(fitAllBtn);
		expect(fitAllBtn).toHaveStyle({ opacity: "0.6" });
	});
});
