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

interface GridAxis {
	readonly ticks: readonly number[];
	readonly min: number;
	readonly max: number;
	readonly showGrid: boolean;
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

/**
 * Append the vertical grid lines for the first x-axis (drawn full-height
 * across the plot). Ticks outside the visible range are skipped. Returns
 * the advanced write index.
 */
export function writeXGridLines(
	buf: Float32Array,
	p: number,
	axis: GridAxis,
	pad: Padding,
	cw: number,
	ch: number,
	dpr: number,
): number {
	if (!axis.showGrid || axis.max <= axis.min) return p;
	const range = axis.max - axis.min;
	const yTop = pad.top * dpr;
	const yBot = (pad.top + ch) * dpr;
	for (const t of axis.ticks) {
		const norm = (t - axis.min) / range;
		if (norm < 0 || norm > 1) continue;
		const sx = (pad.left + norm * cw) * dpr;
		buf[p++] = sx;
		buf[p++] = yTop;
		buf[p++] = sx;
		buf[p++] = yBot;
	}
	return p;
}

/**
 * Append the horizontal grid lines for every y-axis that opts in. Each
 * gridded axis adds a full-width line per visible tick. Returns the
 * advanced write index.
 */
export function writeYGridLines(
	buf: Float32Array,
	p: number,
	axes: readonly GridAxis[],
	pad: Padding,
	w: number,
	ch: number,
	dpr: number,
): number {
	const xL = pad.left * dpr;
	const xR = (w - pad.right) * dpr;
	for (const ax of axes) {
		if (!ax.showGrid || ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			buf[p++] = xL;
			buf[p++] = sy;
			buf[p++] = xR;
			buf[p++] = sy;
		}
	}
	return p;
}
