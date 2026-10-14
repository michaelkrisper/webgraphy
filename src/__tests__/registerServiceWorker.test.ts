import type { RegisterSWOptions } from "virtual:pwa-register";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	dismissNotification,
	useNotificationStore,
} from "../store/useNotificationStore";

const updateSW = vi.fn().mockResolvedValue(undefined);
const registerSW = vi.fn<(options: RegisterSWOptions) => typeof updateSW>(
	() => updateSW,
);
const flushPendingSaves = vi.fn().mockResolvedValue(undefined);

vi.mock("virtual:pwa-register", () => ({ registerSW }));
vi.mock("../store/useGraphStore", () => ({ flushPendingSaves }));

const { registerServiceWorker, UPDATE_CHECK_INTERVAL_MS } = await import(
	"../registerServiceWorker"
);

const toasts = () => useNotificationStore.getState().notifications;

function register(): RegisterSWOptions {
	registerServiceWorker();
	return registerSW.mock.calls.at(-1)?.[0] as RegisterSWOptions;
}

describe("registerServiceWorker", () => {
	beforeEach(() => {
		vi.useFakeTimers();
		vi.clearAllMocks();
	});

	afterEach(() => {
		for (const n of toasts()) dismissNotification(n.id);
		vi.useRealTimers();
	});

	it("registers immediately in prompt mode with update callbacks", () => {
		const options = register();
		expect(options.immediate).toBe(true);
		expect(options.onNeedRefresh).toBeTypeOf("function");
		expect(options.onOfflineReady).toBeTypeOf("function");
	});

	it("shows a persistent Reload toast that flushes saves before updating", async () => {
		const order: string[] = [];
		flushPendingSaves.mockImplementationOnce(async () => {
			order.push("flush");
		});
		updateSW.mockImplementationOnce(async () => {
			order.push("update");
		});

		register().onNeedRefresh?.();
		const toast = toasts().at(-1);
		expect(toast).toMatchObject({
			kind: "info",
			message: "A new version is available",
			durationMs: Infinity,
		});
		expect(updateSW).not.toHaveBeenCalled();

		toast?.action?.onAction();
		await vi.waitFor(() => expect(updateSW).toHaveBeenCalledWith(true));
		expect(order).toEqual(["flush", "update"]);
	});

	it("still updates when flushing fails", async () => {
		flushPendingSaves.mockRejectedValueOnce(new Error("quota"));
		register().onNeedRefresh?.();
		toasts().at(-1)?.action?.onAction();
		await vi.waitFor(() => expect(updateSW).toHaveBeenCalledWith(true));
	});

	it("announces offline readiness once", () => {
		const options = register();
		options.onOfflineReady?.();
		options.onOfflineReady?.();
		const ready = toasts().filter((n) => n.message === "Ready to work offline");
		expect(ready).toHaveLength(1);
		expect(ready[0].kind).toBe("success");
	});

	it("checks for updates hourly while online", () => {
		const update = vi.fn().mockResolvedValue(undefined);
		const registration = {
			installing: null,
			update,
		} as unknown as ServiceWorkerRegistration;
		register().onRegisteredSW?.("sw.js", registration);

		vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS - 1);
		expect(update).not.toHaveBeenCalled();
		vi.advanceTimersByTime(1);
		expect(update).toHaveBeenCalledTimes(1);

		const online = vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
		vi.advanceTimersByTime(UPDATE_CHECK_INTERVAL_MS);
		expect(update).toHaveBeenCalledTimes(1);
		online.mockRestore();
		vi.clearAllTimers();
	});
});
