import { create } from "zustand";

export type NotificationKind = "info" | "success" | "error";

export interface NotificationAction {
	label: string;
	onAction: () => void;
}

export interface NotifyOptions {
	kind: NotificationKind;
	message: string;
	action?: NotificationAction;
	/** Auto-dismiss delay in ms; `0` or `Infinity` keeps the toast until dismissed. */
	durationMs?: number;
}

export interface Notification {
	id: string;
	kind: NotificationKind;
	message: string;
	action?: NotificationAction;
	durationMs: number;
}

interface NotificationState {
	notifications: Notification[];
	notify: (options: NotifyOptions) => string;
	dismiss: (id: string) => void;
	/** Holds the auto-dismiss timer while the toast is hovered or focused. */
	pause: (id: string) => void;
	/** Restarts the full auto-dismiss delay after `pause`. */
	resume: (id: string) => void;
}

export const DEFAULT_DURATION_MS = 5000;
/** Oldest toasts are dropped beyond this so a burst of failures cannot fill the screen. */
export const MAX_NOTIFICATIONS = 5;

// Timers live outside the store: they are not state anyone renders from.
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let nextId = 0;

function clearTimer(id: string) {
	const t = timers.get(id);
	if (t !== undefined) {
		clearTimeout(t);
		timers.delete(id);
	}
}

function schedule(id: string, durationMs: number) {
	clearTimer(id);
	if (durationMs > 0 && Number.isFinite(durationMs)) {
		timers.set(
			id,
			setTimeout(() => useNotificationStore.getState().dismiss(id), durationMs),
		);
	}
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
	notifications: [],

	notify: ({ kind, message, action, durationMs }) => {
		const duration =
			durationMs ?? (kind === "error" ? Infinity : DEFAULT_DURATION_MS);
		const list = get().notifications;
		const last = list[list.length - 1];
		// Repeating the newest toast just refreshes it (and its callback), so a
		// failing save retried every few hundred ms shows one toast, not a stack.
		if (
			last &&
			last.kind === kind &&
			last.message === message &&
			last.action?.label === action?.label
		) {
			const refreshed = { ...last, action, durationMs: duration };
			set({ notifications: [...list.slice(0, -1), refreshed] });
			schedule(last.id, duration);
			return last.id;
		}

		const id = `toast-${++nextId}`;
		const next = [...list, { id, kind, message, action, durationMs: duration }];
		const dropped = next.slice(0, Math.max(0, next.length - MAX_NOTIFICATIONS));
		for (const n of dropped) clearTimer(n.id);
		set({ notifications: next.slice(dropped.length) });
		schedule(id, duration);
		return id;
	},

	dismiss: (id) => {
		clearTimer(id);
		const list = get().notifications;
		if (list.some((n) => n.id === id)) {
			set({ notifications: list.filter((n) => n.id !== id) });
		}
	},

	pause: (id) => clearTimer(id),

	resume: (id) => {
		const n = get().notifications.find((x) => x.id === id);
		if (n) schedule(id, n.durationMs);
	},
}));

/**
 * Shows a toast. Plain function, safe to call from services, workers' clients
 * and store actions — no React or hooks needed.
 *
 * - `kind`: `"info" | "success" | "error"`. Errors persist until dismissed;
 *   info/success auto-dismiss after {@link DEFAULT_DURATION_MS}.
 * - `durationMs`: override the auto-dismiss delay; `0`/`Infinity` persists.
 * - `action`: optional `{ label, onAction }` button (e.g. "Undo", "Reload");
 *   clicking it runs `onAction` and dismisses the toast.
 * - Calling again with the same kind, message and action label as the newest
 *   toast refreshes that toast instead of stacking a duplicate.
 *
 * @returns the toast id, for a later {@link dismissNotification}.
 * @example
 * notify({ kind: "error", message: "Could not save: storage is full" });
 * notify({ kind: "info", message: "Series deleted", action: { label: "Undo", onAction: restore } });
 */
export function notify(options: NotifyOptions): string {
	return useNotificationStore.getState().notify(options);
}

/** Removes a toast by the id `notify` returned. No-op if already gone. */
export function dismissNotification(id: string): void {
	useNotificationStore.getState().dismiss(id);
}
