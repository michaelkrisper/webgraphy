import { ClipboardCopy, Download } from "lucide-react";
import { useMemo } from "react";
import {
	type ExportFeedback,
	exportVisibleCsv,
} from "../../services/csvExport";
import { Modal } from "../Layout/Modal";
import {
	buildPlotDataTable,
	formatTableValue,
	MAX_TABLE_ROWS,
	type PlotDataTableInput,
	plotTableToTsv,
} from "./plotDataTable";

interface Props extends PlotDataTableInput {
	onClose: () => void;
	/**
	 * Toast functions from the host. Importing the notification store from
	 * this lazy chunk makes the bundler split React out of the entry chunk.
	 */
	feedback: ExportFeedback;
}

/**
 * The "View data" surface. Deliberately a visible control rather than an
 * offscreen region: reading exact values off a chart is something sighted
 * users want too, and a control that everyone uses is a control that stays
 * working.
 */
export function PlotDataTableModal({
	series,
	datasets,
	xAxes,
	onClose,
	feedback,
}: Props) {
	const tables = useMemo(
		() => buildPlotDataTable({ series, datasets, xAxes }),
		[series, datasets, xAxes],
	);

	const copyTable = async () => {
		const rows = tables.reduce((n, t) => n + t.rows.length, 0);
		try {
			// `navigator.clipboard` is absent outside secure contexts.
			if (!navigator.clipboard) throw new Error("Clipboard is unavailable");
			await navigator.clipboard.writeText(plotTableToTsv(tables));
			feedback.notify({
				kind: "success",
				message: `Copied ${rows.toLocaleString()} rows to the clipboard`,
			});
		} catch (err) {
			feedback.notify({
				kind: "error",
				message: `Could not copy the table: ${err instanceof Error ? err.message : String(err)}`,
			});
		}
	};

	const footer = (
		<>
			<button
				type="button"
				className="modal-btn"
				onClick={copyTable}
				disabled={tables.length === 0}
			>
				<ClipboardCopy size={14} aria-hidden="true" />
				Copy table
			</button>
			<button
				type="button"
				className="modal-btn modal-btn--primary"
				data-autofocus
				onClick={() => void exportVisibleCsv({ series, datasets, xAxes }, feedback)}
				disabled={tables.length === 0}
				title="Every row in the visible range, not just the sampled ones"
			>
				<Download size={14} aria-hidden="true" />
				Export CSV
			</button>
		</>
	);

	return (
		<Modal
			onClose={onClose}
			footer={footer}
			title="Plotted data"
			ariaLabel="Close plotted data"
			maxWidth="720px"
		>
			<p className="plot-data-note">
				The visible section of each series, sampled exactly as the chart draws it —
				at most {MAX_TABLE_ROWS} rows per series.
			</p>
			<div className="plot-data-scroll">
				{tables.length === 0 ? (
					<p>No data series are displayed.</p>
				) : (
					tables.map((t) => (
						<table key={t.id} className="plot-data-table">
							<caption>
								{t.name}
								{t.truncated ? ` (first ${MAX_TABLE_ROWS} rows)` : ""}
							</caption>
							<thead>
								<tr>
									<th scope="col">{t.xAxisName}</th>
									<th scope="col">{t.name}</th>
								</tr>
							</thead>
							<tbody>
								{t.rows.map((r, i) => (
									<tr key={`${r.x}-${i}`}>
										<td>{formatTableValue(r.x, t.xMode)}</td>
										<td>{formatTableValue(r.y)}</td>
									</tr>
								))}
							</tbody>
						</table>
					))
				)}
			</div>
		</Modal>
	);
}
