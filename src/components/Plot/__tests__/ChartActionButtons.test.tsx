import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
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

		const stackedFitBtn = screen.getByRole("button", { name: "Stacked Fit" });
		const fitAllBtn = screen.getByRole("button", { name: "Fit All" });

		// Stacked fit should be shifted left by 28 compared to fit all
		expect(stackedFitBtn).toHaveStyle({ bottom: "21px", left: "-7px" });
		expect(fitAllBtn).toHaveStyle({ bottom: "21px", left: "21px" });
	});

	it("is fully opaque and uses the shared hover class", () => {
		render(<ChartActionButtons {...defaultProps} />);

		for (const name of ["Stacked Fit", "Fit All"]) {
			const btn = screen.getByRole("button", { name });
			expect(btn.style.opacity).toBe("");
			expect(btn).toHaveClass("chart-action-btn");
			fireEvent.mouseEnter(btn);
			expect(btn.style.opacity).toBe("");
		}
	});

	it("names the keyboard shortcut in the tooltip", () => {
		render(<ChartActionButtons {...defaultProps} />);

		const fitAllBtn = screen.getByRole("button", { name: "Fit All" });
		expect(fitAllBtn).toHaveAttribute("title", "Fit All (Home)");
		expect(fitAllBtn).toHaveAttribute("aria-keyshortcuts", "Home");

		const stackedFitBtn = screen.getByRole("button", { name: "Stacked Fit" });
		expect(stackedFitBtn).toHaveAttribute(
			"title",
			"Stacked Fit — each Y-axis fitted to its own slice (Shift+Home)",
		);
		expect(stackedFitBtn).toHaveAttribute("aria-keyshortcuts", "Shift+Home");
	});

	it("calls appropriate callbacks when buttons are clicked", () => {
		render(<ChartActionButtons {...defaultProps} />);

		fireEvent.click(screen.getByRole("button", { name: "Stacked Fit" }));
		expect(defaultProps.onStackedFit).toHaveBeenCalledTimes(1);

		fireEvent.click(screen.getByRole("button", { name: "Fit All" }));
		expect(defaultProps.onFitAll).toHaveBeenCalledTimes(1);
	});

	it("has no axe violations", async () => {
		const { container } = render(<ChartActionButtons {...defaultProps} />);
		expect(await axe(container)).toHaveNoViolations();
	});
});
