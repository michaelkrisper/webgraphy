import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "../../../../store/useNotificationStore";
import { copySnap, shouldCopyTooltip, snapToText } from "../copyTooltip";
import type { SnapResult } from "../types";

const key = (over: Partial<KeyboardEvent> = {}) => ({
	key: "c",
	ctrlKey: true,
	metaKey: false,
	altKey: false,
	target: document.body as EventTarget | null,
	defaultPrevented: false,
	...over,
});

const snap: SnapResult = {
	snapScreenX: 0,
	snapX: 4,
	snapXAxisId: "axis-1",
	entries: [
		{
			xLabel: "4",
			xAxisName: "Time",
			items: [
				{
					seriesId: "s1",
					label: "Temp",
					value: 21.5,
					xValue: 4,
					xAxisId: "axis-1",
					yAxisId: "axis-1",
					color: "#f00",
					yScreen: 0,
					xScreen: 0,
					pointStyle: "circle",
					lineStyle: "solid",
				},
			],
		},
	],
};

afterEach(() => {
	document.body.innerHTML = "";
	window.getSelection()?.removeAllRanges();
	useNotificationStore.setState({ notifications: [] });
	vi.unstubAllGlobals();
});

describe("shouldCopyTooltip", () => {
	it("copies on Ctrl+C (or Cmd+C) over the page", () => {
		expect(shouldCopyTooltip(key())).toBe(true);
		expect(shouldCopyTooltip(key({ key: "C" }))).toBe(true);
		expect(shouldCopyTooltip(key({ ctrlKey: false, metaKey: true }))).toBe(true);
	});

	it("ignores other keys and modifiers", () => {
		expect(shouldCopyTooltip(key({ ctrlKey: false }))).toBe(false);
		expect(shouldCopyTooltip(key({ key: "v" }))).toBe(false);
		expect(shouldCopyTooltip(key({ altKey: true }))).toBe(false);
		expect(shouldCopyTooltip(key({ defaultPrevented: true }))).toBe(false);
	});

	it("leaves Ctrl+C to focused text controls (e.g. the formula editor)", () => {
		for (const tag of ["input", "textarea", "select"] as const) {
			expect(shouldCopyTooltip(key({ target: document.createElement(tag) }))).toBe(
				false,
			);
		}
		const editable = document.createElement("div");
		Object.defineProperty(editable, "isContentEditable", { value: true });
		expect(shouldCopyTooltip(key({ target: editable }))).toBe(false);
	});

	it("does nothing while a dialog is open", () => {
		const dialog = document.createElement("div");
		dialog.setAttribute("aria-modal", "true");
		document.body.appendChild(dialog);
		expect(shouldCopyTooltip(key())).toBe(false);
	});

	it("keeps the browser's copy when text is selected", () => {
		const p = document.createElement("p");
		p.textContent = "selected text";
		document.body.appendChild(p);
		const range = document.createRange();
		range.selectNodeContents(p);
		window.getSelection()?.addRange(range);
		expect(shouldCopyTooltip(key())).toBe(false);

		window.getSelection()?.removeAllRanges();
		expect(shouldCopyTooltip(key())).toBe(true);
	});
});

describe("copySnap", () => {
	beforeEach(() => {
		useNotificationStore.setState({ notifications: [] });
	});

	it("writes the tooltip text and confirms with a toast", async () => {
		const writeText = vi.fn().mockResolvedValue(undefined);
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		await expect(copySnap(snap)).resolves.toBe(true);
		expect(writeText).toHaveBeenCalledWith(snapToText(snap));
		expect(snapToText(snap)).toBe("Time: 4\nTemp: 21.5");
		expect(useNotificationStore.getState().notifications[0]).toMatchObject({
			kind: "success",
		});
	});

	it("reports a rejected write instead of throwing", async () => {
		const writeText = vi.fn().mockRejectedValue(new Error("denied"));
		vi.stubGlobal("navigator", { clipboard: { writeText } });
		await expect(copySnap(snap)).resolves.toBe(false);
		expect(useNotificationStore.getState().notifications[0]).toMatchObject({
			kind: "error",
		});
	});

	it("reports a missing clipboard API", async () => {
		vi.stubGlobal("navigator", {});
		await expect(copySnap(snap)).resolves.toBe(false);
		expect(useNotificationStore.getState().notifications[0].kind).toBe("error");
	});
});
