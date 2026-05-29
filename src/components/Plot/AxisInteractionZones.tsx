// Absolute-positioned interaction overlays for each x-axis row and y-axis
// gutter. Each overlay forwards wheel/mouseDown/touchStart to the chart's
// pan-zoom handlers scoped to its own axis, and reacts to double-click with
// auto-scale (x and y) or inline title rename (x only). Extracted from
// ChartContainer so the per-axis JSX stops drowning the render block.

import { Fragment } from "react";
import type { XAxisMetrics, XAxisLayout } from "./chartTypes";
import { useGraphStore } from "../../store/useGraphStore";

interface Padding {
	top: number;
	right: number;
	bottom: number;
	left: number;
}

interface Theme {
	fontFamily: string;
	labelColor: string;
	plotBg: string;
	gridColor: string;
}

interface XInteractionProps {
	xAxesMetrics: XAxisMetrics[];
	xAxesLayout: XAxisLayout[];
	padding: Padding;
	editingXAxisId: string | null;
	setEditingXAxisId: (id: string | null) => void;
	themeColors: Theme;
	onWheel: (e: React.WheelEvent, target: { xAxisId: string }) => void;
	onMouseDown: (e: React.MouseEvent, target: { xAxisId: string }) => void;
	onTouchStart: (e: React.TouchEvent, target: { xAxisId: string }) => void;
	onAutoScaleX: (xAxisId: string) => void;
}

export function XAxisInteractionZones({
	xAxesMetrics,
	xAxesLayout,
	padding,
	editingXAxisId,
	setEditingXAxisId,
	themeColors,
	onWheel,
	onMouseDown,
	onTouchStart,
	onAutoScaleX,
}: XInteractionProps) {
	return (
		<>
			{xAxesMetrics.map((m) => {
				const bY = padding.bottom - m.cumulativeOffset - m.height;
				const title = xAxesLayout.find((a) => a.id === m.id)?.title || "";
				return (
					<Fragment key={`wheel-x-${m.id}`}>
						<div
							role="region"
							aria-label={`X-Axis ${m.id} interaction area`}
							onWheel={(e) => {
								e.stopPropagation();
								onWheel(e, { xAxisId: m.id });
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								onMouseDown(e, { xAxisId: m.id });
							}}
							onTouchStart={(e) => {
								e.stopPropagation();
								onTouchStart(e, { xAxisId: m.id });
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();
								const rect = e.currentTarget.getBoundingClientRect();
								const yInside = e.clientY - rect.top;
								// Check if double click is in the title area (roughly bottom 30px)
								if (yInside >= m.titleBottom - 30) {
									setEditingXAxisId(m.id);
								} else {
									onAutoScaleX(m.id);
								}
							}}
							style={{
								position: "absolute",
								bottom: bY,
								left: padding.left,
								right: padding.right,
								height: m.height,
								cursor: "ew-resize",
								zIndex: 20,
							}}
						/>
						{editingXAxisId === m.id && (
							<input
								defaultValue={title}
								onBlur={(e) => {
									const newName = e.target.value.trim();
									useGraphStore
										.getState()
										.updateXAxis(m.id, { name: newName });
									setEditingXAxisId(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.currentTarget.blur();
									} else if (e.key === "Escape") {
										setEditingXAxisId(null);
									}
								}}
								style={{
									position: "absolute",
									bottom: bY + m.height - m.titleBottom + 2,
									left: "50%",
									transform: "translateX(-50%)",
									zIndex: 30,
									textAlign: "center",
									font: `bold 12px ${themeColors.fontFamily}`,
									color: themeColors.labelColor,
									background: themeColors.plotBg,
									border: `1px solid ${themeColors.gridColor}`,
									borderRadius: "4px",
									padding: "2px 4px",
									outline: "none",
									width: "80%",
									maxWidth: "300px",
								}}
							/>
						)}
					</Fragment>
				);
			})}
		</>
	);
}

interface YAxis {
	id: string;
	position: "left" | "right";
}

interface YInteractionProps {
	axes: YAxis[];
	axisLayout: Record<string, { total: number; label: number }>;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	padding: Padding;
	width: number;
	containerRef: React.RefObject<HTMLDivElement | null>;
	onWheel: (e: React.WheelEvent, target: { yAxisId: string }) => void;
	onMouseDown: (e: React.MouseEvent, target: { yAxisId: string }) => void;
	onTouchStart: (e: React.TouchEvent, target: { yAxisId: string }) => void;
	onAutoScaleY: (yAxisId: string, mouseY?: number) => void;
}

export function YAxisInteractionZones({
	axes,
	axisLayout,
	leftOffsets,
	rightOffsets,
	padding,
	width,
	containerRef,
	onWheel,
	onMouseDown,
	onTouchStart,
	onAutoScaleY,
}: YInteractionProps) {
	return (
		<>
			{axes.map((a) => {
				const isL = a.position === "left";
				const am = axisLayout[a.id] || { total: 40 };
				const xP = isL
					? padding.left - (leftOffsets[a.id] ?? 0) - am.total
					: width - padding.right + (rightOffsets[a.id] ?? 0);
				return (
					<div
						role="region"
						aria-label={`Y-Axis ${a.id} interaction area`}
						key={`wheel-${a.id}`}
						onWheel={(e) => {
							e.stopPropagation();
							onWheel(e, { yAxisId: a.id });
						}}
						onMouseDown={(e) => {
							e.stopPropagation();
							onMouseDown(e, { yAxisId: a.id });
						}}
						onTouchStart={(e) => {
							e.stopPropagation();
							onTouchStart(e, { yAxisId: a.id });
						}}
						onDoubleClick={(e) => {
							e.stopPropagation();
							const rect = containerRef.current?.getBoundingClientRect();
							onAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined);
						}}
						style={{
							position: "absolute",
							left: xP,
							top: padding.top,
							width: am.total,
							bottom: padding.bottom,
							cursor: "ns-resize",
							zIndex: 20,
						}}
					/>
				);
			})}
		</>
	);
}
