import { registerSW } from "virtual:pwa-register";
import { flushPendingSaves } from "./store/useGraphStore";
import { notify } from "./store/useNotificationStore";

/** The app lives in one long-lived tab, so poll for deploys instead of waiting for a navigation. */
export const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Registers the service worker in "prompt" mode: a new deploy waits until the
 * user chooses to reload, so it can never interrupt an import or a dialog.
 */
export function registerServiceWorker(): void {
	let offlineReadyShown = false;

	const updateSW = registerSW({
		immediate: true,
		onNeedRefresh() {
			notify({
				kind: "info",
				message: "A new version is available",
				durationMs: Infinity,
				action: {
					label: "Reload",
					onAction: () => {
						void flushPendingSaves()
							.catch(() => {})
							.then(() => updateSW(true));
					},
				},
			});
		},
		onOfflineReady() {
			if (offlineReadyShown) return;
			offlineReadyShown = true;
			notify({ kind: "success", message: "Ready to work offline" });
		},
		onRegisteredSW(_swUrl, registration) {
			if (!registration) return;
			setInterval(() => {
				if (registration.installing || !navigator.onLine) return;
				registration.update().catch(() => {});
			}, UPDATE_CHECK_INTERVAL_MS);
		},
	});
}
