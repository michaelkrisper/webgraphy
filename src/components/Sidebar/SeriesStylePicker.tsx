import { useEffect, useRef, useState } from "react";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import type { SeriesConfig } from "../../services/persistence";
import { DEFAULT_LINE_WIDTH, dashScale } from "../../utils/lineWidth";
import { AnchoredPopover } from "./AnchoredPopover";
import ColorPicker from "./ColorPicker";

type LineStyle = SeriesConfig["lineStyle"];
type PointStyle = SeriesConfig["pointStyle"];

const LINE_STYLES: readonly LineStyle[] = ["solid", "dashed", "dotted", "none"];
const POINT_STYLES: readonly PointStyle[] = [
	"circle",
	"square",
	"cross",
	"none",
];
const LINE_WIDTHS = [1, 1.5, 2, 3, 4];
const POPOVER_WIDTH = 220;

const LINE_LABELS: Record<LineStyle, string> = {
	solid: "Solid line",
	dashed: "Dashed line",
	dotted: "Dotted line",
	none: "No line",
};

const POINT_LABELS: Record<PointStyle, string> = {
	circle: "circles",
	square: "squares",
	cross: "crosses",
	none: "no points",
};

const styleName = (line: LineStyle, point: PointStyle) =>
	`${LINE_LABELS[line]}, ${POINT_LABELS[point]}`;

function Marker({ style, x }: { style: PointStyle; x: number }) {
	switch (style) {
		case "circle":
			return <circle cx={x} cy={8} r={3} fill="currentColor" />;
		case "square":
			return (
				<rect x={x - 2.75} y={5.25} width={5.5} height={5.5} fill="currentColor" />
			);
		case "cross":
			return (
				<path
					d={`M${x - 3} 5l6 6m0-6l-6 6`}
					stroke="currentColor"
					strokeWidth={1.5}
				/>
			);
		case "none":
			return null;
	}
}

/** A short run of the series as the chart draws it: its line and markers. */
function StyleSwatch({
	line,
	point,
	width,
	wide = false,
}: {
	line: LineStyle;
	point: PointStyle;
	width: number;
	wide?: boolean;
}) {
	const w = wide ? 32 : 20;
	const unit = dashScale(width);
	const dash =
		line === "dashed"
			? `${4 * unit},${3 * unit}`
			: line === "dotted"
				? `0,${2.5 * unit}`
				: undefined;
	const markers = wide ? [10, 22] : [10];
	return (
		<svg
			width={w}
			height={16}
			viewBox={`0 0 ${w} 16`}
			className="ssp-swatch"
			aria-hidden="true"
		>
			{line !== "none" && (
				<line
					x1={1}
					y1={8}
					x2={w - 1}
					y2={8}
					stroke="currentColor"
					strokeWidth={width}
					strokeDasharray={dash}
					strokeLinecap={line === "dotted" ? "round" : "butt"}
				/>
			)}
			{line === "none" && point === "none" && (
				<line
					x1={w / 2 - 5}
					y1={3}
					x2={w / 2 + 5}
					y2={13}
					stroke="var(--danger)"
					strokeWidth={1.5}
				/>
			)}
			{markers.map((x) => (
				<Marker key={x} style={point} x={x} />
			))}
		</svg>
	);
}

export interface StylePreview {
	lineStyle?: LineStyle;
	pointStyle?: PointStyle;
	lineWidth?: number;
	color?: string;
}

interface Props {
	seriesId: string;
	seriesName: string;
	color: string;
	lineStyle: LineStyle;
	pointStyle: PointStyle;
	lineWidth: number;
	onChange: (updates: StylePreview) => void;
	/** Fired on hover (the hovered choice) and when the hover ends (null). */
	onPreview: (preview: StylePreview | null) => void;
}

/**
 * One trigger for a series' colour, line style, point style and line width.
 * Hovering a choice previews it on the chart; clicking applies it and closes.
 */
export function SeriesStylePicker({
	seriesId,
	seriesName,
	color,
	lineStyle,
	pointStyle,
	lineWidth,
	onChange,
	onPreview,
}: Props) {
	const popoverId = `style-popover-${seriesId}`;
	const { isOpen, close, toggleOpen, triggerRef, coords } = useAnchoredPopover(
		popoverId,
		POPOVER_WIDTH,
	);

	// The popover's own swatches follow a hovered colour too.
	const [hoverColor, setHoverColor] = useState<string | null>(null);

	// Clear a hover preview however the popover closes.
	const wasOpen = useRef(false);
	useEffect(() => {
		if (wasOpen.current && !isOpen) {
			onPreview(null);
			setHoverColor(null);
		}
		wasOpen.current = isOpen;
	}, [isOpen, onPreview]);

	const choose = (updates: StylePreview) => {
		onChange(updates);
		close();
	};

	const current = styleName(lineStyle, pointStyle);
	const hasLine = lineStyle !== "none";
	const summary = `${current}${hasLine && lineWidth !== DEFAULT_LINE_WIDTH ? `, ${lineWidth} px` : ""}`;
	const swatchWidth = Math.min(lineWidth, 3);

	return (
		<>
			<button
				ref={triggerRef}
				onClick={toggleOpen}
				className="sc-btn"
				title={`Style: ${summary}`}
				type="button"
				aria-label="Series Style"
				aria-description={`Currently ${color}, ${summary}. Opens the colors, line and point styles and line widths for ${seriesName}`}
				aria-haspopup="dialog"
				aria-expanded={isOpen}
				style={{ color }}
			>
				<StyleSwatch line={lineStyle} point={pointStyle} width={swatchWidth} />
			</button>
			{isOpen && (
				<AnchoredPopover
					id={popoverId}
					label="Series style"
					className="popup-picker-popover ssp-popover"
					style={{ ...coords, minWidth: POPOVER_WIDTH }}
					onClose={close}
				>
					<ColorPicker
						color={color}
						onSelect={(c) => choose({ color: c })}
						onChange={(c) => onChange({ color: c })}
						onHover={(c) => {
							setHoverColor(c);
							onPreview({ color: c });
						}}
						onHoverEnd={() => {
							setHoverColor(null);
							onPreview(null);
						}}
					/>
					<div className="ssp-styles" style={{ color: hoverColor ?? color }}>
						<div role="group" aria-label="Line and point style" className="ssp-grid">
							{LINE_STYLES.flatMap((line) =>
								POINT_STYLES.map((point) => {
									const name = styleName(line, point);
									const active = line === lineStyle && point === pointStyle;
									return (
										<button
											key={`${line}-${point}`}
											type="button"
											className="ssp-cell"
											onClick={() => choose({ lineStyle: line, pointStyle: point })}
											onMouseEnter={() =>
												onPreview({ lineStyle: line, pointStyle: point })
											}
											onMouseLeave={() => onPreview(null)}
											title={name}
											aria-label={name}
											aria-pressed={active}
											aria-description={
												line === "none" && point === "none"
													? "Draws neither line nor points, so the series disappears from the chart"
													: "Draws this series this way; hovering previews it"
											}
										>
											<StyleSwatch
												line={line}
												point={point}
												width={Math.min(lineWidth, 2)}
												wide
											/>
										</button>
									);
								}),
							)}
						</div>
						<div role="group" aria-label="Line width" className="ssp-widths">
							{LINE_WIDTHS.map((w) => (
								<button
									key={w}
									type="button"
									className="ssp-width"
									onClick={() => choose({ lineWidth: w })}
									onMouseEnter={() => onPreview({ lineWidth: w })}
									onMouseLeave={() => onPreview(null)}
									disabled={!hasLine}
									title={hasLine ? `${w} px` : "Only lines have a width"}
									aria-label={`${w} px`}
									aria-pressed={hasLine && w === lineWidth}
									aria-description={
										hasLine
											? "Draws this series' line this wide; hovering previews it"
											: "Only lines have a width; choose a line style first"
									}
								>
									<StyleSwatch line={lineStyle} point={pointStyle} width={w} wide />
									<span className="ssp-width-label">{w}</span>
								</button>
							))}
						</div>
					</div>
				</AnchoredPopover>
			)}
		</>
	);
}
