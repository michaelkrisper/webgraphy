import {
	ArrowUpDown,
	Calculator,
	ChevronDown,
	ChevronRight,
	Circle,
	Columns3,
	Crosshair,
	FileImage,
	FilePlus,
	FlaskConical,
	Hash,
	Image,
	List,
	Check,
	Minus,
	Moon,
	MoveHorizontal,
	Palette,
	PanelRightClose,
	Pencil,
	Rows3,
	Cat,
	Sun,
	Terminal,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useCallback, useMemo, useRef, useState } from "react";
import { useDataImport } from "../../hooks/useDataImport";
import { useTheme } from "../../hooks/useTheme";
import { downloadFile, exportToPNG, exportToSVG } from "../../services/export";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES, type ThemeName } from "../../themes";
import { buildSeriesConfig } from "../../utils/series";
import packageJson from "../../../package.json";
import ErrorBoundary from "../ErrorBoundary";
import { SeriesConfigUI } from "../Sidebar/SeriesConfig";
import { CalculatedColumnModal } from "./CalculatedColumnModal";
import { CollapsedMenuButton } from "./CollapsedMenuButton";
import { HelpModal } from "./HelpModal";
import { ImportSettingsDialog } from "./ImportSettingsDialog";
import { ImprintModal } from "./ImprintModal";
import { LicenseModal } from "./LicenseModal";

const UnicornHeadIcon = ({ size = 24 }: { size?: number }) => (
	<svg
		xmlns="http://www.w3.org/2000/svg"
		width={size}
		height={size}
		viewBox="0 0 24 24"
		fill="none"
		stroke="currentColor"
		strokeWidth="2"
		strokeLinecap="round"
		strokeLinejoin="round"
	>
		<path d="m15.6 4.8 2.7 2.3" />
		<path d="M15.5 10S19 7 22 2c-6 2-10 5-10 5" />
		<path d="M11.5 12H11" />
		<path d="M5 15a4 4 0 0 0 4 4h7.8l.3.3a3 3 0 0 0 4-4.46L12 7c0-3-1-5-1-5S8 3 8 7c-4 1-6 3-6 3" />
		<path d="M2 4.5C4 3 6 3 6 3l2 4" />
		<path d="M6.14 17.8S4 19 2 22" />
	</svg>
);

const THEME_ICONS: Record<ThemeName, React.ReactNode> = {
	light: <Sun size={24} />,
	dark: <Moon size={24} />,
	matrix: <Terminal size={24} />,
	winnie: <Cat size={24} />,
	unicorn: <UnicornHeadIcon size={24} />,
};

const THEME_LABELS: Record<ThemeName, string> = {
	light: "Light Mode",
	dark: "Dark Mode",
	matrix: "Matrix Mode",
	winnie: "Winnie Mode",
	unicorn: "Unicorn Mode",
};

const HeaderButton = ({
	onClick,
	icon,
	title,
	color,
	off,
}: {
	onClick: () => void;
	icon: React.ReactNode;
	title: string;
	color?: string;
	off?: boolean;
}) => (
	<button
		onClick={onClick}
		title={title}
		className={off ? "sb-hdr-btn sb-hdr-btn--off" : "sb-hdr-btn"}
		style={color ? { color } : undefined}
	>
		{icon}
	</button>
);

/**
 * Sidebar Component
 */
export const Sidebar: React.FC = () => {
	const datasets = useGraphStore((s) => s.datasets);
	const series = useGraphStore((s) => s.series);
	const xAxes = useGraphStore((s) => s.xAxes);
	const yAxes = useGraphStore((s) => s.yAxes);
	const axisTitles = useGraphStore((s) => s.axisTitles);
	const loadDemoData = useGraphStore((s) => s.loadDemoData);
	const removeDataset = useGraphStore((s) => s.removeDataset);
	const updateDataset = useGraphStore((s) => s.updateDataset);
	const updateXAxis = useGraphStore((s) => s.updateXAxis);
	const reorderSeries = useGraphStore((s) => s.reorderSeries);
	const setHighlightedSeries = useGraphStore((s) => s.setHighlightedSeries);
	const addSeries = useGraphStore((s) => s.addSeries);
	const legendVisible = useGraphStore((s) => s.legendVisible);
	const setLegendVisible = useGraphStore((s) => s.setLegendVisible);
	const crosshairVisible = useGraphStore((s) => s.crosshairVisible);
	const setCrosshairVisible = useGraphStore((s) => s.setCrosshairVisible);
	const [themeName, cycleTheme] = useTheme();
	const t = THEMES[themeName];

	const [showImprint, setShowImprint] = useState(false);
	const [showHelp, setShowHelp] = useState(false);
	const [showLicense, setShowLicense] = useState(false);
	const removeCalculatedColumn = useGraphStore((s) => s.removeCalculatedColumn);
	const renameColumn = useGraphStore((s) => s.renameColumn);
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
	const fileInputRef = useRef<HTMLInputElement>(null);

	const handleImport = () => {
		fileInputRef.current?.click();
	};

	const [isCollapsed, setIsCollapsed] = useState(false);
	const [openSections, setOpenSections] = useState({
		sources: true,
		series: true,
	});
	const [dragId, setDragId] = useState<string | null>(null);
	const [dropIndex, setDropIndex] = useState<number | null>(null);
	const seriesListRef = useRef<HTMLDivElement>(null);
	const rowRectsRef = useRef<{ top: number; height: number; id: string }[]>([]);

	const startDrag = useCallback(
		(seriesId: string, startEvent: React.MouseEvent) => {
			if (!seriesListRef.current) return;
			const rows = Array.from(
				seriesListRef.current.querySelectorAll<HTMLElement>("[data-series-id]"),
			);
			rowRectsRef.current = rows.map((r) => {
				const rect = r.getBoundingClientRect();
				return { top: rect.top, height: rect.height, id: r.dataset.seriesId! };
			});

			const startY = startEvent.clientY;
			let hasMoved = false;

			const onMouseMove = (e: MouseEvent) => {
				if (!hasMoved && Math.abs(e.clientY - startY) > 5) {
					hasMoved = true;
					setDragId(seriesId);
					const origIdx = rowRectsRef.current.findIndex((r) => r.id === seriesId);
					setDropIndex(origIdx);
				}

				if (hasMoved) {
					const rects = rowRectsRef.current.filter((r) => r.id !== seriesId);
					let newIdx = rects.length;
					for (let i = 0; i < rects.length; i++) {
						if (e.clientY < rects[i].top + rects[i].height / 2) {
							newIdx = i;
							break;
						}
					}
					setDropIndex(newIdx);
				}
			};
			const onMouseUp = () => {
				window.removeEventListener("mousemove", onMouseMove);
				window.removeEventListener("mouseup", onMouseUp);
				if (hasMoved) {
					setDropIndex((prevDrop) => {
						setDragId((prevDrag) => {
							if (prevDrag) reorderSeries(prevDrag, prevDrop ?? 0);
							return null;
						});
						return null;
					});
				} else {
					setDragId(null);
					setDropIndex(null);
				}
			};
			window.addEventListener("mousemove", onMouseMove);
			window.addEventListener("mouseup", onMouseUp);
		},
		[reorderSeries],
	);
	const toggleSection = (key: keyof typeof openSections) =>
		setOpenSections((s) => ({ ...s, [key]: !s[key] }));
	const { importFile, confirmImport, cancelImport, changeSheet, pendingFile } =
		useDataImport();

	const selectedDatasetForCalc = useMemo(() => {
		return datasets.find((d) => d.id === calculatingDatasetId);
	}, [datasets, calculatingDatasetId]);

	const datasetsById = useMemo(() => {
		const obj: Record<string, (typeof datasets)[0]> = {};
		for (const d of datasets) {
			obj[d.id] = d;
		}
		return obj;
	}, [datasets]);

	const handleExportSVG = () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const svgContent = exportToSVG(
			datasets,
			series,
			xAxes,
			yAxes,
			axisTitles,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(svgContent, "webgraphy-export.svg", "image/svg+xml");
	};

	const handleExportPNG = async () => {
		const plotContainer = document.querySelector(".plot-area") as HTMLElement;
		if (!plotContainer) return;

		const pngData = await exportToPNG(
			datasets,
			series,
			xAxes,
			yAxes,
			axisTitles,
			plotContainer.clientWidth,
			plotContainer.clientHeight,
			t,
		);
		downloadFile(pngData, "webgraphy-export.png", "image/png");
	};

	const createSeries = (datasetId: string, columnName: string) => {
		const dataset = datasets.find((d) => d.id === datasetId);
		if (!dataset) return;

		const colIdx = dataset.columns.indexOf(columnName);
		const isCategorical =
			colIdx >= 0 && !!dataset.data[colIdx]?.categoryLabels;
		addSeries(
			buildSeriesConfig(columnName, datasetId, series.length, isCategorical),
		);
	};

	if (isCollapsed) {
		return (
			<CollapsedMenuButton
				onClick={() => setIsCollapsed(false)}
				onExportSVG={handleExportSVG}
				theme={t}
			/>
		);
	}

	const hdrSep = <span className="sb-hdr-sep" />;

	return (
		<>
			<aside className="sidebar">
				{/* Header */}
				<header className="sb-header">
					<img
						src="./favicon.svg"
						className="sb-logo"
						alt="webgraphy logo"
						style={{ cursor: "pointer" }}
						onClick={() => setIsCollapsed(true)}
					/>
					<HeaderButton onClick={handleImport} icon={<FilePlus size={24} />} title="Import Data Source" />
					<div className="sb-hdr-btns">
						<HeaderButton
							onClick={loadDemoData}
							icon={<FlaskConical size={24} />}
							title="Load Demo Data"
						/>
						{hdrSep}
						<HeaderButton onClick={handleExportSVG} icon={<FileImage size={24} />} title="Export SVG" />
						<HeaderButton onClick={handleExportPNG} icon={<Image size={24} />} title="Export PNG" />
						{hdrSep}
						<span className="sb-spacer" />
						<HeaderButton
							onClick={() => {
								const ax = xAxes[0];
								if (ax) updateXAxis(ax.id, { showGrid: !ax.showGrid });
							}}
							icon={<Columns3 size={24} />}
							title={xAxes[0]?.showGrid ? "Hide Vertical Grid" : "Show Vertical Grid"}
							off={!xAxes[0]?.showGrid}
						/>
						<HeaderButton
							onClick={() => setCrosshairVisible(!crosshairVisible)}
							icon={<Crosshair size={24} />}
							title={crosshairVisible ? "Hide Crosshair" : "Show Crosshair"}
							off={!crosshairVisible}
						/>
						<HeaderButton
							onClick={() => setLegendVisible(!legendVisible)}
							icon={<List size={24} />}
							title={legendVisible ? "Hide Legend" : "Show Legend"}
							off={!legendVisible}
						/>
						<HeaderButton
							onClick={cycleTheme}
							icon={THEME_ICONS[themeName] as React.ReactElement}
							title={THEME_LABELS[themeName]}
						/>
						{hdrSep}
						<HeaderButton
							onClick={() => setIsCollapsed(true)}
							icon={<PanelRightClose size={24} />}
							title="Collapse Sidebar"
						/>
					</div>
				</header>

				{/* Content */}
				<div className="sb-body">
					{/* Data Sources Section */}
					<ErrorBoundary level="component">
						<section style={{ marginBottom: "24px" }}>
							<div
								style={{
									display: "flex",
									alignItems: "center",
									justifyContent: "space-between",
								}}
							>
								<div
									onClick={() => toggleSection("sources")}
									style={{
										display: "flex",
										alignItems: "center",
										gap: "6px",
										cursor: "pointer",
										flex: 1,
									}}
								>
									<h2 className="sb-section-title">Data Sources</h2>
									{openSections.sources ? (
										<ChevronDown size={16} color={t.textMuted} />
									) : (
										<ChevronRight size={16} color={t.textMuted} />
									)}
								</div>
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

							{openSections.sources && (
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
												fontStyle: "italic"
											}}
										>
											Add datasources by importing or drag and drop on the graph surface
										</div>
									)}

									{datasets.map((ds) => (
										<div
											key={ds.id}
											style={{
												backgroundColor: t.bg,
												borderRadius: "0",
												border: `1px solid ${t.cardBorder}`,
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
													{ds.name.includes(": ")
														? ds.name.split(": ")[1]
														: ds.name}
												</span>
												<span style={{ fontSize: "0.7rem", color: t.textMuted, opacity: 0.8 }}>
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
														<button
															onClick={() => {
																const currentId = ds.xAxisId || "axis-1";
																const currentNum =
																	parseInt(currentId.split("-")[1], 10) || 1;
																const maxOthers = datasets
																	.filter((d) => d.id !== ds.id)
																	.reduce(
																		(m, d) =>
																			Math.max(
																				m,
																				parseInt(
																					(d.xAxisId || "axis-1").split("-")[1],
																					10,
																				) || 1,
																			),
																		1,
																	);
																const cap = Math.min(maxOthers + 1, 9);
																const nextNum =
																	currentNum >= cap ? 1 : currentNum + 1;
																updateDataset(ds.id, {
																	xAxisId: `axis-${nextNum}`,
																});
															}}
															title="Cycle X-Axis (1-9)"
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
														title="Add Calculated Column"
													>
														<Calculator size={16} />
													</button>
													<button
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

											<div style={{ padding: "6px 10px" }}>
												<div
													style={{
														display: "flex",
														flexWrap: "wrap",
														gap: "0",
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
														const label = col.includes(": ")
															? col.split(": ")[1]
															: col;
														const isRenaming =
															renamingColumn?.datasetId === ds.id &&
															renamingColumn?.col === col;
														return (
															<div
																key={col}
																className="col-chip"
																style={{
																	border: `1px solid ${t.accent}`,
																	backgroundColor: t.bg3,
																	opacity: isUsed ? 0.7 : 1,
																}}
															>
																{isRenaming ? (
																	<>
																		<input
																			autoFocus
																			value={renamingColumn.value}
																			onChange={(e) =>
																				setRenamingColumn((prev) =>
																					prev ? { ...prev, value: e.target.value } : prev,
																				)
																			}
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
																				padding: "3px 6px",
																				border: "none",
																				background: "none",
																				color: t.accent,
																				fontWeight: "600",
																				width: `${Math.max(40, renamingColumn.value.length * 7)}px`,
																				outline: "none",
																			}}
																		/>
																		<button
																			onClick={() => {
																				renameColumn(ds.id, col, renamingColumn.value);
																				setRenamingColumn(null);
																			}}
																			style={{
																				display: "flex",
																				alignItems: "center",
																				padding: "2px 4px",
																				border: "none",
																				background: "none",
																				color: t.accent,
																				cursor: "pointer",
																				borderLeft: `1px solid ${t.accent}`,
																			}}
																			title="Save"
																		>
																			<Check size={10} />
																		</button>
																		<button
																			onClick={() => setRenamingColumn(null)}
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
																			title="Cancel"
																		>
																			<X size={10} />
																		</button>
																	</>
																) : (
																	<>
																		<button
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
																			title={isCalc ? `Formula: ${colData.formula}` : col}
																		>
																			{isCalc ? `ƒ ${label}` : label}
																		</button>
																		<div className="col-chip-actions">
																			<button
																				onClick={() =>
																					setRenamingColumn({
																						datasetId: ds.id,
																						col,
																						value: col,
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
																								formula: colData.formula!,
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
										</div>
									))}
								</div>
							)}
						</section>
					</ErrorBoundary>

					{/* Series Configuration Section */}
					<section className="sb-section">
						<div className="sb-section-header">
							<div
								onClick={() => toggleSection("series")}
								className="sb-section-toggle"
							>
								<h2 className="sb-section-title">Data Series</h2>
								{openSections.series ? (
									<ChevronDown size={16} color="var(--text-muted-color)" />
								) : (
									<ChevronRight size={16} color="var(--text-muted-color)" />
								)}
							</div>
						</div>

						{openSections.series && (
							<div className="sb-series-list">
								{series.length === 0 ? (
									<p
										style={{
											margin: 0,
											fontSize: "0.85rem",
											color: "var(--text-light)",
											textAlign: "center",
											fontStyle: "italic",
										}}
									>
										Add columns from data sources
									</p>
								) : (
									<div
										ref={seriesListRef}
										style={{ display: "flex", flexDirection: "column" }}
										className={dragId ? "sb-series-list--dragging" : undefined}
									>
										<div className="sb-series-header">
											<div
												title="Drag to reorder or click to toggle visibility"
												className="sb-series-header-cell"
												style={{ width: "24px" }}
											>
												<ArrowUpDown size={12} />
											</div>
											<div title="Y-Axis #" className="sb-series-header-cell">
												<Hash size={12} />
											</div>
											<div title="Side (L/R)" className="sb-series-header-cell">
												<MoveHorizontal size={12} />
											</div>
											<div title="Grid" className="sb-series-header-cell">
												<Rows3 size={12} />
											</div>
											<div title="Line Style" className="sb-series-header-cell">
												<Minus size={12} />
											</div>
											<div
												title="Point Style"
												className="sb-series-header-cell"
											>
												<Circle size={10} />
											</div>
											<div title="Color" className="sb-series-header-cell">
												<Palette size={12} />
											</div>
											<div
												title="Data Column"
												className="sb-series-header-cell--text"
											>
												Column
											</div>
											<div />
										</div>
										{(() => {
											const dragSeries = dragId
												? series.find((s) => s.id === dragId)
												: null;
											// Build preview order: remove dragged item, insert ghost at dropIndex
											const withoutDrag = series.filter((s) => s.id !== dragId);
											const previewList: Array<{
												s: (typeof series)[0];
												isGhost: boolean;
											}> = withoutDrag.map((s) => ({ s, isGhost: false }));
											if (dragSeries && dropIndex !== null) {
												const clampedDrop = Math.min(
													dropIndex,
													withoutDrag.length,
												);
												previewList.splice(clampedDrop, 0, {
													s: dragSeries,
													isGhost: true,
												});
											}

											return previewList.map(({ s, isGhost }) => (
												<div
													key={isGhost ? `ghost-${s.id}` : s.id}
													{...(!isGhost ? { "data-series-id": s.id } : {})}
													onMouseEnter={() =>
														!isGhost && setHighlightedSeries(s.id)
													}
													onMouseLeave={() =>
														!isGhost && setHighlightedSeries(null)
													}
													className={`sb-series-row${!isGhost && dragId === s.id ? " sb-series-row--dragging" : ""}${isGhost ? " sb-series-row--ghost" : ""}`}
												>
													<SeriesConfigUI
														series={s}
														dataset={datasetsById[s.sourceId]}
														onHandleMouseDown={
															!isGhost
																? (e) => {
																	startDrag(s.id, e);
																}
																: undefined
														}
													/>
												</div>
											));
										})()}
									</div>
								)}
							</div>
						)}
					</section>
				</div>

				<footer className="sb-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px", padding: "8px 12px", whiteSpace: "nowrap" }}>
					<div style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.7rem", color: "var(--text-muted-color)" }}>
						<span style={{ opacity: 0.8 }}>v{packageJson.version}</span>
						<span style={{ opacity: 0.5 }}>|</span>
						<button onClick={() => setShowHelp(true)} className="sb-footer-btn" title="Help" style={{ fontSize: "0.7rem", padding: 0 }}>Help</button>
						<span style={{ opacity: 0.5 }}>|</span>
						<button onClick={() => setShowLicense(true)} className="sb-footer-btn" title="License" style={{ fontSize: "0.7rem", padding: 0 }}>License</button>
						<span style={{ opacity: 0.5 }}>|</span>
						<button onClick={() => setShowImprint(true)} className="sb-footer-btn" title="Imprint" style={{ fontSize: "0.7rem", padding: 0 }}>Imprint</button>
					</div>
					<div style={{ fontSize: "0.7rem", color: "var(--text-muted-color)", opacity: 0.8, textAlign: "right" }}>
						MIT License, Michael Krisper
					</div>
				</footer>
			</aside>

			{/* Modals */}
			{pendingFile && (
				<ImportSettingsDialog
					fileName={pendingFile.file.name}
					fileContent={pendingFile.preview}
					fileType={pendingFile.type}
					sheets={pendingFile.sheets}
					selectedSheet={pendingFile.selectedSheet}
					onSheetChange={changeSheet}
					onConfirm={confirmImport}
					onCancel={cancelImport}
				/>
			)}
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
			{showImprint && <ImprintModal onClose={() => setShowImprint(false)} />}
			{showHelp && <HelpModal onClose={() => setShowHelp(false)} />}
			{showLicense && <LicenseModal onClose={() => setShowLicense(false)} />}
		</>
	);
};
