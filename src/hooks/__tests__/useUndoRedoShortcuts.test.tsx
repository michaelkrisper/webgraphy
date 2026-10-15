import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useGraphStore } from "../../store/useGraphStore";
import {
	undoRedoActionFor,
	useUndoRedoShortcuts,
} from "../useUndoRedoShortcuts";

const key = (
	k: string,
	mods: Partial<
		Pick<KeyboardEvent, "ctrlKey" | "metaKey" | "shiftKey" | "altKey">
	> = {},
	target: EventTarget | null = document.body,
) => ({
	key: k,
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	target,
	...mods,
});

describe("undoRedoActionFor", () => {
	it("maps Ctrl/Cmd+Z to undo and Ctrl+Shift+Z / Ctrl+Y to redo", () => {
		expect(undoRedoActionFor(key("z", { ctrlKey: true }))).toBe("undo");
		expect(undoRedoActionFor(key("z", { metaKey: true }))).toBe("undo");
		expect(undoRedoActionFor(key("Z", { ctrlKey: true, shiftKey: true }))).toBe(
			"redo",
		);
		expect(undoRedoActionFor(key("y", { ctrlKey: true }))).toBe("redo");
	});

	it("ignores unmodified keys and other combos", () => {
		expect(undoRedoActionFor(key("z"))).toBeNull();
		expect(
			undoRedoActionFor(key("z", { ctrlKey: true, altKey: true })),
		).toBeNull();
		expect(undoRedoActionFor(key("x", { ctrlKey: true }))).toBeNull();
	});

	it.each([
		["input", () => document.createElement("input")],
		["textarea", () => document.createElement("textarea")],
		["select", () => document.createElement("select")],
	])("leaves %s targets to native undo", (_, make) => {
		expect(undoRedoActionFor(key("z", { ctrlKey: true }, make()))).toBeNull();
		expect(undoRedoActionFor(key("y", { ctrlKey: true }, make()))).toBeNull();
	});
});

describe("useUndoRedoShortcuts", () => {
	const undo = vi.fn();
	const redo = vi.fn();
	beforeEach(() => {
		useGraphStore.setState({ undo, redo });
	});
	afterEach(() => vi.clearAllMocks());

	it("dispatches to the store and prevents the browser default", () => {
		const { unmount } = renderHook(() => useUndoRedoShortcuts());
		const ev = new KeyboardEvent("keydown", {
			key: "z",
			ctrlKey: true,
			cancelable: true,
		});
		window.dispatchEvent(ev);
		expect(undo).toHaveBeenCalledTimes(1);
		expect(ev.defaultPrevented).toBe(true);

		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "y", ctrlKey: true }),
		);
		expect(redo).toHaveBeenCalledTimes(1);

		unmount();
		window.dispatchEvent(
			new KeyboardEvent("keydown", { key: "z", ctrlKey: true }),
		);
		expect(undo).toHaveBeenCalledTimes(1);
	});

	it("does not fire from a focused text field", () => {
		renderHook(() => useUndoRedoShortcuts());
		const input = document.createElement("input");
		document.body.appendChild(input);
		input.dispatchEvent(
			new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true }),
		);
		expect(undo).not.toHaveBeenCalled();
		input.remove();
	});
});
