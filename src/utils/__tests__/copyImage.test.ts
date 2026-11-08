import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "../../store/useNotificationStore";
import { canCopyImages, copyImageToClipboard } from "../copyImage";

class MockClipboardItem {
	static supports?: (type: string) => boolean;
	constructor(readonly items: Record<string, Promise<Blob>>) {}
}

const toasts = () => useNotificationStore.getState().notifications;

let write: ReturnType<typeof vi.fn>;

function stubClipboard(clipboard: unknown) {
	Object.defineProperty(navigator, "clipboard", {
		value: clipboard,
		configurable: true,
	});
}

beforeEach(() => {
	useNotificationStore.setState({ notifications: [] });
	MockClipboardItem.supports = undefined;
	vi.stubGlobal("ClipboardItem", MockClipboardItem);
	// Reads the item like a browser does, after write() was called.
	write = vi.fn(async (items: MockClipboardItem[]) => {
		await items[0].items["image/png"];
	});
	stubClipboard({ write });
});

afterEach(() => {
	vi.unstubAllGlobals();
	stubClipboard(undefined);
});

describe("canCopyImages", () => {
	it("needs ClipboardItem and clipboard.write", () => {
		expect(canCopyImages()).toBe(true);
		stubClipboard({ writeText: vi.fn() });
		expect(canCopyImages()).toBe(false);
		stubClipboard({ write });
		vi.stubGlobal("ClipboardItem", undefined);
		expect(canCopyImages()).toBe(false);
	});

	it("honours ClipboardItem.supports where the browser has it", () => {
		MockClipboardItem.supports = (type) => type === "text/plain";
		expect(canCopyImages()).toBe(false);
		MockClipboardItem.supports = (type) => type === "image/png";
		expect(canCopyImages()).toBe(true);
	});
});

describe("copyImageToClipboard", () => {
	it("writes before the render settles, handing over the pending PNG", async () => {
		const png = new Blob(["png"], { type: "image/png" });
		let finish: (b: Blob) => void = () => {};
		const render = vi.fn(
			() =>
				new Promise<Blob>((resolve) => {
					finish = resolve;
				}),
		);

		const done = copyImageToClipboard(render);
		// Synchronously, still inside the click.
		expect(render).toHaveBeenCalledTimes(1);
		expect(write).toHaveBeenCalledTimes(1);
		const [[item]] = write.mock.calls as [[MockClipboardItem[]]][];
		const pending = item[0].items["image/png"];
		expect(pending).toBeInstanceOf(Promise);

		finish(png);
		expect(await pending).toBe(png);
		expect(await done).toBe(true);
		expect(toasts()).toMatchObject([
			{ kind: "success", message: "Chart copied to the clipboard" },
		]);
	});

	it("reports a browser without image clipboard, without rendering", async () => {
		stubClipboard(undefined);
		const render = vi.fn(async () => new Blob());
		expect(await copyImageToClipboard(render)).toBe(false);
		expect(render).not.toHaveBeenCalled();
		expect(toasts()[0]).toMatchObject({ kind: "error" });
		expect(toasts()[0].message).toMatch(/cannot copy images/);
	});

	it("reports a denied clipboard", async () => {
		write.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
		expect(await copyImageToClipboard(async () => new Blob())).toBe(false);
		expect(toasts()[0]).toMatchObject({ kind: "error" });
		expect(toasts()[0].message).toMatch(/denied access to the clipboard/);
	});

	it("reports other write failures with their reason", async () => {
		write.mockRejectedValueOnce(new Error("Document is not focused."));
		await copyImageToClipboard(async () => new Blob());
		expect(toasts()[0].message).toBe(
			"Could not copy the chart: Document is not focused.",
		);
	});

	it("blames a failed render, not the clipboard", async () => {
		// Browsers reject write() with their own error once the item fails.
		write.mockImplementationOnce(async (items: MockClipboardItem[]) => {
			try {
				await items[0].items["image/png"];
			} catch {
				throw new DOMException("Failed to read", "NotAllowedError");
			}
		});
		await copyImageToClipboard(async () => {
			throw new Error("Failed to load SVG into image for PNG export");
		});
		expect(toasts()[0].message).toBe(
			"Could not copy the chart: Failed to load SVG into image for PNG export",
		);
	});

	it("shows a too-large image's own message", async () => {
		const tooLarge = new Error("The image would be 40000 × 30000 pixels.");
		tooLarge.name = "CanvasSizeError";
		await copyImageToClipboard(async () => {
			throw tooLarge;
		});
		expect(toasts()[0].message).toBe(tooLarge.message);
	});

	it("does not leave the render rejection unhandled when write fails first", async () => {
		write.mockRejectedValueOnce(new DOMException("denied", "NotAllowedError"));
		const unhandled = vi.fn();
		process.on("unhandledRejection", unhandled);
		try {
			await copyImageToClipboard(async () => {
				await Promise.resolve();
				throw new Error("late");
			});
			await new Promise((r) => setTimeout(r, 0));
			expect(unhandled).not.toHaveBeenCalled();
			expect(toasts()[0].message).toMatch(/denied/);
		} finally {
			process.off("unhandledRejection", unhandled);
		}
	});
});
