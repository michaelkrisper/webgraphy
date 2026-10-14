// Readout of the measurement cursors and the visible-range statistics.
// Lazy-loaded by MeasureTools: neither is needed until first used.

import { X } from "lucide-react";
import type React from "react";
import { useEffect, useMemo, useState } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import { swatchStyle } from "../crosshair/swatch";
import { buildReadout, DASH, formatNumber } from "./measureFormat";
import type { Pin } from "./pins";
import { buildStatsRows, type StatsRow } from "./visibleStats";

/** Stats wait for the viewport to rest before scanning the columns. */
export const STATS_SETTLE_MS = 150;

const Swatch: React.FC<{ color: string; lineStyle: string }> = ({
	color,
	lineStyle,
}) => {
	const st = swatchStyle(color, lineStyle);
	return (
		<span
			className="chart-tooltip-swatch"
			aria-hidden="true"
			data-dot={st.dot ? "true" : undefined}
			style={{ borderTop: st.borderTop, backgroundColor: st.backgroundColor }}
		/>
	);
};

const PanelHeader: React.FC<{
	title: string;
	closeLabel: string;
	onClose: () => void;
}> = ({ title, closeLabel, onClose }) => (
	<div className="measure-panel-header">
		<span className="measure-panel-title">{title}</span>
		<button
			type="button"
			className="measure-panel-close"
			aria-label={closeLabel}
			onClick={onClose}
		>
			<X size={12} />
		</button>
	</div>
);

interface ReadoutProps {
	a: Pin;
	b: Pin | null;
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	xAxisNames: Record<string, string>;
	onClose: () => void;
}

export const MeasureReadout: React.FC<ReadoutProps> = ({
	a,
	b,
	xAxes,
	yAxes,
	xAxisNames,
	onClose,
}) => {
	const r = useMemo(
		() => buildReadout(a, b, xAxes, yAxes, xAxisNames),
		[a, b, xAxes, yAxes, xAxisNames],
	);
	return (
		<section className="measure-panel" aria-label="Cursor measurement">
			<PanelHeader
				title={r.hasB ? "Cursors A → B" : "Cursor A — click to set B"}
				closeLabel="Clear cursors"
				onClose={onClose}
			/>
			<table className="measure-table">
				<thead>
					<tr>
						<th scope="col">
							<span className="measure-sr-only">Series</span>
						</th>
						<th scope="col">A</th>
						{r.hasB && (
							<>
								<th scope="col">B</th>
								<th scope="col">Δ</th>
								<th scope="col">Δ/Δx</th>
								{r.showRatio && (
									<th scope="col" title="Ratio B / A (log axes)">
										B/A
									</th>
								)}
							</>
						)}
					</tr>
				</thead>
				<tbody>
					{r.xRows.map((x) => (
						<tr key={x.xAxisId} className="measure-x-row">
							<th scope="row">{x.name}</th>
							<td>{x.a}</td>
							{r.hasB && (
								<>
									<td>{x.b}</td>
									<td>{x.delta ?? DASH}</td>
									<td />
									{r.showRatio && <td>{x.ratio ?? ""}</td>}
								</>
							)}
						</tr>
					))}
					{r.seriesRows.map((s) => (
						<tr key={s.seriesId}>
							<th scope="row">
								<Swatch color={s.color} lineStyle={s.lineStyle} />
								{s.label}
							</th>
							<td>{s.a}</td>
							{r.hasB && (
								<>
									<td>{s.b}</td>
									<td>{s.delta ?? DASH}</td>
									<td>{s.slope ?? DASH}</td>
									{r.showRatio && <td>{s.ratio ?? ""}</td>}
								</>
							)}
						</tr>
					))}
				</tbody>
			</table>
		</section>
	);
};

interface StatsProps {
	series: SeriesConfig[];
	datasets: Dataset[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	onClose: () => void;
}

export const StatsPanel: React.FC<StatsProps> = ({
	series,
	datasets,
	xAxes,
	yAxes,
	onClose,
}) => {
	const [rows, setRows] = useState<StatsRow[]>(() =>
		buildStatsRows(series, datasets, xAxes, yAxes),
	);
	// The store's axis ranges change once per settled pan/zoom, but keyboard
	// navigation can commit on consecutive frames: debounce the column scans.
	useEffect(() => {
		const t = setTimeout(
			() => setRows(buildStatsRows(series, datasets, xAxes, yAxes)),
			STATS_SETTLE_MS,
		);
		return () => clearTimeout(t);
	}, [series, datasets, xAxes, yAxes]);

	return (
		<section className="measure-panel" aria-label="Visible range statistics">
			<PanelHeader
				title="Visible range"
				closeLabel="Close statistics"
				onClose={onClose}
			/>
			<table className="measure-table">
				<thead>
					<tr>
						<th scope="col">
							<span className="measure-sr-only">Series</span>
						</th>
						<th scope="col">n</th>
						<th scope="col">min</th>
						<th scope="col">max</th>
						<th scope="col">mean</th>
						<th scope="col">std</th>
					</tr>
				</thead>
				<tbody>
					{rows.map((row) => {
						const st = row.stats;
						const num = (v: number | undefined) =>
							st && !row.categorical && v !== undefined ? formatNumber(v) : DASH;
						return (
							<tr key={row.seriesId}>
								<th scope="row">
									<Swatch color={row.color} lineStyle={row.lineStyle} />
									{row.label}
								</th>
								<td>{st ? st.n.toLocaleString() : 0}</td>
								<td>{num(st?.min)}</td>
								<td>{num(st?.max)}</td>
								<td>{num(st?.mean)}</td>
								<td>{num(st?.std)}</td>
							</tr>
						);
					})}
				</tbody>
			</table>
		</section>
	);
};
