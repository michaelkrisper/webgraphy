import {
	Circle,
	EyeOff,
	GripVertical,
	Plus,
	Rows3,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { deleteWithUndo } from "../../store/undoToast";
import { useGraphStore, withHistory } from "../../store/useGraphStore";
import {
	firstFreeYAxisSlot,
	ownsYAxisRow,
	usedYAxes,
	yAxisSlot,
} from "../../utils/yAxisSlots";
import ColorPicker from "./ColorPicker";
import { PopupPicker, type PopupPickerOption } from "./PopupPicker";

interface Props {
	series: SeriesConfig;
	datasets: Dataset[];
	onHandleMouseDown?: (e: React.MouseEvent) => void;
}

type LineStyle = "solid" | "dashed" | "dotted" | "none";
type PointStyle = "circle" | "square" | "cross" | "none";

const LINE_STYLE_LABELS: Record<LineStyle, string> = {
	solid: "Solid",
	dashed: "Dashed",
	dotted: "Dotted",
	none: "No Line",
};

const POINT_STYLE_LABELS: Record<PointStyle, string> = {
	circle: "Circle",
	square: "Square",
	cross: "Cross",
	none: "No Points",
};

function lineIcon(style: LineStyle) {
	const color = "currentColor";
	const common = { x1: 1, y1: 8, x2: 15, y2: 8, stroke: color };
	return (
		<svg width="18" height="18" viewBox="0 0 16 16" className="sc-line-icon">
			<title>Line {style}</title>
			{style === "solid" && <line {...common} strokeWidth="2.5" />}
			{style === "dashed" && (
				<line {...common} strokeWidth="2.5" strokeDasharray="4,3" />
			)}
			{style === "dotted" && (
				<line
					{...common}
					strokeWidth="2.5"
					strokeDasharray="1,3"
					strokeLinecap="round"
				/>
			)}
			{style === "none" && (
				<>
					<line {...common} strokeWidth="2.5" opacity="0.35" />
					<line x1="2" y1="2" x2="14" y2="14" stroke="#dc3545" strokeWidth="1.5" />
				</>
			)}
		</svg>
	);
}

function PointCircleIcon({ size }: { size: number }) {
	return (
		<Circle size={size} fill="currentColor" stroke="white" strokeWidth={1} />
	);
}

function PointSquareIcon({ size }: { size: number }) {
	return (
		<svg width={size} height={size} viewBox="0 0 24 24">
			<title>Square</title>
			<rect
				x="3"
				y="3"
				width="18"
				height="18"
				rx="2"
				ry="2"
				fill="currentColor"
				stroke="white"
				strokeWidth="2"
				paintOrder="stroke fill"
			/>
		</svg>
	);
}

function PointCrossIcon({ size }: { size: number }) {
	return <X size={size + 2} strokeWidth={3} />;
}

function PointNoneIcon({ size }: { size: number }) {
	return (
		<svg width={size + 4} height={size + 4} viewBox="0 0 16 16">
			<title>No Points</title>
			<circle cx="8" cy="8" r="5" fill="currentColor" opacity="0.35" />
			<line x1="2" y1="2" x2="14" y2="14" stroke="#dc3545" strokeWidth="1.5" />
		</svg>
	);
}

function pointIcon(style: PointStyle) {
	const size = 12;
	switch (style) {
		case "circle":
			return <PointCircleIcon size={size} />;
		case "square":
			return <PointSquareIcon size={size} />;
		case "cross":
			return <PointCrossIcon size={size} />;
		case "none":
			return <PointNoneIcon size={size} />;
	}
}

const LINE_OPTIONS: PopupPickerOption<LineStyle>[] = (
	["solid", "dashed", "dotted", "none"] as const
).map((v) => ({ value: v, icon: lineIcon(v), label: LINE_STYLE_LABELS[v] }));

const POINT_OPTIONS: PopupPickerOption<PointStyle>[] = (
	["circle", "square", "cross", "none"] as const
).map((v) => ({ value: v, icon: pointIcon(v), label: POINT_STYLE_LABELS[v] }));

/** The axes in use, titled like the chart draws them, plus "New axis". */
function yAxisOptions(
	allSeries: readonly SeriesConfig[],
): PopupPickerOption<number>[] {
	const options: PopupPickerOption<number>[] = usedYAxes(allSeries).map((a) => ({
		value: a.slot,
		icon: <span style={{ fontWeight: "bold" }}>{a.slot}</span>,
		label: a.title,
		title: `Y-Axis ${a.slot}: ${a.title}`,
		trailing: (
			<span className="sc-axis-swatches" aria-hidden="true">
				{a.colors.map((c) => (
					<span key={c} className="sc-axis-swatch" style={{ background: c }} />
				))}
			</span>
		),
	}));
	const free = firstFreeYAxisSlot(allSeries);
	options.push({
		value: free ?? 0,
		icon: <Plus size={14} />,
		label: "New axis",
		disabled: free === null,
		title: free === null ? "All 9 Y-axes are in use" : `Move to Y-Axis ${free}`,
	});
	return options;
}

export const SeriesConfigUI: React.FC<Props> = ({
	series,
	datasets,
	onHandleMouseDown,
}) => {
	const updateSeries = useGraphStore((s) => s.updateSeries);
	const removeSeries = useGraphStore((s) => s.removeSeries);
	const yAxes = useGraphStore((s) => s.yAxes);
	const updateYAxis = useGraphStore((s) => s.updateYAxis);
	const updateSeriesVisibility = useGraphStore((s) => s.updateSeriesVisibility);
	const allSeries = useGraphStore((s) => s.series);
	const setPreviewColor = useGraphStore((s) => s.setPreviewColor);
	const setPreviewStyle = useGraphStore((s) => s.setPreviewStyle);

	const multiDs = datasets.length > 1;
	const handleUpdate = (updates: Partial<SeriesConfig>) => {
		updateSeries(series.id, updates);
	};

	const toggleVisibility = () => {
		updateSeriesVisibility(series.id, !series.hidden);
	};

	const currentYAxisIndex = yAxisSlot(series.yAxisId);
	const currentYAxis = ownsYAxisRow(allSeries, series)
		? yAxes.find((a) => a.id === series.yAxisId)
		: undefined;
	const yAxisCycleDisabled = allSeries.length <= 1;

	const selectYAxis = (n: number) => {
		const nextAxisId = `axis-${n}`;
		withHistory(`move '${series.name || series.yColumn}' to Y-axis ${n}`, () => {
			if (!allSeries.some((s) => s.yAxisId === nextAxisId)) {
				updateYAxis(nextAxisId, { position: "left" });
			}
			handleUpdate({ yAxisId: nextAxisId });
		});
	};

	return (
		<div className={`sc-row${series.hidden ? " sc-row--hidden" : ""}`}>
			{/* Combined Drag Handle & Visibility Toggle */}
			<button
				type="button"
				className="sc-drag-handle"
				onMouseDown={onHandleMouseDown}
				onClick={toggleVisibility}
				title={
					series.hidden
						? "Show Series (Drag to reorder)"
						: "Hide Series (Drag to reorder)"
				}
				aria-label={series.hidden ? "Show Series" : "Hide Series"}
			>
				{series.hidden ? <EyeOff size={14} /> : <GripVertical size={14} />}
			</button>

			{/* Y Axis Picker (axes in use + new axis) */}
			<PopupPicker
				options={yAxisOptions(allSeries)}
				current={currentYAxisIndex}
				onChange={selectYAxis}
				popoverId={`y-axis-popover-${series.id}`}
				minWidth={180}
				renderTrigger={({ onClick, ref }) => (
					<button
						ref={ref}
						onClick={yAxisCycleDisabled ? undefined : onClick}
						className="sc-btn"
						disabled={yAxisCycleDisabled}
						style={{
							fontWeight: "bold",
							opacity: yAxisCycleDisabled ? 0.3 : 1,
							cursor: yAxisCycleDisabled ? "default" : "pointer",
						}}
						title="Select Y-Axis"
						type="button"
						aria-label="Select Y-Axis"
					>
						{currentYAxisIndex}
					</button>
				)}
			/>

			{/* L/R Side Toggle (unchanged) */}
			{currentYAxis ? (
				<button
					onClick={() =>
						updateYAxis(currentYAxis.id, {
							position: currentYAxis.position === "left" ? "right" : "left",
						})
					}
					className="sc-btn"
					title={currentYAxis.position === "left" ? "Left Axis" : "Right Axis"}
					type="button"
					aria-label="Toggle Left/Right Axis"
				>
					{currentYAxis.position === "left" ? (
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<title>Left Axis Position</title>
							<path d="M3 13V2m-2 3l2-3 2 3M3 13h11m-3-2l3 2-3 2" />
						</svg>
					) : (
						<svg
							width="16"
							height="16"
							viewBox="0 0 16 16"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
						>
							<title>Right Axis Position</title>
							<path d="M13 13V2m-2 3l2-3 2 3M13 13H2m3-2l-3 2 3 2" />
						</svg>
					)}
				</button>
			) : (
				<div className="sc-cell-placeholder" />
			)}

			{/* Grid Toggle (binary, unchanged) */}
			{currentYAxis ? (
				<button
					onClick={() =>
						updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })
					}
					className={`sc-btn sc-btn--plain${!currentYAxis.showGrid ? " sc-btn--off" : ""}`}
					title="Toggle Grid"
					type="button"
					aria-label="Toggle Grid"
				>
					<Rows3 size={16} />
				</button>
			) : (
				<div className="sc-cell-placeholder" />
			)}

			{/* Line Style Picker */}
			<PopupPicker
				options={LINE_OPTIONS}
				current={series.lineStyle as LineStyle}
				onChange={(v) => handleUpdate({ lineStyle: v })}
				onHoverOption={(v) =>
					setPreviewStyle(v ? { seriesId: series.id, lineStyle: v } : null)
				}
				popoverId={`line-style-popover-${series.id}`}
				renderTrigger={({ onClick, ref }) => (
					<button
						ref={ref}
						onClick={onClick}
						className="sc-btn"
						title={`Line Style: ${series.lineStyle}`}
						type="button"
						aria-label="Select Line Style"
					>
						{lineIcon(series.lineStyle as LineStyle)}
					</button>
				)}
			/>

			{/* Point Style Picker */}
			<PopupPicker
				options={POINT_OPTIONS}
				current={series.pointStyle as PointStyle}
				onChange={(v) => handleUpdate({ pointStyle: v })}
				onHoverOption={(v) =>
					setPreviewStyle(v ? { seriesId: series.id, pointStyle: v } : null)
				}
				popoverId={`point-style-popover-${series.id}`}
				renderTrigger={({ onClick, ref }) => (
					<button
						ref={ref}
						onClick={onClick}
						className="sc-btn"
						title="Point Style"
						type="button"
						aria-label="Select Point Style"
					>
						{pointIcon(series.pointStyle as PointStyle)}
					</button>
				)}
			/>

			{/* Color Picker */}
			<ColorPicker
				color={series.lineColor}
				onChange={(newColor) =>
					handleUpdate({ lineColor: newColor, pointColor: newColor })
				}
				onHover={(previewColor) =>
					setPreviewColor({ seriesId: series.id, color: previewColor })
				}
				onHoverEnd={() => setPreviewColor(null)}
				ariaLabel={`Color for ${series.name || series.yColumn}`}
			/>

			{/* Y Column Selector */}
			<select
				name={`series-y-column-${series.id}`}
				aria-label={`Y Column for ${series.name || series.yColumn}`}
				value={`${series.sourceId}::${series.yColumn}`}
				onChange={(e) => {
					const [dsId, col] = e.target.value.split("::");
					handleUpdate({ sourceId: dsId, yColumn: col });
				}}
				className="sc-select"
				title="Y Column"
			>
				{datasets.map((ds) => {
					return ds.columns.map((c) => {
						const label = multiDs ? `${ds.name}: ${c}` : c;
						return (
							<option key={`${ds.id}::${c}`} value={`${ds.id}::${c}`}>
								{label}
							</option>
						);
					});
				})}
			</select>

			{/* Delete Button */}
			<button
				onClick={() =>
					deleteWithUndo(series.name || series.yColumn, () =>
						removeSeries(series.id),
					)
				}
				className="sc-btn sc-btn--plain"
				style={{ borderRight: "none", color: "var(--danger)" }}
				title="Delete"
				type="button"
				aria-label="Delete Series"
			>
				<Trash2 size={16} />
			</button>
		</div>
	);
};
