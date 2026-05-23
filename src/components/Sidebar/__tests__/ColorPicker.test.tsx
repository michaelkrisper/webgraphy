import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import ColorPicker from "../ColorPicker";

describe("ColorPicker", () => {
	const defaultProps = {
		color: "#ff0000",
		onChange: vi.fn(),
		onHover: vi.fn(),
		onHoverEnd: vi.fn(),
		ariaLabel: "Test Color Picker",
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("renders correctly with default color", () => {
		render(<ColorPicker {...defaultProps} />);

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		expect(button).toBeInTheDocument();
		expect(button).toHaveStyle({ backgroundColor: "#ff0000" });
	});

	it("toggles the popover when clicked", () => {
		render(<ColorPicker {...defaultProps} />);

		const button = screen.getByRole("button", { name: "Test Color Picker" });

		// Initially closed
		expect(
			document.getElementById("color-picker-popover"),
		).not.toBeInTheDocument();

		// Open
		fireEvent.click(button);
		expect(document.getElementById("color-picker-popover")).toBeInTheDocument();

		// Close
		fireEvent.click(button);
		expect(
			document.getElementById("color-picker-popover"),
		).not.toBeInTheDocument();
	});

	it("closes the popover when clicking outside", () => {
		render(
			<div>
				<div data-testid="outside">Outside</div>
				<ColorPicker {...defaultProps} />
			</div>,
		);

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		expect(document.getElementById("color-picker-popover")).toBeInTheDocument();

		// Click outside
		fireEvent.mouseDown(screen.getByTestId("outside"));

		expect(
			document.getElementById("color-picker-popover"),
		).not.toBeInTheDocument();
	});

	it("calls onChange when a preset color is selected and closes popover", () => {
		render(<ColorPicker {...defaultProps} />);

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		// Find a color palette button, e.g. the grayscale primary (black)
		const blackButton = document.querySelector(
			".color-picker-main-color button",
		);
		if (blackButton) {
			fireEvent.click(blackButton);
		}

		expect(defaultProps.onChange).toHaveBeenCalledWith("#000000");
		expect(
			document.getElementById("color-picker-popover"),
		).not.toBeInTheDocument();
	});

	it("calls onHover and onHoverEnd when hovering over preset colors", () => {
		render(<ColorPicker {...defaultProps} />);

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		const blackButton = document.querySelector(
			".color-picker-main-color button",
		);
		if (blackButton) {
			fireEvent.mouseEnter(blackButton);
			expect(defaultProps.onHover).toHaveBeenCalledWith("#000000");

			fireEvent.mouseLeave(blackButton);
			expect(defaultProps.onHoverEnd).toHaveBeenCalled();
		}
	});

	it("calls onChange when hex input is updated with valid hex", () => {
		render(<ColorPicker {...defaultProps} />);

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		const hexInput = screen.getByDisplayValue("#ff0000");

		// Valid hex
		fireEvent.change(hexInput, { target: { value: "#00ff00" } });
		expect(defaultProps.onChange).toHaveBeenCalledWith("#00ff00");

		// Invalid hex shouldn't call onChange but updates local state
		fireEvent.change(hexInput, { target: { value: "invalid" } });
		expect(defaultProps.onChange).toHaveBeenCalledTimes(1); // Still 1 from previous call
	});

	it("calls onChange when RGB inputs are updated", () => {
		render(<ColorPicker {...defaultProps} />); // #ff0000 is 255, 0, 0

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		// R, G, B inputs are type=number
		const rgbInputs = document.querySelectorAll(
			".color-picker-rgb-inputs input",
		);
		expect(rgbInputs.length).toBe(3);

		const gInput = rgbInputs[1]; // Green
		fireEvent.change(gInput, { target: { value: "255" } });

		// #ff0000 -> #ffff00
		expect(defaultProps.onChange).toHaveBeenCalledWith("#ffff00");
	});

	it("handles wheel events on RGB inputs", () => {
		render(<ColorPicker {...defaultProps} />); // #ff0000

		const button = screen.getByRole("button", { name: "Test Color Picker" });
		fireEvent.click(button);

		const rgbInputsContainer = document.querySelector(
			".color-picker-rgb-inputs",
		);
		const rInput = document.querySelectorAll(
			".color-picker-rgb-inputs input",
		)[0]; // Red

		if (rgbInputsContainer && rInput) {
			// Simulate wheel event
			// In JSDOM, events bubble up. We can just dispatch the wheel event on the input itself
			// because our code attaches the listener to the container and checks e.target.closest("input").
			fireEvent.wheel(rInput, { deltaY: 1 });

			// Decrement R: #ff (255) - 1 -> #fe (254) -> #fe0000
			expect(defaultProps.onChange).toHaveBeenCalledWith("#fe0000");
		}
	});
});
