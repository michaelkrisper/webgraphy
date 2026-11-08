import {
	CornerLeftUp,
	Eye,
	EyeOff,
	GripVertical,
	Plus,
	Rows3,
	Trash2,
} from "lucide-react";
import type React from "react";
import { useCallback } from "react";
import type {
	Dataset,
	SeriesConfig,
	YAxisConfig,
} from "../../services/persistence";
import { deleteWithUndo } from "../../store/undoToast";
import { useGraphStore, withHistory } from "../../store/useGraphStore";
import { lineWidthOf, lineWidthUpdate } from "../../utils/lineWidth";
import {
	firstFreeYAxisSlot,
	ownsYAxisRow,
	usedYAxes,
	yAxisSlot,
} from "../../utils/yAxisSlots";
import ColorPicker from "./ColorPicker";
import { PopupPicker, type PopupPickerOption } from "./PopupPicker";
import { SeriesStylePicker, type StylePreview } from "./SeriesStylePicker";
import { UNDO_HINT } from "./undoHint";

interface Props {
	series: SeriesConfig;
	datasets: Dataset[];
	onHandleMouseDown?: (e: React.MouseEvent) => void;
}

/** The axes in use, titled like the chart draws them, plus "New axis". */
function yAxisOptions(
	allSeries: readonly SeriesConfig[],
	yAxes: readonly Pick<YAxisConfig, "id" | "title">[],
): PopupPickerOption<number>[] {
	const options: PopupPickerOption<number>[] = usedYAxes(allSeries, yAxes).map(
		(a) => ({
			value: a.slot,
			icon: <span style={{ fontWeight: "bold" }}>Y{a.slot}</span>,
			label: a.title,
			title: `Y axis ${a.slot}: ${a.title}`,
			description: `Moves the series onto Y axis ${a.slot}, sharing its range`,
			trailing: (
				<span className="sc-axis-swatches" aria-hidden="true">
					{a.colors.map((c) => (
						<span key={c} className="sc-axis-swatch" style={{ background: c }} />
					))}
				</span>
			),
		}),
	);
	const free = firstFreeYAxisSlot(allSeries);
	options.push({
		value: free ?? 0,
		icon: <Plus size={14} />,
		label: "New axis",
		disabled: free === null,
		title: free === null ? "All 9 Y axes are in use" : `Move to Y axis ${free}`,
		description:
			free === null
				? "All 9 Y axes are in use"
				: `Moves the series onto its own Y axis ${free}`,
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
	const setAxisScale = useGraphStore((s) => s.setAxisScale);
	const updateSeriesVisibility = useGraphStore((s) => s.updateSeriesVisibility);
	const allSeries = useGraphStore((s) => s.series);
	const setPreviewColor = useGraphStore((s) => s.setPreviewColor);
	const setPreviewStyle = useGraphStore((s) => s.setPreviewStyle);

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
	const seriesName = series.name || series.yColumn;
	const previewStyle = useCallback(
		(preview: StylePreview | null) =>
			setPreviewStyle(preview && { seriesId: series.id, ...preview }),
		[setPreviewStyle, series.id],
	);

	const selectYAxis = (n: number) => {
		const nextAxisId = `axis-${n}`;
		withHistory(`move '${series.name || series.yColumn}' to Y axis ${n}`, () => {
			if (!allSeries.some((s) => s.yAxisId === nextAxisId)) {
				// This series' own axis frees up if it is the only one on it.
				const leftInUse = allSeries.some(
					(s) =>
						s.id !== series.id &&
						yAxes.find((a) => a.id === s.yAxisId)?.position === "left",
				);
				updateYAxis(nextAxisId, { position: leftInUse ? "right" : "left" });
			}
			handleUpdate({ yAxisId: nextAxisId });
		});
	};

	const selectColumn = (dsId: string, col: string) => {
		// A name that just mirrors the column follows it; a custom one stays.
		const autoName = !series.name || series.name === series.yColumn;
		handleUpdate({
			sourceId: dsId,
			yColumn: col,
			...(autoName ? { name: col } : {}),
		});
	};

	const sharedAxisHint = (
		<div
			className="sc-shared-axis"
			title={`Side, grid and scale of Y${currentYAxisIndex} are set on its first row`}
		>
			<CornerLeftUp size={12} aria-hidden="true" />
		</div>
	);

	return (
		<div className={`sc-row${series.hidden ? " sc-row--hidden" : ""}`}>
			{/* Drag only, no click action: a press that never became a drag
			    must not change anything. */}
			<div
				className="sc-drag-handle"
				onMouseDown={onHandleMouseDown}
				title="Drag to reorder"
				aria-hidden="true"
			>
				<GripVertical size={14} />
			</div>

			{/* Y Axis Picker (axes in use + new axis) */}
			<PopupPicker
				options={yAxisOptions(allSeries, yAxes)}
				current={currentYAxisIndex}
				onChange={selectYAxis}
				popoverId={`y-axis-popover-${series.id}`}
				label="Y axis"
				minWidth={180}
				renderTrigger={({ onClick, ref, popupProps }) => (
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
						title="Select Y axis"
						type="button"
						aria-label="Select Y axis"
						aria-description={
							yAxisCycleDisabled
								? `${seriesName} is on Y axis ${currentYAxisIndex}; with one series there is no other axis to move to`
								: `${seriesName} is on Y axis ${currentYAxisIndex}. Opens the axes in use and New axis`
						}
						{...popupProps}
					>
						Y{currentYAxisIndex}
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
					aria-description={`Y${currentYAxisIndex} is drawn on the ${currentYAxis.position}; moves it to the other side of the chart`}
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
				sharedAxisHint
			)}

			{/* Grid Toggle (binary, unchanged) */}
			{currentYAxis && (
				<button
					onClick={() =>
						updateYAxis(currentYAxis.id, { showGrid: !currentYAxis.showGrid })
					}
					className={`sc-btn sc-btn--plain${!currentYAxis.showGrid ? " sc-btn--off" : ""}`}
					title="Toggle Grid"
					type="button"
					aria-label="Toggle Grid"
					aria-pressed={currentYAxis.showGrid}
					aria-description={`Horizontal grid lines at the Y${currentYAxisIndex} ticks`}
				>
					<Rows3 size={16} />
				</button>
			)}

			{/* Linear/Log Scale Toggle */}
			{currentYAxis && (
				<button
					onClick={() =>
						setAxisScale(
							"y",
							currentYAxis.id,
							currentYAxis.scale === "log" ? "linear" : "log",
						)
					}
					className={`sc-btn sc-btn--plain sc-btn--log${currentYAxis.scale !== "log" ? " sc-btn--off" : ""}`}
					title={
						currentYAxis.scale === "log"
							? "Logarithmic Y Scale (click for linear)"
							: "Linear Y Scale (click for logarithmic)"
					}
					type="button"
					aria-label="Logarithmic Y Scale"
					aria-pressed={currentYAxis.scale === "log"}
					aria-description={`Switches Y${currentYAxisIndex} between a linear and a logarithmic scale`}
				>
					log
				</button>
			)}

			<SeriesStylePicker
				seriesId={series.id}
				seriesName={seriesName}
				color={series.lineColor}
				lineStyle={series.lineStyle}
				pointStyle={series.pointStyle}
				lineWidth={lineWidthOf(series)}
				onChange={({ lineWidth, ...styles }) =>
					handleUpdate(lineWidth === undefined ? styles : lineWidthUpdate(lineWidth))
				}
				onPreview={previewStyle}
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
				ariaLabel={`Color for ${seriesName}`}
			/>

			{/* Visibility and Y column share the flexible cell. */}
			<div className="sc-column-cell">
				<button
					type="button"
					className="sc-btn sc-btn--plain sc-eye"
					onClick={toggleVisibility}
					title={series.hidden ? "Show Series" : "Hide Series"}
					aria-label={series.hidden ? "Show Series" : "Hide Series"}
					aria-description={
						series.hidden
							? `Draws ${seriesName} on the chart again`
							: `Takes ${seriesName} off the chart and the legend; its settings are kept`
					}
				>
					{series.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
				</button>
				<select
					name={`series-y-column-${series.id}`}
					aria-label={`Y Column for ${seriesName}`}
					aria-description="Data column this series plots; another choice replots it"
					value={`${series.sourceId}::${series.yColumn}`}
					onChange={(e) => {
						const [dsId, col] = e.target.value.split("::");
						selectColumn(dsId, col);
					}}
					className="sc-select"
					title="Y Column"
				>
					{datasets.map((ds) => (
						<optgroup key={ds.id} label={ds.name}>
							{ds.columns
								.filter(
									(c) =>
										c !== ds.xAxisColumn ||
										(ds.id === series.sourceId && c === series.yColumn),
								)
								.map((c) => (
									<option key={c} value={`${ds.id}::${c}`}>
										{c}
									</option>
								))}
						</optgroup>
					))}
				</select>
			</div>

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
				aria-description={`Removes ${seriesName} from the chart. ${UNDO_HINT}`}
			>
				<Trash2 size={16} />
			</button>
		</div>
	);
};
