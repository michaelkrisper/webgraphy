import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi, afterEach } from "vitest";
import "@testing-library/jest-dom";
import { PopupPicker } from "../PopupPicker";

const mockOptions = [
	{ value: "opt1", icon: <span>Icon1</span>, label: "Option 1" },
	{ value: "opt2", icon: <span>Icon2</span>, label: "Option 2" },
	{ value: "opt3", icon: <span>Icon3</span>, label: "Option 3", disabled: true },
];

describe("PopupPicker", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

	it("renders trigger correctly", () => {
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref, isOpen }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger {isOpen ? "Open" : "Closed"}
					</button>
				)}
			/>
		);

		expect(screen.getByTestId("trigger")).toBeInTheDocument();
		expect(screen.getByTestId("trigger")).toHaveTextContent("Trigger Closed");
	});

	it("toggles popover when trigger is clicked", () => {
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

		expect(screen.queryByText("Option 1")).not.toBeInTheDocument();

		fireEvent.click(screen.getByTestId("trigger"));

		expect(screen.getByText("Option 1")).toBeInTheDocument();
		expect(screen.getByText("Option 2")).toBeInTheDocument();
		expect(screen.getByText("Option 3")).toBeInTheDocument();

		fireEvent.click(screen.getByTestId("trigger"));

		expect(screen.queryByText("Option 1")).not.toBeInTheDocument();
	});

	it("applies active class to current option", () => {
		render(
			<PopupPicker
				options={mockOptions}
				current="opt2"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

		fireEvent.click(screen.getByTestId("trigger"));

		const activeOption = screen.getByText("Option 2").closest("button");
		expect(activeOption).toHaveClass("popup-picker-item--active");

		const inactiveOption = screen.getByText("Option 1").closest("button");
		expect(inactiveOption).not.toHaveClass("popup-picker-item--active");
	});

	it("calls onChange and closes popover when an option is selected", () => {
		const handleChange = vi.fn();
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={handleChange}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

		fireEvent.click(screen.getByTestId("trigger"));
		fireEvent.click(screen.getByText("Option 2"));

		expect(handleChange).toHaveBeenCalledWith("opt2");
		expect(screen.queryByText("Option 2")).not.toBeInTheDocument();
	});

	it("does not call onChange when a disabled option is clicked", () => {
		const handleChange = vi.fn();
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={handleChange}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

		fireEvent.click(screen.getByTestId("trigger"));
		const disabledOption = screen.getByText("Option 3").closest("button");

        expect(disabledOption).toBeDisabled();

		fireEvent.click(disabledOption!);

		expect(handleChange).not.toHaveBeenCalled();
	});

	it("fires onHoverOption with the value on hover and null on leave", () => {
		const handleHover = vi.fn();
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				onHoverOption={handleHover}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>,
		);

		fireEvent.click(screen.getByTestId("trigger"));
		const option = screen.getByText("Option 2").closest("button")!;

		fireEvent.mouseEnter(option);
		expect(handleHover).toHaveBeenLastCalledWith("opt2");

		fireEvent.mouseLeave(option);
		expect(handleHover).toHaveBeenLastCalledWith(null);
	});

	it("clears the hover preview when the popover closes", () => {
		const handleHover = vi.fn();
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				onHoverOption={handleHover}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>,
		);

		fireEvent.click(screen.getByTestId("trigger"));
		fireEvent.mouseEnter(screen.getByText("Option 2").closest("button")!);
		handleHover.mockClear();

		// Selecting an option closes the popover and must clear the preview.
		fireEvent.click(screen.getByText("Option 1"));
		expect(handleHover).toHaveBeenCalledWith(null);
	});

	it("closes popover when clicking outside", () => {
		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

		fireEvent.click(screen.getByTestId("trigger"));
		expect(screen.getByText("Option 1")).toBeInTheDocument();

		// Click outside
		fireEvent.mouseDown(document.body);

		expect(screen.queryByText("Option 1")).not.toBeInTheDocument();
	});

	it("calculates coordinates based on window size and trigger position", () => {
		const WINDOW_WIDTH = 1000;
		const SCROLL_X = 0;
		const SCROLL_Y = 0;

		const TRIGGER_WIDTH = 100;
		const TRIGGER_HEIGHT = 40;
		const TRIGGER_TOP = 100;
		const TRIGGER_LEFT = 900;
		const TRIGGER_BOTTOM = 140;
		const TRIGGER_RIGHT = 1000;
		const TRIGGER_X = 900;
		const TRIGGER_Y = 100;

		const EXPECTED_LEFT = 860;
		const EXPECTED_TOP = 144;

		// Mock innerWidth
		vi.stubGlobal("innerWidth", WINDOW_WIDTH);
		vi.stubGlobal("scrollX", SCROLL_X);
		vi.stubGlobal("scrollY", SCROLL_Y);

		render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref }) => {
					return (
						<button ref={ref} onClick={onClick} data-testid="trigger">
							Trigger
						</button>
					);
				}}
			/>
		);

		// Mock getBoundingClientRect
		Element.prototype.getBoundingClientRect = vi.fn(() => ({
			width: TRIGGER_WIDTH,
			height: TRIGGER_HEIGHT,
			top: TRIGGER_TOP,
			left: TRIGGER_LEFT,
			bottom: TRIGGER_BOTTOM,
			right: TRIGGER_RIGHT,
			x: TRIGGER_X,
			y: TRIGGER_Y,
			toJSON: () => {}
		}));

		fireEvent.click(screen.getByTestId("trigger"));

		const popover = document.getElementById("popup-picker-popover");
		expect(popover).toBeInTheDocument();
		expect(popover).toHaveStyle(`left: ${EXPECTED_LEFT}px`);
		expect(popover).toHaveStyle(`top: ${EXPECTED_TOP}px`);
	});

    it("calculates left position with padding constraint", () => {
		const WINDOW_WIDTH = 500;
		const SCROLL_X = 0;
		const SCROLL_Y = 0;

		const TRIGGER_WIDTH = 10;
		const TRIGGER_HEIGHT = 10;
		const TRIGGER_TOP = 0;
		const TRIGGER_LEFT = 0;
		const TRIGGER_BOTTOM = 10;
		const TRIGGER_RIGHT = 10;
		const TRIGGER_X = 0;
		const TRIGGER_Y = 0;

		const EXPECTED_LEFT = 10;

        vi.stubGlobal("innerWidth", WINDOW_WIDTH);
		vi.stubGlobal("scrollX", SCROLL_X);
		vi.stubGlobal("scrollY", SCROLL_Y);

        Element.prototype.getBoundingClientRect = vi.fn(() => ({
			width: TRIGGER_WIDTH,
			height: TRIGGER_HEIGHT,
			top: TRIGGER_TOP,
			left: TRIGGER_LEFT,
			bottom: TRIGGER_BOTTOM,
			right: TRIGGER_RIGHT,
			x: TRIGGER_X,
			y: TRIGGER_Y,
			toJSON: () => {}
		}));

        render(
			<PopupPicker
				options={mockOptions}
				current="opt1"
				onChange={vi.fn()}
				renderTrigger={({ onClick, ref }) => (
					<button ref={ref} onClick={onClick} data-testid="trigger">
						Trigger
					</button>
				)}
			/>
		);

        fireEvent.click(screen.getByTestId("trigger"));
        const popover = document.getElementById("popup-picker-popover");
		expect(popover).toHaveStyle(`left: ${EXPECTED_LEFT}px`);
    });
});
