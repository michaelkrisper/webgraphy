import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWindowFileDrop } from "../useWindowFileDrop";

type DragType = "dragenter" | "dragover" | "dragleave" | "drop";

/** jsdom has no DragEvent/DataTransfer; a plain event carries a stand-in. */
function drag(
	type: DragType,
	{
		files = [] as File[],
		types = files.length > 0 ? ["Files"] : ["text/plain"],
		target = document.body as EventTarget,
	} = {},
) {
	const dataTransfer = { types, files, dropEffect: "none" };
	const ev = new Event(type, { bubbles: true, cancelable: true });
	Object.defineProperty(ev, "dataTransfer", { value: dataTransfer });
	act(() => {
		target.dispatchEvent(ev);
	});
	return { ev, dataTransfer };
}

const csv = () => new File(["a,b"], "a.csv", { type: "text/csv" });

function setup() {
	const onFiles = vi.fn();
	const hook = renderHook(() => useWindowFileDrop(onFiles));
	return { onFiles, hook };
}

describe("useWindowFileDrop", () => {
	afterEach(() => {
		for (const el of document.querySelectorAll("[data-test-overlay]"))
			el.remove();
	});

	it("routes every file dropped anywhere to the import", () => {
		const { onFiles, hook } = setup();
		const files = [csv(), new File(["{}"], "b.json")];
		const { ev } = drag("drop", { files });
		expect(ev.defaultPrevented).toBe(true);
		expect(onFiles).toHaveBeenCalledWith(files);
		expect(hook.result.current).toBe(false);
	});

	it("accepts a file drag with a copy cursor and highlights", () => {
		const { hook } = setup();
		const { ev, dataTransfer } = drag("dragover", { files: [csv()] });
		expect(ev.defaultPrevented).toBe(true);
		expect(dataTransfer.dropEffect).toBe("copy");
		expect(hook.result.current).toBe(true);
	});

	it("keeps the highlight while moving between elements, drops it on leaving", () => {
		const { hook } = setup();
		const child = document.body.appendChild(document.createElement("div"));
		child.setAttribute("data-test-overlay", "");
		drag("dragenter", { files: [csv()] });
		// Entering a child fires before leaving the parent.
		drag("dragenter", { files: [csv()], target: child });
		drag("dragleave", { files: [csv()] });
		expect(hook.result.current).toBe(true);
		drag("dragleave", { files: [csv()], target: child });
		expect(hook.result.current).toBe(false);
	});

	it("leaves text and other non-file drags alone", () => {
		const { onFiles, hook } = setup();
		expect(drag("dragenter").ev.defaultPrevented).toBe(false);
		expect(drag("dragover").ev.defaultPrevented).toBe(false);
		expect(drag("drop").ev.defaultPrevented).toBe(false);
		expect(hook.result.current).toBe(false);
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("declines drops into text inputs without letting the browser open the file", () => {
		const { onFiles, hook } = setup();
		const input = document.body.appendChild(document.createElement("input"));
		input.setAttribute("data-test-overlay", "");
		const over = drag("dragover", { files: [csv()], target: input });
		expect(over.ev.defaultPrevented).toBe(true);
		expect(over.dataTransfer.dropEffect).toBe("none");
		expect(hook.result.current).toBe(false);
		expect(
			drag("drop", { files: [csv()], target: input }).ev.defaultPrevented,
		).toBe(true);
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("declines drops while a dialog is open", () => {
		const { onFiles, hook } = setup();
		const dialog = document.body.appendChild(document.createElement("div"));
		dialog.setAttribute("aria-modal", "true");
		dialog.setAttribute("data-test-overlay", "");
		drag("dragenter", { files: [csv()] });
		expect(hook.result.current).toBe(false);
		drag("drop", { files: [csv()] });
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("ignores a file drag that carries no files on drop", () => {
		const { onFiles } = setup();
		drag("drop", { types: ["Files"] });
		expect(onFiles).not.toHaveBeenCalled();
	});

	it("unregisters on unmount", () => {
		const { onFiles, hook } = setup();
		hook.unmount();
		const { ev } = drag("drop", { files: [csv()] });
		expect(ev.defaultPrevented).toBe(false);
		expect(onFiles).not.toHaveBeenCalled();
	});
});
