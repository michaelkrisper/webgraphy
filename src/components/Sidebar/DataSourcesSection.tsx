import {
	Calculator,
	ChevronDown,
	ChevronRight,
	Pencil,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useMemo, useState } from "react";
import { useTheme } from "../../hooks/useTheme";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import { buildSeriesConfig } from "../../utils/series";
import ErrorBoundary from "../ErrorBoundary";
import { CalculatedColumnModal } from "../Layout/CalculatedColumnModal";
import { PopupPicker, type PopupPickerOption } from "./PopupPicker";

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

interface DataSourcesSectionProps {
	open: boolean;
	onToggle: () => void;
	fileInputRef: React.RefObject<HTMLInputElement | null>;
	importFile: (file: File) => void;
}

export const DataSourcesSection: React.FC<DataSourcesSectionProps> = ({
	open,
	onToggle,
	fileInputRef,
	importFile,
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

	const [calculatingDatasetId, setCalculatingDatasetId] = useState<
		string | null
	>(null);
	const [editingColumn, setEditingColumn] = useState<{
		datasetId: string;
		name: string;
		formula: string;
	} | null>(null);
	const [renamingColumn, setRenamingColumn] = useState<{
		datasetId: string;
		col: string;
		value: string;
	} | null>(null);

	const selectedDatasetForCalc = useMemo(() => {
		return datasets.find((d) => d.id === calculatingDatasetId);
	}, [datasets, calculatingDatasetId]);

	const createSeries = (datasetId: string, columnName: string) => {
		const dataset = datasets.find((d) => d.id === datasetId);
		if (!dataset) return;

		const colIdx = dataset.columns.indexOf(columnName);
		const isCategorical = colIdx >= 0 && !!dataset.data[colIdx]?.categoryLabels;
		addSeries(
			buildSeriesConfig(columnName, datasetId, series.length, isCategorical),
		);
	};

	return (
		<ErrorBoundary level="component">
			<section style={{ marginBottom: "24px" }}>
				<div
					style={{
						display: "flex",
						alignItems: "center",
						justifyContent: "space-between",
					}}
				>
					<button
						type="button"
						onClick={onToggle}
						style={{
							display: "flex",
							alignItems: "center",
							gap: "6px",
							cursor: "pointer",
							flex: 1,
							background: "none",
							border: "none",
							padding: 0,
						}}
					>
						<h2 className="sb-section-title">Data Sources</h2>
						{open ? (
							<ChevronDown size={16} color={t.textMuted} />
						) : (
							<ChevronRight size={16} color={t.textMuted} />
						)}
					</button>{" "}
				</div>
				<input
					ref={fileInputRef}
					type="file"
					accept=".csv,.json,.xlsx,.xls"
					onChange={(e) => {
						const f = e.target.files?.[0];
						if (f) importFile(f);
						e.target.value = "";
					}}
					style={{ display: "none" }}
				/>

				{open && (
					<div
						style={{
							display: "flex",
							flexDirection: "column",
							gap: "12px",
						}}
					>
						{datasets.length === 0 && (
							<div
								style={{
									padding: "12px 16px",
									color: t.textLight,
									fontSize: "0.85rem",
									lineHeight: "1.4",
									textAlign: "center",
									fontStyle: "italic",
								}}
							>
								Add datasources by importing or drag and drop on the graph
								surface
							</div>
						)}

						{datasets.map((ds) => (
							<div
								key={ds.id}
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
										{ds.name.includes(": ") ? ds.name.split(": ")[1] : ds.name}
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
											<PopupPicker
												options={X_AXIS_OPTIONS}
												current={
													parseInt(
														(ds.xAxisId || "axis-1").split("-")[1],
														10,
													) || 1
												}
												onChange={(n) =>
													updateDataset(ds.id, { xAxisId: `axis-${n}` })
												}
												popoverId={`x-axis-popover-${ds.id}`}
												renderTrigger={({ onClick, ref }) => (
													<button
														ref={ref}
														className="sb-xaxis-btn-mono"
														onClick={
															datasets.length === 1 ? undefined : onClick
														}
														type="button"
														title="Select X-Axis (1-9)"
														disabled={datasets.length === 1}
														style={{
															padding: "0 5px",
															height: "22px",
															boxSizing: "border-box",
															background: "none",
															borderTop: `1px solid ${t.border}`,
															borderBottom: `1px solid ${t.border}`,
															borderLeft: `1px solid ${t.border}`,
															borderRight: "none",
															cursor:
																datasets.length === 1 ? "default" : "pointer",
															color: t.accent,
															display: "flex",
															alignItems: "center",
															justifyContent: "center",
															fontSize: "0.75rem",
															fontWeight: "bold",
															opacity: datasets.length === 1 ? 0.3 : 1,
														}}
													>
														{(ds.xAxisId || "axis-1").split("-")[1]}
													</button>
												)}
											/>
											<select
												value={ds.xAxisColumn}
												onChange={(e) =>
													updateDataset(ds.id, {
														xAxisColumn: e.target.value,
													})
												}
												title="X-Axis"
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
														{c.includes(": ") ? c.split(": ")[1] : c}
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
										>
											<Calculator size={16} />
										</button>
										<button
											type="button"
											onClick={() => removeDataset(ds.id)}
											style={{
												padding: "4px",
												background: "none",
												border: "none",
												cursor: "pointer",
												color: t.danger,
											}}
											title="Delete Dataset"
										>
											<Trash2 size={16} />
										</button>
									</div>
								</div>

								<div
									style={{
										display: "grid",
										gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
										gap: "0",
										borderTop: `1px solid ${t.accent}`,
										borderLeft: `1px solid ${t.accent}`,
									}}
								>
									{ds.columns.map((col, colIdx) => {
										const isUsed = series.some(
											(s) => s.sourceId === ds.id && s.yColumn === col,
										);
										const isX = ds.xAxisColumn === col;
										if (isX) return null;
										const colData = ds.data[colIdx];
										const isCalc = !!colData?.formula;
										const label = col.includes(": ") ? col.split(": ")[1] : col;
										const isRenaming =
											renamingColumn?.datasetId === ds.id &&
											renamingColumn?.col === col;
										return (
											<div
												key={col}
												className="col-chip"
												style={{
													borderRight: `1px solid ${t.accent}`,
													borderBottom: `1px solid ${t.accent}`,
													backgroundColor: t.bg3,
													opacity: isUsed ? 0.7 : 1,
												}}
											>
												{isRenaming ? (
													<input
														value={renamingColumn.value}
														onChange={(e) =>
															setRenamingColumn((prev) =>
																prev
																	? { ...prev, value: e.target.value }
																	: prev,
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
															onClick={() => createSeries(ds.id, col)}
															style={{
																fontSize: "0.7rem",
																padding: "3px 8px",
																borderRadius: "0",
																border: "none",
																background: "none",
																color: t.accent,
																cursor: "pointer",
																fontWeight: "600",
															}}
															title={
																isCalc
																	? `${label}\nFormula: ${colData.formula}`
																	: label
															}
														>
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
																	borderLeft: `1px solid ${t.accent}`,
																}}
																type="button"
																title="Rename column"
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
																			borderLeft: `1px solid ${t.accent}`,
																		}}
																		type="button"
																		title="Edit formula"
																	>
																		✎
																	</button>
																	<button
																		onClick={() =>
																			removeCalculatedColumn(ds.id, col)
																		}
																		style={{
																			display: "flex",
																			alignItems: "center",
																			padding: "2px 4px",
																			border: "none",
																			background: "none",
																			color: t.danger,
																			cursor: "pointer",
																			borderLeft: `1px solid ${t.accent}`,
																		}}
																		type="button"
																		title="Delete calculated column"
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
						))}
					</div>
				)}
			</section>

			{selectedDatasetForCalc && (
				<CalculatedColumnModal
					dataset={selectedDatasetForCalc}
					onClose={() => setCalculatingDatasetId(null)}
				/>
			)}
			{editingColumn &&
				(() => {
					const ds = datasets.find((d) => d.id === editingColumn.datasetId);
					return ds ? (
						<CalculatedColumnModal
							dataset={ds}
							initialName={editingColumn.name}
							initialFormula={editingColumn.formula}
							onClose={() => setEditingColumn(null)}
						/>
					) : null;
				})()}
		</ErrorBoundary>
	);
};
