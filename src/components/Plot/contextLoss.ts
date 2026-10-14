/**
 * WebGL context-loss wiring shared by both render backends (the DOM canvas
 * on the main thread and the OffscreenCanvas inside the render worker).
 *
 * A GPU process crash, driver reset, or the browser evicting the context
 * under memory pressure fires `webglcontextlost`. Unless that event is
 * cancelled the context stays lost for good, so the plot would stay blank
 * until a reload; cancelling it asks the browser for `webglcontextrestored`,
 * after which every GPU object has to be rebuilt from scratch.
 */

export interface ContextLossHandlers {
	lost(): void;
	restored(): void;
}

/** Listen for loss/restore on a canvas; returns the unsubscribe function. */
export function watchContextLoss(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	handlers: ContextLossHandlers,
): () => void {
	const onLost = (ev: Event) => {
		ev.preventDefault();
		handlers.lost();
	};
	const onRestored = () => handlers.restored();
	canvas.addEventListener("webglcontextlost", onLost);
	canvas.addEventListener("webglcontextrestored", onRestored);
	return () => {
		canvas.removeEventListener("webglcontextlost", onLost);
		canvas.removeEventListener("webglcontextrestored", onRestored);
	};
}
