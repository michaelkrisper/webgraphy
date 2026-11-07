import { useGraphStore } from "../../store/useGraphStore";
import { logger } from "../../utils/logger";
import type { ModelContext } from "./detect";
import { createTools } from "./tools";

let started = false;

/**
 * Registers the tools once the store has loaded (tools answering from the
 * pre-load placeholder state would mislead the agent) and unregisters them
 * on pagehide, again on a back/forward-cache restore. Idempotent; returns a
 * disposer that undoes all of it.
 */
export function registerWebMcpTools(mc: ModelContext): () => void {
	if (started) return () => {};
	started = true;
	let controller: AbortController | null = null;

	const register = () => {
		if (controller) return;
		const ctrl = new AbortController();
		controller = ctrl;
		const registrations = createTools().map(async (tool) =>
			mc.registerTool(tool, { signal: ctrl.signal }),
		);
		// A partial tool set would leave workflows half callable: roll back.
		Promise.all(registrations).catch((error: unknown) => {
			logger.warn("WebMCP tool registration failed", error);
			if (controller === ctrl) unregister();
		});
	};
	const unregister = () => {
		controller?.abort();
		controller = null;
	};
	const onPageShow = (e: PageTransitionEvent) => {
		if (e.persisted) register();
	};
	const start = () => {
		register();
		window.addEventListener("pagehide", unregister);
		window.addEventListener("pageshow", onPageShow);
	};

	let unsubscribe = () => {};
	if (useGraphStore.getState().isLoaded) start();
	else
		unsubscribe = useGraphStore.subscribe((s) => {
			if (!s.isLoaded) return;
			unsubscribe();
			start();
		});

	return () => {
		unsubscribe();
		unregister();
		window.removeEventListener("pagehide", unregister);
		window.removeEventListener("pageshow", onPageShow);
		started = false;
	};
}
