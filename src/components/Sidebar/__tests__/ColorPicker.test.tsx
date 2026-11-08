import "@testing-library/jest-dom";
import { render, screen, fireEvent } from "@testing-library/react";
import { axe } from "vitest-axe";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { useState } from "react";
import ColorPicker from "../ColorPicker";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

describe("ColorPicker", () => {
	const defaultProps = {
		color: "#ff0000",
		onSelect: vi.fn(),
		onChange: vi.fn(),
		onHover: vi.fn(),
		onHoverEnd: vi.fn(),
	};

	beforeEach(() => {
		vi.clearAllMocks();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("selects a swatch through onSelect, the current one pressed", () => {
		render(<ColorPicker {...defaultProps} color="#000000" />);
		const black = screen.getByRole("button", {
			name: "Color #000000",
			pressed: true,
		});
		fireEvent.click(black);
		expect(defaultProps.onSelect).toHaveBeenCalledWith("#000000");
		expect(defaultProps.onChange).not.toHaveBeenCalled();
	});

	it("calls onHover and onHoverEnd when hovering over preset colors", () => {
		render(<ColorPicker {...defaultProps} />);

		const blackButton = document.querySelector(".color-picker-main-color button");
		if (blackButton) {
			fireEvent.mouseEnter(blackButton);
			expect(defaultProps.onHover).toHaveBeenCalledWith("#000000");

			fireEvent.mouseLeave(blackButton);
			expect(defaultProps.onHoverEnd).toHaveBeenCalled();
		}
	});

	it("calls onChange when hex input is updated with valid hex", () => {
		render(<ColorPicker {...defaultProps} />);

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

		// R, G, B inputs are type=number
		const rgbInputs = document.querySelectorAll(".color-picker-rgb-inputs input");
		expect(rgbInputs.length).toBe(3);

		const gInput = rgbInputs[1]; // Green
		fireEvent.change(gInput, { target: { value: "255" } });

		// #ff0000 -> #ffff00
		expect(defaultProps.onChange).toHaveBeenCalledWith("#ffff00");
	});

	describe("RGB fields show the colour they hold", () => {
		function Controlled() {
			const [color, setColor] = useState("#ff0000");
			return (
				<>
					<output style={{ backgroundColor: color }}>swatch</output>
					<ColorPicker color={color} onSelect={setColor} onChange={setColor} />
				</>
			);
		}
		const open = () => {
			render(<Controlled />);
			const button = screen.getByText("swatch");
			return {
				button,
				red: screen.getByRole("spinbutton", { name: "Red" }),
				green: screen.getByRole("spinbutton", { name: "Green" }),
			};
		};

		it("clamps out-of-range input in the field, also when the colour stays", () => {
			const { button, red, green } = open();
			// Red is already 255, so clamping 300 changes no state.
			fireEvent.change(red, { target: { value: "300" } });
			expect(red).toHaveValue(255);
			fireEvent.change(green, { target: { value: "-5" } });
			expect(green).toHaveValue(0);
			expect(button).toHaveStyle({ backgroundColor: "#ff0000" });

			fireEvent.change(green, { target: { value: "128" } });
			expect(green).toHaveValue(128);
			expect(button).toHaveStyle({ backgroundColor: "#ff8000" });
		});

		it("can be cleared and retyped, and restores the value on blur", () => {
			const { button, red } = open();
			fireEvent.change(red, { target: { value: "" } });
			expect(red).toHaveValue(null);
			expect(button).toHaveStyle({ backgroundColor: "#ff0000" });
			fireEvent.blur(red);
			expect(red).toHaveValue(255);

			fireEvent.change(red, { target: { value: "" } });
			fireEvent.change(red, { target: { value: "12" } });
			expect(red).toHaveValue(12);
			expect(button).toHaveStyle({ backgroundColor: "#0c0000" });
		});
	});

	it("handles wheel events on RGB inputs", () => {
		render(<ColorPicker {...defaultProps} />); // #ff0000

		const rgbInputsContainer = document.querySelector(".color-picker-rgb-inputs");
		const rInput = document.querySelectorAll(".color-picker-rgb-inputs input")[0]; // Red

		if (rgbInputsContainer && rInput) {
			// Simulate wheel event
			// In JSDOM, events bubble up. We can just dispatch the wheel event on the input itself
			// because our code attaches the listener to the container and checks e.target.closest("input").
			fireEvent.wheel(rInput, { deltaY: 1 });

			// Decrement R: #ff (255) - 1 -> #fe (254) -> #fe0000
			expect(defaultProps.onChange).toHaveBeenCalledWith("#fe0000");
		}
	});

	it(
		"has no axe violations",
		async () => {
			const { container } = render(<ColorPicker {...defaultProps} />);
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);
});
