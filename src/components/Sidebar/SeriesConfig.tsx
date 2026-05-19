import { Circle, EyeOff, GripVertical, Rows3, Trash2, X } from "lucide-react";
import type React from "react";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
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
					<line
						x1="2"
						y1="2"
						x2="14"
						y2="14"
						stroke="#dc3545"
						strokeWidth="1.5"
					/>
				</>
			)}
		</svg>
	);
}

function pointIcon(style: PointStyle) {
	const size = 12;
	switch (style) {
		case "circle":
			return (
				<Circle size={size} fill="currentColor" stroke="white" strokeWidth={1} />
			);
		case "square":
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
		case "cross":
			return <X size={size + 2} strokeWidth={3} />;
		case "none":
			return (
				<svg width={size + 4} height={size + 4} viewBox="0 0 16 16">
					<title>No Points</title>
					<circle cx="8" cy="8" r="5" fill="currentColor" opacity="0.35" />
					<line
						x1="2"
						y1="2"
						x2="14"
						y2="14"
						stroke="#dc3545"
						strokeWidth="1.5"
					/>
				</svg>
			);
	}
}

const LINE_OPTIONS: PopupPickerOption<LineStyle>[] = (
	["solid", "dashed", "dotted", "none"] as const
).map((v) => ({ value: v, icon: lineIcon(v), label: LINE_STYLE_LABELS[v] }));

const POINT_OPTIONS: PopupPickerOption<PointStyle>[] = (
	["circle", "square", "cross", "none"] as const
).map((v) => ({ value: v, icon: pointIcon(v), label: POINT_STYLE_LABELS[v] }));

const Y_AXIS_OPTIONS: PopupPickerOption<number>[] = Array.from(
	{ length: 9 },
	(_, i) => {
		const n = i + 1;
		return {
			value: n,
			icon: <span style={{ fontWeight: "bold" }}>{n}</span>,
			label: `Y-Axis ${n}`,
		};
	},
);

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

	const multiDs = datasets.length > 1;
	const handleUpdate = (updates: Partial<SeriesConfig>) => {
		updateSeries(series.id, updates);
	};

	const toggleVisibility = () => {
		updateSeriesVisibility(series.id, !series.hidden);
	};

	const currentYAxisIndex = parseInt(series.yAxisId.split("-")[1], 10) || 1;
	const currentYAxis = yAxes.find((a) => a.id === series.yAxisId);
	const yAxisCycleDisabled = allSeries.length <= 1;

	const selectYAxis = (n: number) => {
		const nextAxisId = `axis-${n}`;
		if (!allSeries.some((s) => s.yAxisId === nextAxisId)) {
			updateYAxis(nextAxisId, { position: "left" });
		}
		handleUpdate({ yAxisId: nextAxisId });
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

			{/* Y Axis Picker (1-9) */}
			<PopupPicker
				options={Y_AXIS_OPTIONS}
				current={currentYAxisIndex}
				onChange={selectYAxis}
				popoverId={`y-axis-popover-${series.id}`}
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
						title="Select Y-Axis (1-9)"
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
				{datasets.map((ds, dsIdx) => {
					const letter = String.fromCharCode(65 + dsIdx);
					return ds.columns.map((c) => {
						const label = multiDs
							? `${letter}: ${c.includes(": ") ? c.split(": ")[1] : c}`
							: c.includes(": ")
								? c.split(": ")[1]
								: c;
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
				onClick={() => removeSeries(series.id)}
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
