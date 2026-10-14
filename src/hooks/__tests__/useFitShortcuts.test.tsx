import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fitActionFor, useFitShortcuts } from "../useFitShortcuts";

const key = (init: KeyboardEventInit & { target?: EventTarget | null }) => ({
	key: "",
	ctrlKey: false,
	metaKey: false,
	shiftKey: false,
	altKey: false,
	target: document.body,
	defaultPrevented: false,
	...init,
});

describe("fitActionFor", () => {
	it("maps Home to Fit All and Shift+Home to Stacked Fit", () => {
		expect(fitActionFor(key({ key: "Home" }))).toBe("fitAll");
		expect(fitActionFor(key({ key: "Home", shiftKey: true }))).toBe("stackedFit");
	});

	it("ignores other keys, modifier chords and handled events", () => {
		expect(fitActionFor(key({ key: "End" }))).toBeNull();
		expect(fitActionFor(key({ key: "Home", ctrlKey: true }))).toBeNull();
		expect(fitActionFor(key({ key: "Home", metaKey: true }))).toBeNull();
		expect(fitActionFor(key({ key: "Home", altKey: true }))).toBeNull();
		expect(fitActionFor(key({ key: "Home", defaultPrevented: true }))).toBeNull();
	});

	it("leaves Home to text fields", () => {
		const input = document.createElement("input");
		expect(fitActionFor(key({ key: "Home", target: input }))).toBeNull();
	});
});

describe("useFitShortcuts", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const press = (init: KeyboardEventInit) => {
		const e = new KeyboardEvent("keydown", { cancelable: true, ...init });
		window.dispatchEvent(e);
		return e;
	};

	it("runs the matching fit and claims the key", () => {
		const fitAll = vi.fn();
		const stacked = vi.fn();
		renderHook(() => useFitShortcuts(fitAll, stacked, true));

		expect(press({ key: "Home" }).defaultPrevented).toBe(true);
		expect(fitAll).toHaveBeenCalledTimes(1);
		press({ key: "Home", shiftKey: true });
		expect(stacked).toHaveBeenCalledTimes(1);
		expect(fitAll).toHaveBeenCalledTimes(1);
	});

	it("uses the latest handlers without re-subscribing", () => {
		const first = vi.fn();
		const second = vi.fn();
		const { rerender } = renderHook(
			({ fn }) => useFitShortcuts(fn, vi.fn(), true),
			{ initialProps: { fn: first } },
		);
		rerender({ fn: second });
		press({ key: "Home" });
		expect(first).not.toHaveBeenCalled();
		expect(second).toHaveBeenCalledTimes(1);
	});

	it("does nothing while disabled or while a dialog is open", () => {
		const fitAll = vi.fn();
		const { rerender } = renderHook(
			({ enabled }) => useFitShortcuts(fitAll, vi.fn(), enabled),
			{ initialProps: { enabled: false } },
		);
		expect(press({ key: "Home" }).defaultPrevented).toBe(false);

		rerender({ enabled: true });
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.appendChild(dialog);
		expect(press({ key: "Home" }).defaultPrevented).toBe(false);
		expect(fitAll).not.toHaveBeenCalled();
	});
});
