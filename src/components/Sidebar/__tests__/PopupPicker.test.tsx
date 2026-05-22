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
				renderTrigger={({ onClick, ref, isOpen }) => (
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
		// Mock innerWidth
		vi.stubGlobal("innerWidth", 1000);
		vi.stubGlobal("scrollX", 0);
		vi.stubGlobal("scrollY", 0);

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
			width: 100,
			height: 40,
			top: 100,
			left: 900,
			bottom: 140,
			right: 1000,
			x: 900,
			y: 100,
			toJSON: () => {}
		}));

		fireEvent.click(screen.getByTestId("trigger"));

		const popover = document.getElementById("popup-picker-popover");
		expect(popover).toBeInTheDocument();
		expect(popover).toHaveStyle("left: 860px");
		expect(popover).toHaveStyle("top: 144px");
	});

    it("calculates left position with padding constraint", () => {
        vi.stubGlobal("innerWidth", 500);
		vi.stubGlobal("scrollX", 0);
		vi.stubGlobal("scrollY", 0);

        Element.prototype.getBoundingClientRect = vi.fn(() => ({
			width: 10,
			height: 10,
			top: 0,
			left: 0,
			bottom: 10,
			right: 10,
			x: 0,
			y: 0,
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
		expect(popover).toHaveStyle("left: 10px");
    });
});
