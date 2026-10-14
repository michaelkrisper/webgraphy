import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_DURATION_MS,
	dismissNotification,
	MAX_NOTIFICATIONS,
	notify,
	useNotificationStore,
} from "../useNotificationStore";

const list = () => useNotificationStore.getState().notifications;

describe("useNotificationStore", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});

	afterEach(() => {
		for (const n of list()) dismissNotification(n.id);
		vi.useRealTimers();
	});

	it("returns an id and exposes the notification", () => {
		const id = notify({ kind: "info", message: "Hello" });
		expect(list()).toEqual([
			expect.objectContaining({ id, kind: "info", message: "Hello" }),
		]);
	});

	it("auto-dismisses info and success after the default duration", () => {
		notify({ kind: "info", message: "a" });
		notify({ kind: "success", message: "b" });
		vi.advanceTimersByTime(DEFAULT_DURATION_MS - 1);
		expect(list()).toHaveLength(2);
		vi.advanceTimersByTime(1);
		expect(list()).toHaveLength(0);
	});

	it("keeps errors until dismissed", () => {
		const id = notify({ kind: "error", message: "boom" });
		vi.advanceTimersByTime(60_000);
		expect(list()).toHaveLength(1);
		dismissNotification(id);
		expect(list()).toHaveLength(0);
	});

	it("honours an explicit durationMs, including 0 = persist", () => {
		notify({ kind: "error", message: "transient", durationMs: 100 });
		notify({ kind: "info", message: "sticky", durationMs: 0 });
		vi.advanceTimersByTime(100);
		expect(list().map((n) => n.message)).toEqual(["sticky"]);
	});

	it("de-duplicates identical consecutive messages and restarts the timer", () => {
		const a = notify({ kind: "info", message: "Saved" });
		vi.advanceTimersByTime(DEFAULT_DURATION_MS - 100);
		const b = notify({ kind: "info", message: "Saved" });
		expect(b).toBe(a);
		expect(list()).toHaveLength(1);
		vi.advanceTimersByTime(200);
		expect(list()).toHaveLength(1);
		vi.advanceTimersByTime(DEFAULT_DURATION_MS);
		expect(list()).toHaveLength(0);
	});

	it("does not de-duplicate non-consecutive or differently-kinded messages", () => {
		notify({ kind: "info", message: "x" });
		notify({ kind: "error", message: "x" });
		notify({ kind: "info", message: "x" });
		expect(list()).toHaveLength(3);
	});

	it("refreshes the action callback on a duplicate", () => {
		const first = vi.fn();
		const second = vi.fn();
		notify({
			kind: "info",
			message: "Deleted",
			action: { label: "Undo", onAction: first },
		});
		notify({
			kind: "info",
			message: "Deleted",
			action: { label: "Undo", onAction: second },
		});
		list()[0].action?.onAction();
		expect(second).toHaveBeenCalledTimes(1);
		expect(first).not.toHaveBeenCalled();
	});

	it("caps the stack, dropping the oldest", () => {
		for (let i = 0; i < MAX_NOTIFICATIONS + 2; i++) {
			notify({ kind: "error", message: `e${i}` });
		}
		expect(list()).toHaveLength(MAX_NOTIFICATIONS);
		expect(list()[0].message).toBe("e2");
	});

	it("pause holds the timer and resume restarts it", () => {
		const id = notify({ kind: "info", message: "hover me" });
		const { pause, resume } = useNotificationStore.getState();
		pause(id);
		vi.advanceTimersByTime(DEFAULT_DURATION_MS * 2);
		expect(list()).toHaveLength(1);
		resume(id);
		vi.advanceTimersByTime(DEFAULT_DURATION_MS);
		expect(list()).toHaveLength(0);
	});

	it("dismiss of an unknown id is a no-op", () => {
		notify({ kind: "error", message: "stay" });
		dismissNotification("nope");
		expect(list()).toHaveLength(1);
	});
});
