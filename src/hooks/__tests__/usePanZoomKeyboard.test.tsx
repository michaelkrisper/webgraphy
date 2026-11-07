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
	opts: { ctrl?: boolean; alt?: boolean; target?: HTMLElement } = {},
) {
	const ev = new KeyboardEvent(type, {
		key,
		ctrlKey: !!opts.ctrl,
		altKey: !!opts.alt,
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

	it("kicks syncViewport on the = and _ zoom aliases too", () => {
		const { syncViewport } = setupHook();
		act(() => {
			dispatchKey("keydown", "=");
			dispatchKey("keydown", "_");
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

	it("leaves Alt+arrows to the zoom history instead of panning", () => {
		const { syncViewport, pressedKeys } = setupHook();
		act(() => dispatchKey("keydown", "ArrowLeft", { alt: true }));
		expect(syncViewport).not.toHaveBeenCalled();
		expect(pressedKeys.has("ArrowLeft")).toBe(false);
	});

	const openOverlay = (attrs: Record<string, string>) => {
		const el = document.createElement("div");
		for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
		document.body.appendChild(el);
		return el;
	};

	it.each([
		["dialog", { role: "dialog", "aria-modal": "true" }],
		["popover", { class: "popup-picker-popover" }],
	])("leaves arrows and +/- to an open %s", (_label, attrs) => {
		const { syncViewport, pressedKeys } = setupHook();
		const overlay = openOverlay(attrs);
		try {
			act(() => {
				dispatchKey("keydown", "ArrowLeft");
				dispatchKey("keydown", "+");
			});
			expect(syncViewport).not.toHaveBeenCalled();
			expect(pressedKeys.size).toBe(0);
		} finally {
			overlay.remove();
		}
	});

	it("still releases a key held while a dialog opened", () => {
		const { pressedKeys } = setupHook();
		act(() => dispatchKey("keydown", "ArrowRight"));
		const overlay = openOverlay({ "aria-modal": "true" });
		try {
			act(() => dispatchKey("keyup", "ArrowRight"));
			expect(pressedKeys.has("ArrowRight")).toBe(false);
		} finally {
			overlay.remove();
		}
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
