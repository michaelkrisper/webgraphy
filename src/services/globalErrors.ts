import { type NotifyOptions, notify } from "../store/useNotificationStore";

/**
 * Last-resort reporting: a rejection nobody awaited, or an exception thrown
 * outside React's error boundaries (event handlers, timers), otherwise fails
 * with nothing on screen. The browser still logs both; this only adds a toast.
 */

const reported = new WeakSet<object>();

/**
 * Marks an error whose failure the caller has already shown to the user, so
 * the global handlers stay quiet should it escape as well.
 */
export function markErrorReported(error: unknown): void {
	if (typeof error === "object" && error !== null) reported.add(error);
}

const MAX_DETAIL = 200;
// Noise, not failures: the ResizeObserver notice is a browser warning dressed
// up as an error, and "Script error." is a cross-origin script (extensions,
// injected code) whose details the browser hides.
const BENIGN = /^(ResizeObserver loop|Script error\.?$)/;
const EXTENSION_URL = /^(chrome|moz|safari|safari-web)-extension:/;
// Chrome, Firefox and Safari wording for a lazy chunk that no longer exists,
// typically because a new version was deployed while this tab stayed open.
const CHUNK_LOAD =
	/Failed to fetch dynamically imported module|error loading dynamically imported module|Importing a module script failed/i;

/**
 * The toast an uncaught failure deserves, or `null` for what is not one:
 * cancellations (`AbortError`), browser noise, errors from extensions, errors
 * already reported, and rejections that carry nothing to show.
 */
export function describeUncaught(
	error: unknown,
	fallbackMessage = "",
	filename = "",
): NotifyOptions | null {
	if (typeof error === "object" && error !== null) {
		if (reported.has(error)) return null;
		if ((error as { name?: unknown }).name === "AbortError") return null;
	}
	if (EXTENSION_URL.test(filename)) return null;
	const detail = (
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: fallbackMessage
	).trim();
	if (!detail || BENIGN.test(detail)) return null;
	if (CHUNK_LOAD.test(detail)) {
		return {
			kind: "error",
			message:
				"Part of WebGraphy failed to load, probably because a new version is available. Reload to continue.",
			action: { label: "Reload", onAction: () => location.reload() },
		};
	}
	const clipped =
		detail.length > MAX_DETAIL ? `${detail.slice(0, MAX_DETAIL - 1)}…` : detail;
	return { kind: "error", message: `Something went wrong: ${clipped}` };
}

/** Installs the window-level handlers; returns the uninstall function. */
export function installGlobalErrorHandlers(
	target: Window = window,
): () => void {
	const onRejection = (ev: PromiseRejectionEvent) => {
		const toast = describeUncaught(ev.reason);
		if (toast) notify(toast);
	};
	const onError = (ev: ErrorEvent) => {
		const toast = describeUncaught(ev.error, ev.message, ev.filename);
		if (toast) notify(toast);
	};
	target.addEventListener("unhandledrejection", onRejection);
	target.addEventListener("error", onError);
	return () => {
		target.removeEventListener("unhandledrejection", onRejection);
		target.removeEventListener("error", onError);
	};
}
