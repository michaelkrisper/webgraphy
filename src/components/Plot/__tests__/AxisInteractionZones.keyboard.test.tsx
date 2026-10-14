import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { useGraphStore } from "../../../store/useGraphStore";
import {
	XAxisInteractionZones,
	YAxisInteractionZones,
} from "../AxisInteractionZones";
import { axisZoneLabel } from "../axisZoneLabel";
import type { XAxisLayout } from "../chartTypes";

vi.mock("../../../store/useGraphStore", () => ({
	useGraphStore: {
		getState: vi.fn(),
	},
}));

const xProps = {
	xAxesMetrics: [
		{
			id: "axis-1",
			cumulativeOffset: 0,
			height: 50,
			titleBottom: 40,
			labelBottom: 10,
			secLabelBottom: 25,
			total: 50,
		},
	],
	xAxesLayout: [{ id: "axis-1", title: "Time" } as unknown as XAxisLayout],
	padding: { top: 10, right: 20, bottom: 30, left: 40 },
	editingXAxisId: null,
	setEditingXAxisId: vi.fn(),
	themeColors: {
		fontFamily: "sans-serif",
		labelColor: "#000",
		plotBg: "#fff",
		gridColor: "#ccc",
	},
	onWheel: vi.fn(),
	onMouseDown: vi.fn(),
	onTouchStart: vi.fn(),
	onAutoScaleX: vi.fn(),
	onAxisStep: vi.fn(),
};

const yProps = {
	axes: [{ id: "axis-2", position: "left" as const }],
	titles: { "axis-2": "Voltage / Current" },
	axisLayout: { "axis-2": { total: 40, label: 30 } },
	leftOffsets: {},
	rightOffsets: {},
	padding: { top: 10, right: 20, bottom: 30, left: 40 },
	width: 800,
	containerRef: { current: null },
	onWheel: vi.fn(),
	onMouseDown: vi.fn(),
	onTouchStart: vi.fn(),
	onAutoScaleY: vi.fn(),
	onAxisStep: vi.fn(),
};

function mockUpdateXAxis() {
	const updateXAxis = vi.fn();
	vi.mocked(useGraphStore.getState).mockReturnValue({
		updateXAxis,
	} as unknown as ReturnType<typeof useGraphStore.getState>);
	return updateXAxis;
}

describe("axis zone keyboard access", () => {
	beforeEach(() => vi.clearAllMocks());

	it("names each zone after its axis and the keys it takes", () => {
		expect(axisZoneLabel("x", "axis-1", "Time")).toBe(
			"X axis 1: Time — arrows pan, +/- zoom, A autoscale, Enter rename",
		);
		expect(axisZoneLabel("y", "axis-3", "")).toBe(
			"Y axis 3 — arrows pan, +/- zoom, A autoscale",
		);
	});

	it("makes visible zones focusable groups, not landmarks", () => {
		render(
			<>
				<XAxisInteractionZones {...xProps} />
				<YAxisInteractionZones {...yProps} />
			</>,
		);
		expect(screen.queryAllByRole("region")).toHaveLength(0);
		const x = screen.getByRole("group", { name: /^X axis 1: Time/ });
		const y = screen.getByRole("group", {
			name: /^Y axis 2: Voltage \/ Current/,
		});
		expect(x).toHaveAttribute("tabindex", "0");
		expect(y).toHaveAttribute("tabindex", "0");
	});

	it("hides zero-size zones from assistive technology and the tab order", () => {
		const { container } = render(
			<YAxisInteractionZones
				{...yProps}
				axisLayout={{ "axis-2": { total: 0, label: 0 } }}
			/>,
		);
		expect(screen.queryByRole("group")).toBeNull();
		expect(container.querySelector("[tabindex]")).toBeNull();
	});

	it("pans, zooms, auto-scales and renames the focused X axis", () => {
		render(<XAxisInteractionZones {...xProps} />);
		const zone = screen.getByRole("group", { name: /^X axis 1/ });
		fireEvent.keyDown(zone, { key: "ArrowRight" });
		fireEvent.keyDown(zone, { key: "ArrowLeft" });
		fireEvent.keyDown(zone, { key: "+" });
		fireEvent.keyDown(zone, { key: "-" });
		expect(xProps.onAxisStep.mock.calls).toEqual([
			["axis-1", "pan+"],
			["axis-1", "pan-"],
			["axis-1", "zoom-in"],
			["axis-1", "zoom-out"],
		]);
		fireEvent.keyDown(zone, { key: "a" });
		expect(xProps.onAutoScaleX).toHaveBeenCalledWith("axis-1");
		fireEvent.keyDown(zone, { key: "Enter" });
		expect(xProps.setEditingXAxisId).toHaveBeenCalledWith("axis-1");
	});

	it("keeps handled keys from reaching the window-level chart shortcuts", () => {
		const onWindowKey = vi.fn();
		window.addEventListener("keydown", onWindowKey);
		render(<XAxisInteractionZones {...xProps} />);
		const zone = screen.getByRole("group", { name: /^X axis 1/ });
		fireEvent.keyDown(zone, { key: "ArrowRight" });
		expect(onWindowKey).not.toHaveBeenCalled();
		// Up/Down are not X-axis keys: they fall through to the chart.
		fireEvent.keyDown(zone, { key: "ArrowUp" });
		expect(onWindowKey).toHaveBeenCalledTimes(1);
		expect(xProps.onAxisStep).toHaveBeenCalledTimes(1);
		window.removeEventListener("keydown", onWindowKey);
	});

	it("leaves Ctrl-modified keys to the chart", () => {
		render(<XAxisInteractionZones {...xProps} />);
		const zone = screen.getByRole("group", { name: /^X axis 1/ });
		fireEvent.keyDown(zone, { key: "+", ctrlKey: true });
		expect(xProps.onAxisStep).not.toHaveBeenCalled();
	});

	it("pans, zooms and auto-scales the focused Y axis, with no rename", () => {
		render(<YAxisInteractionZones {...yProps} />);
		const zone = screen.getByRole("group", { name: /^Y axis 2/ });
		fireEvent.keyDown(zone, { key: "ArrowUp" });
		fireEvent.keyDown(zone, { key: "ArrowDown" });
		fireEvent.keyDown(zone, { key: "=" });
		fireEvent.keyDown(zone, { key: "A" });
		fireEvent.keyDown(zone, { key: "Enter" });
		expect(yProps.onAxisStep.mock.calls).toEqual([
			["axis-2", "pan+"],
			["axis-2", "pan-"],
			["axis-2", "zoom-in"],
		]);
		expect(yProps.onAutoScaleY).toHaveBeenCalledWith("axis-2");
	});

	it("focuses the rename input and returns focus to the zone on Enter", () => {
		const updateXAxis = mockUpdateXAxis();
		render(<XAxisInteractionZones {...xProps} editingXAxisId="axis-1" />);
		const input = screen.getByRole("textbox", { name: "Rename X axis 1" });
		expect(input).toHaveFocus();
		fireEvent.change(input, { target: { value: "Seconds" } });
		fireEvent.keyDown(input, { key: "Enter" });
		expect(updateXAxis).toHaveBeenCalledWith("axis-1", { name: "Seconds" });
		expect(screen.getByRole("group", { name: /^X axis 1/ })).toHaveFocus();
	});

	it("does not commit the name when Escape cancels the rename", () => {
		const updateXAxis = mockUpdateXAxis();
		render(<XAxisInteractionZones {...xProps} editingXAxisId="axis-1" />);
		const input = screen.getByRole("textbox", { name: "Rename X axis 1" });
		fireEvent.change(input, { target: { value: "Discard me" } });
		fireEvent.keyDown(input, { key: "Escape" });
		expect(updateXAxis).not.toHaveBeenCalled();
		expect(xProps.setEditingXAxisId).toHaveBeenCalledWith(null);
		expect(screen.getByRole("group", { name: /^X axis 1/ })).toHaveFocus();
	});

	it("has no axe violations", async () => {
		const { container } = render(
			<main>
				<XAxisInteractionZones {...xProps} />
				<YAxisInteractionZones {...yProps} />
			</main>,
		);
		expect(await axe(container)).toHaveNoViolations();
	});
});
