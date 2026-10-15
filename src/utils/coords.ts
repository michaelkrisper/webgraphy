import { axisFraction, axisValueAt } from "./axisScale";

export interface Viewport {
	xMin: number;
	xMax: number;
	yMin: number;
	yMax: number;
	width: number;
	height: number;
	padding?: { top: number; right: number; bottom: number; left: number };
	/** Log10 axes: positions are linear in log10(value); values <= 0 map to NaN. */
	xLog?: boolean;
	yLog?: boolean;
}

/**
 * Transforms world coordinates to screen/canvas coordinates.
 * @param {number} x - World coordinate on X-axis
 * @param {number} y - World coordinate on Y-axis
 * @param {Viewport} view - Viewport configuration with bounds, dimensions, and padding
 * @returns {{x: number, y: number}} Screen coordinates relative to canvas origin
 */
export const worldToScreen = (x: number, y: number, view: Viewport) => {
	const p = view.padding || { top: 0, right: 0, bottom: 0, left: 0 };
	const chartWidth = view.width - p.left - p.right;
	const chartHeight = view.height - p.top - p.bottom;

	const xRange = view.xMax - view.xMin;
	const yRange = view.yMax - view.yMin;
	// A zero-width range (e.g. a single data point) would divide by zero; center
	// the degenerate axis instead of emitting NaN/Infinity screen coords.
	const fx =
		xRange !== 0 ? axisFraction(x, view.xMin, view.xMax, !!view.xLog) : 0.5;
	const fy =
		yRange !== 0 ? axisFraction(y, view.yMin, view.yMax, !!view.yLog) : 0.5;
	const sx = p.left + fx * chartWidth;
	const sy = view.height - p.bottom - fy * chartHeight;
	return { x: sx, y: sy };
};

/**
 * Inverse transform: converts screen/canvas coordinates back to world coordinates.
 * @param {number} sx - Screen X coordinate relative to canvas origin
 * @param {number} sy - Screen Y coordinate relative to canvas origin
 * @param {Viewport} view - Viewport configuration with bounds, dimensions, and padding
 * @returns {{x: number, y: number}} World coordinates in data space
 */
export const screenToWorld = (sx: number, sy: number, view: Viewport) => {
	const p = view.padding || { top: 0, right: 0, bottom: 0, left: 0 };
	const chartWidth = view.width - p.left - p.right;
	const chartHeight = view.height - p.top - p.bottom;

	const x = axisValueAt(
		(sx - p.left) / chartWidth,
		view.xMin,
		view.xMax,
		!!view.xLog,
	);
	const y = axisValueAt(
		(view.height - p.bottom - sy) / chartHeight,
		view.yMin,
		view.yMax,
		!!view.yLog,
	);
	return { x, y };
};
