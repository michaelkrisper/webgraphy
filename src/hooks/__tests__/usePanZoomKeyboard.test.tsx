import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePanZoomKeyboard } from "../usePanZoomKeyboard";

function setupHook() {
	const syncViewport = vi.fn();
	const setIsCtrlPressed = vi.fn();
	const setIsShiftPressed = vi.fn();
	const { result, unmount } = renderHook(() => {
		const pressedKeys = useRef<Set<string>>(new Set());
		usePanZoomKeyboard({
			pressedKeys,
			syncViewport,
			setIsCtrlPressed,
			setIsShiftPressed,
		});
		return pressedKeys;
	});
	return {
		pressedKeys: result.current.current,
		syncViewport,
		setIsCtrlPressed,
		setIsShiftPressed,
		unmount,
	};
}

function dispatchKey(
	type: "keydown" | "keyup",
	key: string,
	opts: { ctrl?: boolean; target?: HTMLElement } = {},
) {
	const ev = new KeyboardEvent(type, {
		key,
		ctrlKey: !!opts.ctrl,
		bubbles: true,
		cancelable: true,
	});
	if (opts.target) {
		Object.defineProperty(ev, "target", { value: opts.target });
	}
	window.dispatchEvent(ev);
	return ev;
}

describe("usePanZoomKeyboard", () => {
	afterEach(() => vi.restoreAllMocks());

	it("reports Control and Shift modifier state", () => {
		const { setIsCtrlPressed, setIsShiftPressed } = setupHook();
		act(() => {
			dispatchKey("keydown", "Control");
			dispatchKey("keydown", "Shift");
			dispatchKey("keyup", "Control");
		});
		expect(setIsCtrlPressed).toHaveBeenCalledWith(true);
		expect(setIsShiftPressed).toHaveBeenCalledWith(true);
		expect(setIsCtrlPressed).toHaveBeenLastCalledWith(false);
	});

	it("kicks syncViewport on arrow keys and +/-", () => {
		const { syncViewport } = setupHook();
		act(() => {
			dispatchKey("keydown", "ArrowLeft");
			dispatchKey("keydown", "+");
		});
		expect(syncViewport).toHaveBeenCalledTimes(2);
	});

	it("does not kick syncViewport on unrelated keys", () => {
		const { syncViewport } = setupHook();
		act(() => dispatchKey("keydown", "a"));
		expect(syncViewport).not.toHaveBeenCalled();
	});

	it("ignores key events from editable targets", () => {
		const { syncViewport, pressedKeys } = setupHook();
		const input = document.createElement("input");
		act(() => dispatchKey("keydown", "ArrowLeft", { target: input }));
		expect(syncViewport).not.toHaveBeenCalled();
		expect(pressedKeys.has("ArrowLeft")).toBe(false);
	});

	it("removes keys from pressedKeys on keyup", () => {
		const { pressedKeys } = setupHook();
		act(() => dispatchKey("keydown", "ArrowRight"));
		expect(pressedKeys.has("ArrowRight")).toBe(true);
		act(() => dispatchKey("keyup", "ArrowRight"));
		expect(pressedKeys.has("ArrowRight")).toBe(false);
	});

	it("calls preventDefault on Ctrl+= and Ctrl+- so the browser does not zoom", () => {
		setupHook();
		let ev: KeyboardEvent;
		act(() => {
			ev = dispatchKey("keydown", "=", { ctrl: true });
		});
		// biome-ignore lint/style/noNonNullAssertion: assigned in act
		expect(ev!.defaultPrevented).toBe(true);
	});

	it("unregisters listeners on unmount", () => {
		const { syncViewport, unmount } = setupHook();
		unmount();
		act(() => dispatchKey("keydown", "ArrowLeft"));
		expect(syncViewport).not.toHaveBeenCalled();
	});
});
