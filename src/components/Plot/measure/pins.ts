// Measurement pins: click-placed cursors A and B, held in data coordinates
// so they stay on their samples through pan and zoom.

import { computeSnap } from "../crosshair/computeSnap";
import type { SeriesMetadata, SnapResult } from "../crosshair/types";

export interface PinPoint {
	seriesId: string;
	label: string;
	color: string;
	lineStyle: string;
	pointStyle: string;
	xAxisId: string;
	yAxisId: string;
	/** World coordinates of the snapped sample on the series' own axes. */
	x: number;
	y: number;
	/** Tooltip-formatted x (date/category aware). */
	xLabel: string;
	/** Category label of `y`, if the column is categorical. */
	valueLabel?: string;
}

export interface Pin {
	xAxisId: string;
	x: number;
	points: PinPoint[];
}

export interface PinPair {
	a: Pin | null;
	b: Pin | null;
}

export type PinId = "a" | "b";

export const NO_PINS: PinPair = { a: null, b: null };

export function pinFromSnap(snap: SnapResult): Pin {
	const points: PinPoint[] = [];
	for (const g of snap.entries) {
		for (const i of g.items) {
			points.push({
				seriesId: i.seriesId,
				label: i.label,
				color: i.color,
				lineStyle: i.lineStyle,
				pointStyle: i.pointStyle,
				xAxisId: i.xAxisId,
				yAxisId: i.yAxisId,
				x: i.xValue,
				y: i.value,
				xLabel: g.xLabel,
				valueLabel: i.valueLabel,
			});
		}
	}
	return { xAxisId: snap.snapXAxisId, x: snap.snapX, points };
}

/** First click sets A, later clicks (re)place B so A stays the reference. */
export function addPin(pins: PinPair, pin: Pin): PinPair {
	return pins.a ? { a: pins.a, b: pin } : { a: pin, b: null };
}

/** Removing A promotes B, so a lone pin is always A. */
export function removePin(pins: PinPair, id: PinId): PinPair {
	return id === "a" ? { a: pins.b, b: null } : { a: pins.a, b: null };
}

type Range = { min: number; max: number };

/**
 * The pin a click at screen `pos` places: the crosshair's snap, evaluated
 * against the live (possibly still easing) axis ranges rather than the last
 * committed store ranges.
 */
export function pinAtScreen(
	pos: { x: number; y: number },
	metadata: readonly SeriesMetadata[],
	liveX: Readonly<Record<string, Range | undefined>>,
	liveY: Readonly<Record<string, Range | undefined>>,
	xAxisNameById: Record<string, string>,
	width: number,
	height: number,
	padding: { top: number; right: number; bottom: number; left: number },
): Pin | null {
	const live = metadata.map((m) => {
		const x = liveX[m.xAxis.id];
		const y = liveY[m.axis.id];
		return {
			...m,
			xAxis: x ? { ...m.xAxis, min: x.min, max: x.max } : m.xAxis,
			axis: y ? { ...m.axis, min: y.min, max: y.max } : m.axis,
		};
	});
	const snap = computeSnap({
		pos,
		seriesMetadata: live,
		xAxisNameById,
		width,
		height,
		padding,
	});
	return snap ? pinFromSnap(snap) : null;
}
