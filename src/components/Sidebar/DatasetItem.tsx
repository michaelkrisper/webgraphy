import { Calculator, Pencil, Trash2 } from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { deleteWithUndo } from "../../store/undoToast";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import { PopupPicker, type PopupPickerOption } from "./PopupPicker";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { buildSeriesConfig, pickYAxisId } from "../../utils/series";
import { getColumnIndex } from "../../utils/columns";

const FLASH_MS = 1200;

/**
 * Point the user at an existing series instead of plotting a duplicate:
 * scroll its sidebar row into view, flash it, and emphasise it on the chart.
 */
function revealSeries(seriesId: string) {
	const row = Array.from(
		document.querySelectorAll<HTMLElement>("[data-series-id]"),
	).find((el) => el.dataset.seriesId === seriesId);
	if (row) {
		row.scrollIntoView?.({ block: "nearest" });
		row.classList.remove("sb-series-row--flash");
		// Force a reflow so re-adding the class restarts the animation.
		void row.offsetWidth;
		row.classList.add("sb-series-row--flash");
		setTimeout(() => row.classList.remove("sb-series-row--flash"), FLASH_MS);
	}
	const store = useGraphStore.getState();
	store.setHighlightedSeries(seriesId);
	setTimeout(() => {
		if (useGraphStore.getState().highlightedSeriesId === seriesId) {
			useGraphStore.getState().setHighlightedSeries(null);
		}
	}, FLASH_MS);
}

const X_AXIS_OPTIONS: PopupPickerOption<number>[] = Array.from(
	{ length: 9 },
	(_, i) => {
		const n = i + 1;
		return {
			value: n,
			icon: <span style={{ fontWeight: "bold" }}>{n}</span>,
			label: `X-Axis ${n}`,
		};
	},
);

interface DatasetItemProps {
	dataset: Dataset;
	setCalculatingDatasetId: (id: string) => void;
	setEditingColumn: (
		col: {
			datasetId: string;
			name: string;
			formula: string;
		} | null,
	) => void;
}

export const DatasetItem: React.FC<DatasetItemProps> = ({
	dataset: ds,
	setCalculatingDatasetId,
	setEditingColumn,
}) => {
	const datasets = useGraphStore((s) => s.datasets);
	const series = useGraphStore((s) => s.series);
	const removeDataset = useGraphStore((s) => s.removeDataset);
	const updateDataset = useGraphStore((s) => s.updateDataset);
	const addSeries = useGraphStore((s) => s.addSeries);
	const removeCalculatedColumn = useGraphStore((s) => s.removeCalculatedColumn);
	const renameColumn = useGraphStore((s) => s.renameColumn);

	const [themeName] = useTheme();
	const t = THEMES[themeName];

	const [renamingColumn, setRenamingColumn] = useState<{
		datasetId: string;
		col: string;
		value: string;
	} | null>(null);

	const seriesByColumn = useMemo(() => {
		const map = new Map<string, SeriesConfig>();
		for (const s of series) {
			if (s.sourceId === ds.id && !map.has(s.yColumn)) map.set(s.yColumn, s);
		}
		return map;
	}, [series, ds.id]);

	const createSeries = (columnName: string) => {
		const colIdx = getColumnIndex(ds, columnName);
		const col = ds.data[colIdx];
		const isCategorical = colIdx >= 0 && !!col?.categoryLabels;
		// Read at click time: subscribing to axis ranges would re-render the
		// sidebar on every pan/zoom sync.
		const { yAxes } = useGraphStore.getState();
		addSeries(
			buildSeriesConfig(columnName, ds.id, series.length, isCategorical, {
				yAxisId: pickYAxisId(series, yAxes, col?.bounds),
				pointCount: ds.rowCount,
			}),
		);
	};

	return (
		<div
			style={{
				backgroundColor: t.bg,
				borderRadius: "0",
				borderTop: `1px solid ${t.cardBorder}`,
				borderBottom: `1px solid ${t.cardBorder}`,
				overflow: "hidden",
				boxShadow: `0 1px 3px ${t.shadow}`,
			}}
		>
			<div
				style={{
					padding: "6px 10px",
					borderBottom: `1px solid ${t.bg3}`,
					display: "flex",
					justifyContent: "space-between",
					alignItems: "center",
					gap: "4px",
				}}
			>
				<span
					style={{
						fontWeight: "700",
						fontSize: "0.85rem",
						color: t.textMid,
						whiteSpace: "nowrap",
						overflow: "hidden",
						textOverflow: "ellipsis",
						minWidth: 0,
						flex: "0 1 auto",
					}}
					title={ds.name}
				>
					{ds.name}
				</span>
				<span className="sb-dataset-meta">
					{ds.rowCount.toLocaleString()} lines
				</span>
				<div
					style={{
						display: "flex",
						gap: "4px",
						alignItems: "center",
						flexShrink: 0,
					}}
				>
					<div
						style={{
							display: "flex",
							gap: "0",
							alignItems: "center",
						}}
					>
						{datasets.length > 1 && (
							<PopupPicker
								options={X_AXIS_OPTIONS}
								current={parseInt((ds.xAxisId || "axis-1").split("-")[1], 10) || 1}
								onChange={(n) => updateDataset(ds.id, { xAxisId: `axis-${n}` })}
								popoverId={`x-axis-popover-${ds.id}`}
								renderTrigger={({ onClick, ref }) => (
									<button
										ref={ref}
										className="sb-xaxis-btn-mono"
										onClick={onClick}
										type="button"
										title="Select X-Axis (1-9)"
										aria-label="Select X-Axis"
										style={{
											padding: "0 5px",
											height: "22px",
											boxSizing: "border-box",
											background: "none",
											borderTop: `1px solid ${t.border}`,
											borderBottom: `1px solid ${t.border}`,
											borderLeft: `1px solid ${t.border}`,
											borderRight: "none",
											cursor: "pointer",
											color: t.accent,
											display: "flex",
											alignItems: "center",
											justifyContent: "center",
											fontSize: "0.75rem",
											fontWeight: "bold",
										}}
									>
										{(ds.xAxisId || "axis-1").split("-")[1]}
									</button>
								)}
							/>
						)}
						<select
							value={ds.xAxisColumn}
							onChange={(e) =>
								updateDataset(ds.id, {
									xAxisColumn: e.target.value,
								})
							}
							title="X-Axis"
							aria-label={`X-axis column for ${ds.name}`}
							style={{
								fontSize: "0.75rem",
								height: "22px",
								boxSizing: "border-box",
								padding: "0 4px",
								border: `1px solid ${t.border}`,
								background: t.selectBg,
								color: t.selectColor,
								maxWidth: "100px",
							}}
						>
							{ds.columns.map((c) => (
								<option key={c} value={c}>
									{c}
								</option>
							))}
						</select>
					</div>
					<button
						onClick={() => setCalculatingDatasetId(ds.id)}
						style={{
							padding: "4px",
							background: "none",
							border: "none",
							cursor: "pointer",
							color: t.textMuted,
						}}
						type="button"
						title="Add Calculated Column"
						aria-label="Add Calculated Column"
					>
						<Calculator size={16} />
					</button>
					<button
						type="button"
						onClick={() => deleteWithUndo(ds.name, () => removeDataset(ds.id))}
						style={{
							padding: "4px",
							background: "none",
							border: "none",
							cursor: "pointer",
							color: t.danger,
						}}
						title="Delete Dataset"
						aria-label="Delete Dataset"
					>
						<Trash2 size={16} />
					</button>
				</div>
			</div>

			<div className="col-chip-grid">
				{ds.columns.map((col, colIdx) => {
					const plotted = seriesByColumn.get(col);
					const isX = ds.xAxisColumn === col;
					if (isX) return null;
					const colData = ds.data[colIdx];
					const isCalc = !!colData?.formula;
					const label = col;
					const isRenaming =
						renamingColumn?.datasetId === ds.id && renamingColumn?.col === col;
					return (
						<div
							key={col}
							className={`col-chip${plotted ? " col-chip--plotted" : ""}`}
						>
							{isRenaming ? (
								<input
									value={renamingColumn.value}
									onChange={(e) =>
										setRenamingColumn((prev) =>
											prev ? { ...prev, value: e.target.value } : prev,
										)
									}
									onBlur={() => {
										renameColumn(ds.id, col, renamingColumn.value);
										setRenamingColumn(null);
									}}
									onKeyDown={(e) => {
										if (e.key === "Enter") {
											renameColumn(ds.id, col, renamingColumn.value);
											setRenamingColumn(null);
										} else if (e.key === "Escape") {
											setRenamingColumn(null);
										}
									}}
									style={{
										fontSize: "0.7rem",
										padding: "3px 8px",
										border: "none",
										background: "none",
										color: t.accent,
										fontWeight: "600",
										width: "100%",
										outline: "none",
										boxSizing: "border-box",
									}}
								/>
							) : (
								<>
									<button
										type="button"
										className="col-chip-btn"
										aria-pressed={!!plotted}
										onClick={() =>
											plotted ? revealSeries(plotted.id) : createSeries(col)
										}
										title={[
											label,
											isCalc && `Formula: ${colData.formula}`,
											plotted && "Plotted: click to show its series",
										]
											.filter(Boolean)
											.join("\n")}
									>
										{plotted && (
											<span
												className="col-chip-swatch"
												aria-hidden="true"
												style={{
													backgroundColor:
														plotted.lineStyle === "none"
															? plotted.pointColor
															: plotted.lineColor,
												}}
											/>
										)}
										{isCalc ? `ƒ ${label}` : label}
									</button>
									<div className="col-chip-actions">
										<button
											onClick={() =>
												setRenamingColumn({
													datasetId: ds.id,
													col,
													value: label,
												})
											}
											style={{
												display: "flex",
												alignItems: "center",
												padding: "2px 4px",
												border: "none",
												background: "none",
												color: t.textMuted,
												cursor: "pointer",
											}}
											type="button"
											title="Rename column"
											aria-label="Rename column"
										>
											<Pencil size={10} />
										</button>
										{isCalc && (
											<>
												<button
													onClick={() =>
														setEditingColumn({
															datasetId: ds.id,
															name: col,
															formula: colData.formula ?? "",
														})
													}
													style={{
														fontSize: "0.65rem",
														padding: "2px 4px",
														border: "none",
														background: "none",
														color: t.accent,
														cursor: "pointer",
													}}
													type="button"
													title="Edit formula"
													aria-label="Edit formula"
												>
													✎
												</button>
												<button
													onClick={() =>
														deleteWithUndo(col, () => removeCalculatedColumn(ds.id, col))
													}
													style={{
														display: "flex",
														alignItems: "center",
														padding: "2px 4px",
														border: "none",
														background: "none",
														color: t.danger,
														cursor: "pointer",
													}}
													type="button"
													title="Delete calculated column"
													aria-label="Delete calculated column"
												>
													<Trash2 size={10} />
												</button>
											</>
										)}
									</div>
								</>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
};
