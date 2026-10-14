import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	applyAxisRange,
	useZoomHistory,
	viewNavActionFor,
} from "../useZoomHistory";

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

describe("viewNavActionFor", () => {
	it("maps Alt+Left / Alt+Right to back / forward", () => {
		expect(viewNavActionFor(key({ key: "ArrowLeft", altKey: true }))).toBe(
			"back",
		);
		expect(viewNavActionFor(key({ key: "ArrowRight", altKey: true }))).toBe(
			"forward",
		);
	});

	it("needs Alt alone and leaves plain arrows to panning", () => {
		expect(viewNavActionFor(key({ key: "ArrowLeft" }))).toBeNull();
		for (const mod of ["ctrlKey", "metaKey", "shiftKey"]) {
			expect(
				viewNavActionFor(key({ key: "ArrowLeft", altKey: true, [mod]: true })),
			).toBeNull();
		}
		expect(viewNavActionFor(key({ key: "ArrowUp", altKey: true }))).toBeNull();
		expect(
			viewNavActionFor(
				key({ key: "ArrowLeft", altKey: true, defaultPrevented: true }),
			),
		).toBeNull();
	});

	it("leaves the keys to text fields", () => {
		for (const tag of ["input", "textarea", "select"]) {
			const target = document.createElement(tag);
			expect(
				viewNavActionFor(key({ key: "ArrowLeft", altKey: true, target })),
			).toBeNull();
		}
	});
});

describe("applyAxisRange", () => {
	it("writes the range to the store and the matching target ref", () => {
		const store = { xAxes: [], yAxes: [], batchUpdateAxes: vi.fn() };
		const tx = { "axis-1": { min: 0, max: 1 } };
		const ty = {};
		applyAxisRange(store, tx, ty, "y", "axis-2", { min: 5, max: 9 });
		expect(ty).toEqual({ "axis-2": { min: 5, max: 9 } });
		expect(tx).toEqual({ "axis-1": { min: 0, max: 1 } });
		expect(store.batchUpdateAxes).toHaveBeenCalledWith(
			{},
			{ "axis-2": { min: 5, max: 9 } },
		);
		applyAxisRange(store, tx, ty, "x", "axis-1", { min: -1, max: 1 });
		expect(tx["axis-1"]).toEqual({ min: -1, max: 1 });
		expect(store.batchUpdateAxes).toHaveBeenLastCalledWith(
			{ "axis-1": { min: -1, max: 1 } },
			{},
		);
	});
});

describe("useZoomHistory shortcuts", () => {
	afterEach(() => {
		document.body.innerHTML = "";
	});

	const setup = (enabled = true) => {
		const ref = <T,>(current: T) => ({ current });
		const syncViewport = vi.fn();
		const hook = renderHook(() =>
			useZoomHistory({
				targetXAxes: ref({}),
				targetYs: ref({}),
				displayedXAxes: ref({}),
				displayedYs: ref({}),
				smoothZoomRef: ref(false),
				syncViewport,
				enabled,
			}),
		);
		return { ...hook, syncViewport };
	};
	const press = () => {
		const e = new KeyboardEvent("keydown", {
			key: "ArrowLeft",
			altKey: true,
			cancelable: true,
		});
		window.dispatchEvent(e);
		return e;
	};

	it("claims Alt+Left even with an empty history", () => {
		setup();
		expect(press().defaultPrevented).toBe(true);
	});

	it("stays out of the way while a dialog is open or with no data", () => {
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.appendChild(dialog);
		const { unmount } = setup();
		expect(press().defaultPrevented).toBe(false);
		unmount();
		dialog.remove();
		setup(false);
		expect(press().defaultPrevented).toBe(false);
	});
});
