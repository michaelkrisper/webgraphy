import { afterEach, describe, expect, it } from "vitest";
import { measureKeyAction } from "../measureKeys";

const key = (k: string, over: Partial<KeyboardEvent> = {}) => ({
	key: k,
	ctrlKey: false,
	metaKey: false,
	altKey: false,
	target: document.body as EventTarget | null,
	defaultPrevented: false,
	...over,
});

afterEach(() => {
	document.body.innerHTML = "";
});

describe("measureKeyAction", () => {
	it("maps S to the stats toggle and Escape to clearing pins", () => {
		expect(measureKeyAction(key("s"))).toBe("toggleStats");
		expect(measureKeyAction(key("S"))).toBe("toggleStats");
		expect(measureKeyAction(key("Escape"))).toBe("clearPins");
		expect(measureKeyAction(key("x"))).toBeNull();
	});

	it("ignores typing, modifiers, handled events and open dialogs", () => {
		expect(
			measureKeyAction(key("s", { target: document.createElement("input") })),
		).toBeNull();
		expect(measureKeyAction(key("s", { ctrlKey: true }))).toBeNull();
		expect(
			measureKeyAction(key("Escape", { defaultPrevented: true })),
		).toBeNull();
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.appendChild(dialog);
		expect(measureKeyAction(key("Escape"))).toBeNull();
		expect(measureKeyAction(key("s"))).toBeNull();
	});
});
