import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useNotificationStore } from "../../store/useNotificationStore";
import {
	describeUncaught,
	installGlobalErrorHandlers,
	markErrorReported,
} from "../globalErrors";

function toasts() {
	return useNotificationStore.getState().notifications;
}

describe("describeUncaught", () => {
	it("turns a real error into an error toast with its message", () => {
		expect(describeUncaught(new TypeError("x is undefined"))).toEqual({
			kind: "error",
			message: "Something went wrong: x is undefined",
		});
		expect(describeUncaught("plain string")?.message).toBe(
			"Something went wrong: plain string",
		);
	});

	it("falls back to the event message when there is no error object", () => {
		expect(describeUncaught(null, "Uncaught boom")?.message).toBe(
			"Something went wrong: Uncaught boom",
		);
	});

	it("clips very long messages", () => {
		const toast = describeUncaught(new Error("a".repeat(500)));
		expect(toast?.message.length).toBeLessThan(250);
		expect(toast?.message.endsWith("…")).toBe(true);
	});

	it("ignores cancellations and noise", () => {
		expect(
			describeUncaught(new DOMException("The user aborted", "AbortError")),
		).toBeNull();
		expect(
			describeUncaught(Object.assign(new Error("x"), { name: "AbortError" })),
		).toBeNull();
		expect(
			describeUncaught(
				null,
				"ResizeObserver loop completed with undelivered notifications.",
			),
		).toBeNull();
		expect(describeUncaught(null, "Script error.")).toBeNull();
		expect(describeUncaught(undefined)).toBeNull();
		expect(describeUncaught({})).toBeNull();
		expect(
			describeUncaught(new Error("x"), "", "chrome-extension://abc/content.js"),
		).toBeNull();
	});

	it("stays quiet about errors already reported", () => {
		const error = new Error("Quota exceeded");
		markErrorReported(error);
		expect(describeUncaught(error)).toBeNull();
		// Primitives cannot be marked and are not affected.
		markErrorReported("text");
		expect(describeUncaught("text")).not.toBeNull();
	});

	it("offers a reload when a lazy chunk is gone", () => {
		const reload = vi.fn();
		vi.stubGlobal("location", { reload });
		const toast = describeUncaught(
			new TypeError(
				"Failed to fetch dynamically imported module: https://x/assets/a.js",
			),
		);
		expect(toast?.kind).toBe("error");
		expect(toast?.action?.label).toBe("Reload");
		toast?.action?.onAction();
		expect(reload).toHaveBeenCalled();
		vi.unstubAllGlobals();
	});
});

describe("installGlobalErrorHandlers", () => {
	let uninstall: () => void;

	beforeEach(() => {
		useNotificationStore.setState({ notifications: [] });
		uninstall = installGlobalErrorHandlers();
	});

	afterEach(() => {
		uninstall();
		useNotificationStore.setState({ notifications: [] });
	});

	it("toasts an unhandled rejection", () => {
		window.dispatchEvent(
			Object.assign(new Event("unhandledrejection"), {
				reason: new Error("save failed"),
			}),
		);
		expect(toasts()).toHaveLength(1);
		expect(toasts()[0]).toMatchObject({
			kind: "error",
			message: "Something went wrong: save failed",
		});
	});

	it("ignores an aborted rejection", () => {
		window.dispatchEvent(
			Object.assign(new Event("unhandledrejection"), {
				reason: new DOMException("aborted", "AbortError"),
			}),
		);
		expect(toasts()).toHaveLength(0);
	});

	it("toasts an uncaught exception and skips noise", () => {
		window.dispatchEvent(
			new ErrorEvent("error", {
				error: new Error("click handler broke"),
				message: "Uncaught Error: click handler broke",
			}),
		);
		window.dispatchEvent(
			new ErrorEvent("error", { message: "ResizeObserver loop limit exceeded" }),
		);
		expect(toasts()).toHaveLength(1);
		expect(toasts()[0].message).toBe("Something went wrong: click handler broke");
	});

	it("stops listening once uninstalled", () => {
		uninstall();
		window.dispatchEvent(
			Object.assign(new Event("unhandledrejection"), {
				reason: new Error("late"),
			}),
		);
		expect(toasts()).toHaveLength(0);
	});
});
