import "@testing-library/jest-dom";
import {
	act,
	fireEvent,
	render,
	renderHook,
	screen,
} from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	clampSidebarWidth,
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
	SIDEBAR_WIDTH_KEY,
	useSidebarWidth,
} from "../../../hooks/useSidebarWidth";
import { SidebarResizer } from "../SidebarResizer";

afterEach(() => localStorage.clear());

describe("clampSidebarWidth", () => {
	it("keeps the width between the minimum and what leaves the plot room", () => {
		expect(clampSidebarWidth(100, 1600)).toBe(SIDEBAR_MIN_WIDTH);
		expect(clampSidebarWidth(500.4, 1600)).toBe(500);
		expect(clampSidebarWidth(5000, 1600)).toBe(720);
		expect(clampSidebarWidth(700, 1000)).toBe(600);
		// A tiny window never pushes the maximum below the minimum.
		expect(clampSidebarWidth(700, 500)).toBe(SIDEBAR_MIN_WIDTH);
	});
});

describe("useSidebarWidth", () => {
	it("starts at the default and stores only committed, non-default widths", () => {
		const { result } = renderHook(() => useSidebarWidth());
		expect(result.current.width).toBe(SIDEBAR_DEFAULT_WIDTH);

		act(() => result.current.setWidth(450));
		expect(result.current.width).toBe(450);
		expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBeNull();

		act(() => result.current.commit(460));
		expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBe("460");

		act(() => result.current.commit(SIDEBAR_DEFAULT_WIDTH));
		expect(localStorage.getItem(SIDEBAR_WIDTH_KEY)).toBeNull();
	});

	it("restores a stored width and ignores garbage", () => {
		localStorage.setItem(SIDEBAR_WIDTH_KEY, "480");
		expect(renderHook(() => useSidebarWidth()).result.current.width).toBe(480);
		localStorage.setItem(SIDEBAR_WIDTH_KEY, "wide");
		expect(renderHook(() => useSidebarWidth()).result.current.width).toBe(
			SIDEBAR_DEFAULT_WIDTH,
		);
	});
});

describe("SidebarResizer", () => {
	const setup = (width = 400) => {
		const onResize = vi.fn();
		const onCommit = vi.fn();
		render(
			<SidebarResizer
				width={width}
				maxWidth={720}
				onResize={onResize}
				onCommit={onCommit}
			/>,
		);
		return {
			onResize,
			onCommit,
			edge: screen.getByRole("separator", { name: "Sidebar width" }),
		};
	};

	it("is a focusable, described separator with its current value", () => {
		const { edge } = setup(420);
		expect(edge).toHaveAttribute("tabindex", "0");
		expect(edge).toHaveAttribute("aria-valuenow", "420");
		expect(edge).toHaveAccessibleDescription(/arrow keys/);
	});

	it("widens with Left, narrows with Right, resets with Home, and keeps the keys from the chart", () => {
		const { edge, onCommit } = setup(400);
		const onWindowKey = vi.fn();
		window.addEventListener("keydown", onWindowKey);
		fireEvent.keyDown(edge, { key: "ArrowLeft" });
		fireEvent.keyDown(edge, { key: "ArrowRight" });
		fireEvent.keyDown(edge, { key: "Home" });
		window.removeEventListener("keydown", onWindowKey);
		expect(onCommit.mock.calls).toEqual([[416], [384], [SIDEBAR_DEFAULT_WIDTH]]);
		expect(onWindowKey).not.toHaveBeenCalled();
	});

	it("lets other keys and modified arrows through", () => {
		const { edge, onCommit } = setup();
		fireEvent.keyDown(edge, { key: "ArrowUp" });
		fireEvent.keyDown(edge, { key: "ArrowLeft", altKey: true });
		expect(onCommit).not.toHaveBeenCalled();
	});

	it("follows a drag and commits where it ends; double-click resets", () => {
		const { edge, onResize, onCommit } = setup(400);
		edge.setPointerCapture = vi.fn();
		fireEvent.pointerDown(edge, { button: 0, clientX: 1000, pointerId: 1 });
		fireEvent.pointerMove(edge, { clientX: 950, pointerId: 1 });
		expect(onResize).toHaveBeenLastCalledWith(450);
		fireEvent.pointerUp(edge, { clientX: 1020, pointerId: 1 });
		expect(onCommit).toHaveBeenLastCalledWith(380);
		// Without a drag in progress, moves do nothing.
		fireEvent.pointerMove(edge, { clientX: 900, pointerId: 1 });
		expect(onResize).toHaveBeenCalledTimes(1);

		fireEvent.doubleClick(edge);
		expect(onCommit).toHaveBeenLastCalledWith(SIDEBAR_DEFAULT_WIDTH);
	});

	it("reverts to the start width when the drag is cancelled", () => {
		const { edge, onCommit } = setup(400);
		edge.setPointerCapture = vi.fn();
		fireEvent.pointerDown(edge, { button: 0, clientX: 1000, pointerId: 1 });
		fireEvent.pointerMove(edge, { clientX: 900, pointerId: 1 });
		fireEvent.pointerCancel(edge, { pointerId: 1 });
		expect(onCommit).toHaveBeenLastCalledWith(400);
	});
});
