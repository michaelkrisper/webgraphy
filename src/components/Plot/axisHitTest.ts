// Pure hit-testing helpers: given pointer coordinates and the current axis
// layout, return the id of the axis gutter under the pointer (or null).
// Extracted from usePanZoom so the geometry can be unit-tested in isolation.

interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface YAxisHitTestParams {
	width: number;
	height: number;
	padding: Padding;
	leftAxes: readonly { id: string }[];
	rightAxes: readonly { id: string }[];
	axisLayout: Record<string, { total: number }>;
}

interface XAxisHitTestParams {
	width: number;
	height: number;
	padding: Padding;
	xAxesMetrics: readonly { id: string; height: number; cumulativeOffset: number }[];
}

const DEFAULT_AXIS_TOTAL = 40;

/** Id of the Y-axis gutter (left or right) under the pointer, or null. */
export function hitTestYAxis(
	mouseX: number,
	mouseY: number,
	{ width, height, padding, leftAxes, rightAxes, axisLayout }: YAxisHitTestParams,
): string | null {
	if (mouseY < padding.top || mouseY > height - padding.bottom) return null;
	let lOff = 0;
	for (let i = 0; i < leftAxes.length; i++) {
		const total = axisLayout[leftAxes[i].id]?.total ?? DEFAULT_AXIS_TOTAL;
		if (mouseX >= padding.left - lOff - total && mouseX <= padding.left - lOff)
			return leftAxes[i].id;
		lOff += total;
	}
	let rOff = 0;
	for (let i = 0; i < rightAxes.length; i++) {
		const total = axisLayout[rightAxes[i].id]?.total ?? DEFAULT_AXIS_TOTAL;
		if (
			mouseX >= width - padding.right + rOff &&
			mouseX <= width - padding.right + rOff + total
		)
			return rightAxes[i].id;
		rOff += total;
	}
	return null;
}

/** Id of the X-axis gutter (below the plot) under the pointer, or null. */
export function hitTestXAxis(
	mouseX: number,
	mouseY: number,
	{ width, height, padding, xAxesMetrics }: XAxisHitTestParams,
): string | null {
	if (mouseX < padding.left || mouseX > width - padding.right) return null;
	for (const m of xAxesMetrics) {
		const baseY = height - padding.bottom + m.cumulativeOffset;
		if (mouseY >= baseY && mouseY <= baseY + m.height) return m.id;
	}
	return null;
}
