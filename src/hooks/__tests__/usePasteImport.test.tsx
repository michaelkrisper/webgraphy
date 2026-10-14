import { renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "../../store/useNotificationStore";
import { handlePaste, usePasteImport } from "../usePasteImport";

const TABLE = "Time\tValue\n1\t2\n2\t4";

function pasteEvent(text: string, target: EventTarget = document.body) {
	const preventDefault = vi.fn();
	return {
		target,
		clipboardData: {
			getData: (type: string) => (type === "text/plain" ? text : ""),
		},
		preventDefault,
	} as unknown as ClipboardEvent & { preventDefault: typeof preventDefault };
}

const toasts = () => useNotificationStore.getState().notifications;

describe("handlePaste", () => {
	beforeEach(() => {
		useNotificationStore.setState({ notifications: [] });
	});

	it("imports spreadsheet cells as a timestamped .tsv file", async () => {
		const importFiles = vi.fn();
		const e = pasteEvent(TABLE);
		handlePaste(e, importFiles, new Date(2026, 9, 14, 21, 3));
		expect(e.preventDefault).toHaveBeenCalled();
		expect(importFiles).toHaveBeenCalledTimes(1);
		const [file] = importFiles.mock.calls[0][0] as File[];
		expect(file.name).toBe("Pasted data (21:03).tsv");
		expect(await file.text()).toBe(TABLE);
		expect(toasts()).toHaveLength(0);
	});

	it.each([
		["input", () => document.createElement("input")],
		["textarea", () => document.createElement("textarea")],
		["select", () => document.createElement("select")],
	])("leaves a paste into a %s alone", (_name, make) => {
		const importFiles = vi.fn();
		const e = pasteEvent(TABLE, make());
		handlePaste(e, importFiles);
		expect(importFiles).not.toHaveBeenCalled();
		expect(e.preventDefault).not.toHaveBeenCalled();
		expect(toasts()).toHaveLength(0);
	});

	it("explains non-tabular text with an info toast", () => {
		const importFiles = vi.fn();
		handlePaste(pasteEvent("just some words"), importFiles);
		expect(importFiles).not.toHaveBeenCalled();
		expect(toasts()).toEqual([
			expect.objectContaining({
				kind: "info",
				message: expect.stringContaining("not a table"),
			}),
		]);
	});

	it("ignores an empty clipboard silently", () => {
		const importFiles = vi.fn();
		handlePaste(pasteEvent("  \n"), importFiles);
		expect(importFiles).not.toHaveBeenCalled();
		expect(toasts()).toHaveLength(0);
	});
});

describe("usePasteImport", () => {
	const dispatchPaste = (target: EventTarget, text: string) => {
		const event = new Event("paste", { bubbles: true }) as ClipboardEvent;
		Object.defineProperty(event, "clipboardData", {
			value: { getData: () => text },
		});
		target.dispatchEvent(event);
	};

	it("listens for paste events while mounted", () => {
		const importFiles = vi.fn();
		const { unmount } = renderHook(() => usePasteImport(importFiles));
		dispatchPaste(document.body, TABLE);
		expect(importFiles).toHaveBeenCalledTimes(1);

		unmount();
		dispatchPaste(document.body, TABLE);
		expect(importFiles).toHaveBeenCalledTimes(1);
	});

	it("skips pastes into form fields", () => {
		const importFiles = vi.fn();
		renderHook(() => usePasteImport(importFiles));
		const input = document.createElement("input");
		document.body.appendChild(input);
		dispatchPaste(input, TABLE);
		input.remove();
		expect(importFiles).not.toHaveBeenCalled();
	});
});
