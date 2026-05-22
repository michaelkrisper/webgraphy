import { hexToRgba } from "../../utils/colors";
import type { OverlayInput } from "./WebGLRenderer";
import type { OverlayState } from "./drawSeries";


export function buildOverlayState(
	overlay: OverlayInput,
	ov: OverlayState,
	props: {
		width: number;
		height: number;
		padding: { top: number; right: number; bottom: number; left: number };
	},
	dpr: number,
): void {
	const { width: w, height: h, padding: pad } = props;
	const cw = w - pad.left - pad.right;
	const ch = h - pad.top - pad.bottom;

	const hexRgba = (hex: string, a = 1): [number, number, number, number] => {
		const c = hexToRgba(hex);
		return [c[0], c[1], c[2], a];
	};
	const gridRgba = hexRgba(overlay.gridColor, 1);
	const axisRgba = hexRgba(overlay.axisColor, 1);
	const zeroRgba = hexRgba(overlay.zeroLineColor, 1);
	const bgRgba = hexRgba(overlay.plotBg, 1);

	// Estimate vertex count and grow packed buffer as needed.
	let est = 12; // bg quad (6 verts * 2 floats)
	if (overlay.xAxes[0]?.showGrid) est += overlay.xAxes[0].ticks.length * 4;
	for (const ax of overlay.xAxes) est += (ax.ticks.length + 1) * 4 + 6;
	for (const ax of overlay.yAxes) {
		if (ax.showGrid) est += ax.ticks.length * 4;
		est += (ax.ticks.length + 1) * 4 + 6;
	}
	est += 12 + 32;
	if (ov.packed.length < est)
		ov.packed = new Float32Array(Math.max(est, ov.packed.length * 2));
	const buf = ov.packed;
	let p = 0;
	ov.groups.length = 0;

	// --- Background quad (TRIANGLES) ---
	const x0 = pad.left * dpr,
		y0 = pad.top * dpr,
		x1 = (pad.left + cw) * dpr,
		y1 = (pad.top + ch) * dpr;
	const bgStart = p / 2;
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
	ov.groups.push({
		topology: "TRIANGLES",
		rgba: bgRgba,
		width: 1,
		offset: bgStart,
		count: 6,
	});

	// Grid: vertical (first x axis) + horizontal (y axes that show grid).
	const gridStart = p / 2;
	if (overlay.xAxes.length > 0) {
		const ax = overlay.xAxes[0];
		if (ax.showGrid && ax.max > ax.min) {
			const range = ax.max - ax.min;
			const yTop = pad.top * dpr;
			const yBot = (pad.top + ch) * dpr;
			for (const t of ax.ticks) {
				const norm = (t - ax.min) / range;
				if (norm < 0 || norm > 1) continue;
				const sx = (pad.left + norm * cw) * dpr;
				buf[p++] = sx;
				buf[p++] = yTop;
				buf[p++] = sx;
				buf[p++] = yBot;
			}
		}
	}
	for (const ax of overlay.yAxes) {
		if (!ax.showGrid || ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		const xL = pad.left * dpr;
		const xR = (w - pad.right) * dpr;
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
	const gridCount = p / 2 - gridStart;
	if (gridCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: gridRgba,
			width: 1,
			offset: gridStart,
			count: gridCount,
		});

	// Zero lines (horizontal for y-axes, vertical for first x-axis).
	const zeroLineStart = p / 2;
	for (const ax of overlay.yAxes) {
		if (ax.categoryLabels) continue;
		if (!ax.showGrid) continue;
		if (ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
			const range = ax.max - ax.min;
			const norm = (0 - ax.min) / range;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			const arrowTipX = (w - pad.right + 8) * dpr;
			buf[p++] = pad.left * dpr;
			buf[p++] = sy;
			buf[p++] = arrowTipX;
			buf[p++] = sy;
		}
	}
	if (overlay.xAxes.length > 0) {
		const ax = overlay.xAxes[0];
		if (
			ax.showGrid &&
			!ax.categoryLabels &&
			ax.min <= 0 &&
			ax.max >= 0 &&
			ax.max > ax.min
		) {
			const range = ax.max - ax.min;
			const norm = (0 - ax.min) / range;
			const sx = (pad.left + norm * cw) * dpr;
			const tipY = (pad.top - 8) * dpr;
			buf[p++] = sx;
			buf[p++] = (h - pad.bottom) * dpr;
			buf[p++] = sx;
			buf[p++] = tipY;
		}
	}
	const zeroLineCount = p / 2 - zeroLineStart;
	if (zeroLineCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: zeroRgba,
			width: 1.5,
			offset: zeroLineStart,
			count: zeroLineCount,
		});

	// Axis lines: frame spines + x/y axis lines + tick marks.
	const axisLineStart = p / 2;
	buf[p++] = pad.left * dpr;
	buf[p++] = pad.top * dpr;
	buf[p++] = pad.left * dpr;
	buf[p++] = (pad.top + ch) * dpr;
	buf[p++] = pad.left * dpr;
	buf[p++] = pad.top * dpr;
	buf[p++] = (w - pad.right) * dpr;
	buf[p++] = pad.top * dpr;
	buf[p++] = (w - pad.right) * dpr;
	buf[p++] = pad.top * dpr;
	buf[p++] = (w - pad.right) * dpr;
	buf[p++] = (pad.top + ch) * dpr;
	overlay.xAxes.forEach((ax, idx) => {
		const m = overlay.xAxesMetrics[idx];
		if (!m) return;
		const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
		buf[p++] = pad.left * dpr;
		buf[p++] = yL;
		buf[p++] = (w - pad.right + 8) * dpr;
		buf[p++] = yL;
		if (ax.max <= ax.min) return;
		const range = ax.max - ax.min;
		const tickEnd = yL + 6 * dpr;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sx = (pad.left + norm * cw) * dpr;
			buf[p++] = sx;
			buf[p++] = yL;
			buf[p++] = sx;
			buf[p++] = tickEnd;
		}
	});
	for (const ax of overlay.yAxes) {
		const isLeft = ax.position === "left";
		const metrics = overlay.axisLayout[ax.id] || {
			total: 40,
			label: 30,
		};
		const xPos = isLeft
			? pad.left - (overlay.leftOffsets[ax.id] ?? 0) - metrics.total
			: w - pad.right + (overlay.rightOffsets[ax.id] ?? 0);
		const lineX = isLeft ? xPos + metrics.total : xPos;
		const tipY = (pad.top - 8) * dpr;
		buf[p++] = lineX * dpr;
		buf[p++] = (h - pad.bottom) * dpr;
		buf[p++] = lineX * dpr;
		buf[p++] = tipY;
		if (ax.max <= ax.min) continue;
		const range = ax.max - ax.min;
		const xa = (isLeft ? lineX - 5 : lineX) * dpr;
		const xb = (isLeft ? lineX : lineX + 5) * dpr;
		for (const t of ax.ticks) {
			const norm = (t - ax.min) / range;
			if (norm < 0 || norm > 1) continue;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			buf[p++] = xa;
			buf[p++] = sy;
			buf[p++] = xb;
			buf[p++] = sy;
		}
	}
	const axisLineCount = p / 2 - axisLineStart;
	if (axisLineCount > 0)
		ov.groups.push({
			topology: "LINES",
			rgba: axisRgba,
			width: 1,
			offset: axisLineStart,
			count: axisLineCount,
		});

	// Zero-line arrow triangles.
	const zeroTriStart = p / 2;
	for (const ax of overlay.yAxes) {
		if (ax.categoryLabels) continue;
		if (!ax.showGrid) continue;
		if (ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
			const range = ax.max - ax.min;
			const norm = (0 - ax.min) / range;
			const sy = (pad.top + (1 - norm) * ch) * dpr;
			const arrowTipX = (w - pad.right + 8) * dpr;
			const aSize = 6 * dpr;
			buf[p++] = arrowTipX;
			buf[p++] = sy;
			buf[p++] = arrowTipX - aSize;
			buf[p++] = sy - aSize / 2;
			buf[p++] = arrowTipX - aSize;
			buf[p++] = sy + aSize / 2;
		}
	}
	if (overlay.xAxes.length > 0) {
		const ax = overlay.xAxes[0];
		if (
			ax.showGrid &&
			!ax.categoryLabels &&
			ax.min <= 0 &&
			ax.max >= 0 &&
			ax.max > ax.min
		) {
			const range = ax.max - ax.min;
			const norm = (0 - ax.min) / range;
			const sx = (pad.left + norm * cw) * dpr;
			const tipY = (pad.top - 8) * dpr;
			const aSize = 6 * dpr;
			buf[p++] = sx;
			buf[p++] = tipY;
			buf[p++] = sx - aSize / 2;
			buf[p++] = tipY + aSize;
			buf[p++] = sx + aSize / 2;
			buf[p++] = tipY + aSize;
		}
	}
	const zeroTriCount = p / 2 - zeroTriStart;
	if (zeroTriCount > 0)
		ov.groups.push({
			topology: "TRIANGLES",
			rgba: zeroRgba,
			width: 1,
			offset: zeroTriStart,
			count: zeroTriCount,
		});

	// Axis arrow triangles (x/y).
	const axisTriStart = p / 2;
	overlay.xAxes.forEach((_, idx) => {
		const m = overlay.xAxesMetrics[idx];
		if (!m) return;
		const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
		const aSize = 6 * dpr;
		buf[p++] = (w - pad.right + 8) * dpr;
		buf[p++] = yL;
		buf[p++] = (w - pad.right + 8 - 6) * dpr;
		buf[p++] = yL - aSize / 2;
		buf[p++] = (w - pad.right + 8 - 6) * dpr;
		buf[p++] = yL + aSize / 2;
	});
	for (const ax of overlay.yAxes) {
		const isLeft = ax.position === "left";
		const metrics = overlay.axisLayout[ax.id] || {
			total: 40,
			label: 30,
		};
		const xPos = isLeft
			? pad.left - (overlay.leftOffsets[ax.id] ?? 0) - metrics.total
			: w - pad.right + (overlay.rightOffsets[ax.id] ?? 0);
		const lineX = isLeft ? xPos + metrics.total : xPos;
		const tipY = (pad.top - 8) * dpr;
		const aSize = 6 * dpr;
		buf[p++] = lineX * dpr;
		buf[p++] = tipY;
		buf[p++] = (lineX - 3) * dpr;
		buf[p++] = tipY + aSize;
		buf[p++] = (lineX + 3) * dpr;
		buf[p++] = tipY + aSize;
	}
	const axisTriCount = p / 2 - axisTriStart;
	if (axisTriCount > 0)
		ov.groups.push({
			topology: "TRIANGLES",
			rgba: axisRgba,
			width: 1,
			offset: axisTriStart,
			count: axisTriCount,
		});

	ov.packedLen = p;
}