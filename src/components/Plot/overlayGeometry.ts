// Pure vertex-buffer writers for the overlay primitives drawn by
// WebGLRenderer.buildOverlay. Each helper appends its geometry to a packed
// Float32Array starting at the supplied write index and returns the next
// write index, so the caller can sum vertex counts and push draw groups
// while the geometry itself stays testable in isolation.

interface Padding {
	left: number;
	right: number;
	top: number;
	bottom: number;
}

/**
 * Append the plot-background quad (two triangles, 6 vertices) covering the
 * plot area, with all coordinates pre-multiplied by `dpr` so the renderer
 * can blit straight to the device pixel grid.
 */
export function writeBackgroundQuad(
	buf: Float32Array,
	p: number,
	pad: Padding,
	cw: number,
	ch: number,
	dpr: number,
): number {
	const x0 = pad.left * dpr;
	const y0 = pad.top * dpr;
	const x1 = (pad.left + cw) * dpr;
	const y1 = (pad.top + ch) * dpr;
	buf[p++] = x0;
	buf[p++] = y0;
	buf[p++] = x1;
	buf[p++] = y0;
	buf[p++] = x0;
	buf[p++] = y1;
	buf[p++] = x1;
	buf[p++] = y0;
	buf[p++] = x1;
	buf[p++] = y1;
	buf[p++] = x0;
	buf[p++] = y1;
	return p;
}
