import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileActionFor, useFileShortcuts } from "../useFileShortcuts";

const key = (init: Partial<KeyboardEvent>) => ({
	key: "",
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	defaultPrevented: false,
	...init,
});

describe("fileActionFor", () => {
	it("maps Ctrl+S to saving and Ctrl+O to opening, Cmd too", () => {
		expect(fileActionFor(key({ key: "s", ctrlKey: true }))).toBe("saveSession");
		expect(fileActionFor(key({ key: "S", ctrlKey: true }))).toBe("saveSession");
		expect(fileActionFor(key({ key: "o", ctrlKey: true }))).toBe("openFile");
		expect(fileActionFor(key({ key: "s", metaKey: true }))).toBe("saveSession");
	});

	it("ignores the bare keys, other chords and handled events", () => {
		expect(fileActionFor(key({ key: "s" }))).toBeNull();
		expect(fileActionFor(key({ key: "x", ctrlKey: true }))).toBeNull();
		expect(
			fileActionFor(key({ key: "S", ctrlKey: true, shiftKey: true })),
		).toBeNull();
		expect(
			fileActionFor(key({ key: "o", ctrlKey: true, altKey: true })),
		).toBeNull();
		expect(
			fileActionFor(key({ key: "s", ctrlKey: true, defaultPrevented: true })),
		).toBeNull();
	});
});

describe("useFileShortcuts", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const press = (
		init: KeyboardEventInit,
		target: EventTarget = window,
	): KeyboardEvent => {
		const e = new KeyboardEvent("keydown", {
			cancelable: true,
			bubbles: true,
			...init,
		});
		target.dispatchEvent(e);
		return e;
	};

	// Key events arrive in separate tasks; the previous action settles between.
	const settle = () => new Promise((r) => setTimeout(r, 0));

	it("saves on Ctrl+S and opens on Ctrl+O, claiming both keys", async () => {
		const save = vi.fn();
		const open = vi.fn();
		renderHook(() => useFileShortcuts(save, open));

		expect(press({ key: "s", ctrlKey: true }).defaultPrevented).toBe(true);
		expect(save).toHaveBeenCalledTimes(1);
		await settle();
		expect(press({ key: "o", ctrlKey: true }).defaultPrevented).toBe(true);
		expect(open).toHaveBeenCalledTimes(1);
		expect(press({ key: "s" }).defaultPrevented).toBe(false);
		expect(save).toHaveBeenCalledTimes(1);
	});

	it("keeps the browser's dialogs away but stands down in form fields", () => {
		const save = vi.fn();
		renderHook(() => useFileShortcuts(save, vi.fn()));
		const input = document.createElement("textarea");
		document.body.appendChild(input);
		expect(press({ key: "s", ctrlKey: true }, input).defaultPrevented).toBe(true);
		expect(save).not.toHaveBeenCalled();
	});

	it("stands down while a dialog or popover owns the keyboard", () => {
		const open = vi.fn();
		renderHook(() => useFileShortcuts(vi.fn(), open));
		document.body.innerHTML = '<div role="dialog" aria-modal="true"></div>';
		expect(press({ key: "o", ctrlKey: true }).defaultPrevented).toBe(true);
		expect(open).not.toHaveBeenCalled();
	});

	it("ignores auto-repeat and runs one action at a time", async () => {
		let finish: () => void = () => {};
		const save = vi.fn(
			() =>
				new Promise<void>((resolve) => {
					finish = resolve;
				}),
		);
		renderHook(() => useFileShortcuts(save, vi.fn()));

		press({ key: "s", ctrlKey: true });
		press({ key: "s", ctrlKey: true, repeat: true });
		press({ key: "s", ctrlKey: true });
		expect(save).toHaveBeenCalledTimes(1);

		finish();
		await vi.waitFor(() => {
			press({ key: "s", ctrlKey: true });
			expect(save).toHaveBeenCalledTimes(2);
		});
	});

	it("uses the latest handlers and unsubscribes on unmount", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender, unmount } = renderHook(
			({ save }) => useFileShortcuts(save, vi.fn()),
			{ initialProps: { save: first } },
		);
		rerender({ save: second });
		press({ key: "s", ctrlKey: true });
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);

		unmount();
		expect(press({ key: "s", ctrlKey: true }).defaultPrevented).toBe(false);
	});
});
