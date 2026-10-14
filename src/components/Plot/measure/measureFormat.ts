// Pure formatting and row models for the measurement readout (pins A/B).

import type { XAxisConfig, YAxisConfig } from "../../../services/persistence";
import { UNIT_SECONDS } from "../../../utils/time";
import type { Pin, PinPoint } from "./pins";

export const DASH = "—";

/** Six significant digits; exponent form for very small or large magnitudes. */
export function formatNumber(v: number, signed = false): string {
	if (!Number.isFinite(v)) return DASH;
	const abs = Math.abs(v);
	if (abs !== 0 && (abs < 1e-4 || abs >= 1e12)) {
		const s = v.toExponential(4).replace(/\.?0+e/, "e");
		return signed && v > 0 ? `+${s}` : s;
	}
	return v.toLocaleString(undefined, {
		maximumSignificantDigits: 6,
		signDisplay: signed ? "exceptZero" : "auto",
	});
}

const pad2 = (n: number) => String(n).padStart(2, "0");

/**
 * Signed duration of `seconds` (date axes store epoch seconds): "250 ms",
 * "42.5 s", "5m 03s", "2h 05m 07s", "3d 04h 05m".
 */
export function formatDuration(seconds: number): string {
	if (!Number.isFinite(seconds)) return DASH;
	const sign = seconds < 0 ? "-" : seconds > 0 ? "+" : "";
	const abs = Math.abs(seconds);
	if (abs < 1) {
		return `${sign}${parseFloat((abs * 1000).toPrecision(4))} ms`;
	}
	if (abs < 60) return `${sign}${parseFloat(abs.toPrecision(4))} s`;
	const total = Math.round(abs);
	const d = Math.floor(total / 86400);
	const h = Math.floor((total % 86400) / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = total % 60;
	if (d > 0) return `${sign}${d}d ${pad2(h)}h ${pad2(m)}m`;
	if (h > 0) return `${sign}${h}h ${pad2(m)}m ${pad2(s)}s`;
	return `${sign}${m}m ${pad2(s)}s`;
}

const RATE_UNITS = [
	{ label: "d", seconds: UNIT_SECONDS.day },
	{ label: "h", seconds: UNIT_SECONDS.hour },
	{ label: "min", seconds: UNIT_SECONDS.minute },
	{ label: "s", seconds: UNIT_SECONDS.second },
] as const;

/**
 * Δy/Δx. On a date axis the rate is per the largest time unit the span
 * covers ("/h" for a 3-hour span), so it reads in the span's own scale.
 */
export function formatSlope(dy: number, dx: number, isDate: boolean): string {
	if (!(dx !== 0) || !Number.isFinite(dx) || !Number.isFinite(dy)) return DASH;
	if (!isDate) return formatNumber(dy / dx, true);
	const span = Math.abs(dx);
	const unit =
		RATE_UNITS.find((u) => span >= u.seconds) ??
		RATE_UNITS[RATE_UNITS.length - 1];
	return `${formatNumber(dy / (dx / unit.seconds), true)}/${unit.label}`;
}

/** b / a — what a log axis measures. Only defined for positive values. */
export function formatRatio(a: number, b: number): string {
	if (!(a > 0) || !(b > 0)) return DASH;
	return `×${formatNumber(b / a)}`;
}

export interface ReadoutXRow {
	xAxisId: string;
	name: string;
	a: string;
	b?: string;
	delta?: string;
	ratio?: string;
}

export interface ReadoutSeriesRow {
	seriesId: string;
	label: string;
	color: string;
	lineStyle: string;
	a: string;
	b?: string;
	delta?: string;
	slope?: string;
	ratio?: string;
}

export interface Readout {
	xRows: ReadoutXRow[];
	seriesRows: ReadoutSeriesRow[];
	hasB: boolean;
	/** A log axis is involved: the ratio column is shown. */
	showRatio: boolean;
}

const pointValue = (p: PinPoint | undefined) =>
	!p ? DASH : (p.valueLabel ?? formatNumber(p.y));

/**
 * Rows for the readout: one per x axis (A, B, Δx, ratio on log axes) and one
 * per series (A, B, Δy, Δy/Δx over that series' own Δx, ratio on log y axes).
 * Series are grouped by y axis so deltas that share units sit together.
 */
export function buildReadout(
	a: Pin,
	b: Pin | null,
	xAxes: readonly Pick<XAxisConfig, "id" | "xMode" | "scale">[],
	yAxes: readonly Pick<YAxisConfig, "id" | "scale">[],
	xAxisNameById: Record<string, string>,
): Readout {
	const xById = new Map(xAxes.map((x) => [x.id, x]));
	const yLogById = new Map(yAxes.map((y) => [y.id, y.scale === "log"]));
	const firstOnX = (pin: Pin | null, xAxisId: string) =>
		pin?.points.find((p) => p.xAxisId === xAxisId);

	const xIds: string[] = [];
	for (const pin of [a, b]) {
		for (const p of pin?.points ?? []) {
			if (!xIds.includes(p.xAxisId)) xIds.push(p.xAxisId);
		}
	}
	let showRatio = false;
	const xRows = xIds.map((xAxisId): ReadoutXRow => {
		const axis = xById.get(xAxisId);
		const pa = firstOnX(a, xAxisId);
		const pb = firstOnX(b, xAxisId);
		const row: ReadoutXRow = {
			xAxisId,
			name: xAxisNameById[xAxisId] || "x",
			a: pa?.xLabel ?? DASH,
		};
		if (!b) return row;
		row.b = pb?.xLabel ?? DASH;
		if (pa && pb) {
			const dx = pb.x - pa.x;
			row.delta =
				axis?.xMode === "date" ? formatDuration(dx) : formatNumber(dx, true);
			if (axis?.scale === "log") {
				row.ratio = formatRatio(pa.x, pb.x);
				showRatio = true;
			}
		}
		return row;
	});

	const bById = new Map(b?.points.map((p) => [p.seriesId, p]));
	const ordered: PinPoint[] = [...a.points];
	for (const p of b?.points ?? []) {
		if (!a.points.some((q) => q.seriesId === p.seriesId)) ordered.push(p);
	}
	const yOrder = [...new Set(ordered.map((p) => p.yAxisId))];
	ordered.sort((p, q) => yOrder.indexOf(p.yAxisId) - yOrder.indexOf(q.yAxisId));

	const seriesRows = ordered.map((p): ReadoutSeriesRow => {
		const pa = a.points.find((q) => q.seriesId === p.seriesId);
		const pb = bById.get(p.seriesId);
		const row: ReadoutSeriesRow = {
			seriesId: p.seriesId,
			label: p.label,
			color: p.color,
			lineStyle: p.lineStyle,
			a: pointValue(pa),
		};
		if (!b) return row;
		row.b = pointValue(pb);
		if (pa && pb && pa.valueLabel === undefined && pb.valueLabel === undefined) {
			const dy = pb.y - pa.y;
			row.delta = formatNumber(dy, true);
			row.slope = formatSlope(
				dy,
				pb.x - pa.x,
				xById.get(p.xAxisId)?.xMode === "date",
			);
			if (yLogById.get(p.yAxisId)) {
				row.ratio = formatRatio(pa.y, pb.y);
				showRatio = true;
			}
		}
		return row;
	});

	return { xRows, seriesRows, hasB: !!b, showRatio };
}
