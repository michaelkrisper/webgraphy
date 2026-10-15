import type { RendererViewport } from "./rendererCore";

/** Size a canvas' drawing buffer for `viewport` (no-op when unchanged). */
export function sizeCanvasToViewport(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	viewport: RendererViewport,
): void {
	const pw = Math.max(
		1,
		viewport.pixelWidth ?? Math.round(viewport.width * viewport.dpr),
	);
	const ph = Math.max(
		1,
		viewport.pixelHeight ?? Math.round(viewport.height * viewport.dpr),
	);
	if (canvas.width !== pw) canvas.width = pw;
	if (canvas.height !== ph) canvas.height = ph;
}
