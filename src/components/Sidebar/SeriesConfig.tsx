import {
	Circle,
	EyeOff,
	GripVertical,
	Rows3,
	Trash2,
	X,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import ColorPicker from "./ColorPicker";

interface Props {
	series: SeriesConfig;
	dataset: Dataset | undefined;
	onHandleMouseDown?: (e: React.MouseEvent) => void;
}

export const SeriesConfigUI: React.FC<Props> = ({
	series,
	dataset,
	onHandleMouseDown,
}) => {
	const {
		updateSeries,
		removeSeries,
		yAxes,
		updateYAxis,
		updateSeriesVisibility,
		series: allSeries,
		setPreviewColor,
	} = useGraphStore();
	const [isEditingTitle, setIsEditingTitle] = useState(false);

	const handleUpdate = (updates: Partial<SeriesConfig>) => {
		updateSeries(series.id, updates);
	};

	const toggleVisibility = () => {
		updateSeriesVisibility(series.id, !series.hidden);
	};

	const currentYAxisIndex = parseInt(series.yAxisId.split("-")[1], 10) || 1;
	const currentYAxis = yAxes.find((a) => a.id === series.yAxisId);
	const yAxisCycleDisabled = allSeries.length <= 1;

	const cycleYAxis = () => {
		const maxOthers = allSeries
			.filter((s) => s.id !== series.id)
			.reduce(
				(m, s) => Math.max(m, parseInt(s.yAxisId.split("-")[1], 10) || 1),
				1,
			);
		const cap = Math.min(maxOthers + 1, 9);
		const nextIndex = currentYAxisIndex >= cap ? 1 : currentYAxisIndex + 1;
		const nextAxisId = `axis-${nextIndex}`;
		const isUnused = !allSeries.some(
			(s) => s.id !== series.id && s.yAxisId === nextAxisId,
		);
		if (isUnused) updateYAxis(nextAxisId, { position: "left" });
		handleUpdate({ yAxisId: nextAxisId });
	};

	const renderPointStyleIcon = () => {
		const size = 12;
		switch (series.pointStyle) {
			case "circle":
				return <Circle size={size} fill="currentColor" stroke="white" strokeWidth={1} />;
			case "square":
				return (
					<svg width={size} height={size} viewBox="0 0 24 24">
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
					<svg width={size} height={size} viewBox="0 0 16 16">
						<circle cx="8" cy="8" r="6" fill="currentColor" stroke="white" strokeWidth="1" />
					</svg>
				);
			default:
				return null;
			}
			};

			const renderLineStyleIcon = () => {
			const color = "currentColor";
			return (
			<svg width="18" height="18" viewBox="0 0 16 16" className="sc-line-icon">
				{series.lineStyle === "solid" && (
					<line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" />
				)}
				{series.lineStyle === "dashed" && (
					<line
						x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="4,3"
					/>
				)}
				{series.lineStyle === "dotted" && (
					<line
						x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" strokeDasharray="1,3"
						strokeLinecap="round"
					/>
				)}
				{series.lineStyle === "none" && (
					<line x1="1" y1="8" x2="15" y2="8" stroke={color} strokeWidth="2.5" />
				)}
			</svg>
			);
			};

	return (
		<div className={`sc-row${series.hidden ? " sc-row--hidden" : ""}`}>
			{/* Combined Drag Handle & Visibility Toggle */}
			<div
				className="sc-drag-handle"
				onMouseDown={onHandleMouseDown}
				onClick={toggleVisibility}
				title={series.hidden ? "Show Series (Drag to reorder)" : "Hide Series (Drag to reorder)"}
				aria-label={series.hidden ? "Show Series" : "Hide Series"}
			>
				{series.hidden ? <EyeOff size={14} /> : <GripVertical size={14} />}
			</div>

			{/* Y Axis Cycle Button (1-9) */}
			<button
				onClick={cycleYAxis}
				className="sc-btn"
				disabled={yAxisCycleDisabled}
				style={{
					fontWeight: "bold",
					opacity: yAxisCycleDisabled ? 0.3 : 1,
					cursor: yAxisCycleDisabled ? "default" : "pointer",
				}}
				title="Cycle Y-Axis (1-9)"
				aria-label="Cycle Y-Axis"
			>
				{currentYAxisIndex}
			</button>

			{/* L/R Side Toggle */}
			{currentYAxis ? (
				<button
					onClick={() =>
						updateYAxis(currentYAxis.id, {
							position: currentYAxis.position === "left" ? "right" : "left",
						})
					}
					className="sc-btn"
					title={currentYAxis.position === "left" ? "Left Axis" : "Right Axis"}
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
							<path d="M13 13V2m-2 3l2-3 2 3M13 13H2m3-2l-3 2 3 2" />
						</svg>
					)}
				</button>
			) : (
				<div className="sc-cell-placeholder" />
			)}

			{/* Grid Toggle */}
			{currentYAxis ? (
				<button
					onClick={() =>
						updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })
					}
					className={`sc-btn sc-btn--plain${!currentYAxis.showGrid ? " sc-btn--off" : ""}`}
					title="Toggle Grid"
					aria-label="Toggle Grid"
				>
					<Rows3 size={16} />
				</button>
			) : (
				<div className="sc-cell-placeholder" />
			)}

			{/* Line Style Cycle */}
			<button
				onClick={() => {
					const styles = ["solid", "dashed", "dotted", "none"] as const;
					const next =
						styles[(styles.indexOf(series.lineStyle) + 1) % styles.length];
					handleUpdate({ lineStyle: next });
				}}
				className={`sc-btn${series.lineStyle === "none" ? " sc-btn--off" : ""}`}
				title={`Line Style: ${series.lineStyle}`}
				aria-label="Cycle Line Style"
			>
				{renderLineStyleIcon()}
			</button>

			{/* Point Style Cycle */}
			<button
				onClick={() => {
					const styles = ["circle", "square", "cross", "none"] as const;
					const next =
						styles[(styles.indexOf(series.pointStyle) + 1) % styles.length];
					handleUpdate({ pointStyle: next });
				}}
				className={`sc-btn${series.pointStyle === "none" ? " sc-btn--off" : ""}`}
				title="Point Style"
				aria-label="Cycle Point Style"
			>
				{renderPointStyleIcon()}
			</button>

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
				value={series.yColumn}
				onChange={(e) => handleUpdate({ yColumn: e.target.value })}
				className="sc-select"
				title="Y Column"
			>
				{dataset?.columns.map((c) => (
					<option key={c} value={c}>
						{c}
					</option>
				))}
			</select>

			{/* Editable Title */}
			<div className="sc-title-cell">
				{isEditingTitle ? (
					<input
						name={`series-title-${series.id}`}
						aria-label="Rename series"
						autoComplete="off"
						maxLength={100}
						defaultValue={series.name || series.yColumn}
						onBlur={(e) => {
							handleUpdate({ name: e.target.value });
							setIsEditingTitle(false);
						}}
						onKeyDown={(e) => {
							if (e.key === "Enter") {
								handleUpdate({ name: e.currentTarget.value });
								setIsEditingTitle(false);
							}
							if (e.key === "Escape") {
								setIsEditingTitle(false);
							}
						}}
						className="sc-title-input"
					/>
				) : (
					<span
						onClick={() => setIsEditingTitle(true)}
						className="sc-title-span"
						style={{ color: series.lineColor }}
						title="Click to rename"
					>
						{series.name || series.yColumn}
					</span>
				)}
			</div>

			{/* Delete Button */}
			<button
				onClick={() => removeSeries(series.id)}
				className="sc-btn sc-btn--plain"
				style={{ borderRight: "none", color: "var(--danger)" }}
				title="Delete"
				aria-label="Delete Series"
			>
				<Trash2 size={16} />
			</button>
		</div>
	);
};
