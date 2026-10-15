// Absolute-positioned interaction overlays for each x-axis row and y-axis
// gutter. Each overlay forwards wheel/mouseDown/touchStart to the chart's
// pan-zoom handlers scoped to its own axis, and reacts to double-click with
// auto-scale (x and y) or inline title rename (x only). Extracted from
// ChartContainer so the per-axis JSX stops drowning the render block.
//
// Each zone is also a keyboard stop: arrows pan, +/- zoom, A auto-scales, R
// opens the exact-range popover (as does right-click) and (x only) Enter
// renames that one axis. Handled keys stop propagating so the window-level
// chart shortcuts do not also move every other axis.

import { Fragment, useMemo, useRef } from "react";
import type { XAxisMetrics, XAxisLayout } from "./chartTypes";
import { useGraphStore } from "../../store/useGraphStore";
import { type AxisStep, axisStepForKey } from "../../utils/keyboard";
import { hasKey, SHORTCUTS } from "../../utils/shortcuts";
import { axisZoneLabel } from "./axisZoneLabel";

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

/** Opens the exact-range popover for an axis, anchored at its zone. */
export type EditRangeHandler = (id: string, anchor: HTMLElement) => void;

function handleZoneKey(
	e: React.KeyboardEvent<HTMLElement>,
	kind: "x" | "y",
	id: string,
	onAxisStep: (id: string, step: AxisStep) => void,
	onAutoScale: (id: string) => void,
	onEditRange?: EditRangeHandler,
	onRename?: (id: string) => void,
) {
	// Modified keys (Ctrl +/- for X-only zoom, Ctrl+C, Alt+arrows for the
	// zoom history) stay chart-wide.
	if (e.ctrlKey || e.metaKey || e.altKey) return;
	const step = axisStepForKey(e.key, kind);
	if (step) onAxisStep(id, step);
	else if (hasKey(SHORTCUTS.axisAutoScale, e.key)) onAutoScale(id);
	else if (onEditRange && hasKey(SHORTCUTS.axisRange, e.key))
		onEditRange(id, e.currentTarget);
	else if (onRename && hasKey(SHORTCUTS.axisRename, e.key)) onRename(id);
	else return;
	e.preventDefault();
	e.stopPropagation();
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
	onAxisStep: (xAxisId: string, step: AxisStep) => void;
	onEditRange?: EditRangeHandler;
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
	onAxisStep,
	onEditRange,
}: XInteractionProps) {
	const layoutMap = useMemo(() => {
		const m = new Map();
		for (let i = 0; i < xAxesLayout.length; i++) {
			m.set(xAxesLayout[i].id, xAxesLayout[i]);
		}
		return m;
	}, [xAxesLayout]);
	const zoneRefs = useRef(new Map<string, HTMLDivElement>());
	// Escape moves focus back to the zone, which blurs the input; the blur
	// must not then commit the name being cancelled.
	const cancelledRef = useRef(false);

	return (
		<>
			{xAxesMetrics.map((m) => {
				const bY = padding.bottom - m.cumulativeOffset - m.height;
				const title = layoutMap.get(m.id)?.title || "";
				const visible = m.height > 0;
				return (
					<Fragment key={`wheel-x-${m.id}`}>
						<div
							ref={(el) => {
								if (el) zoneRefs.current.set(m.id, el);
								else zoneRefs.current.delete(m.id);
							}}
							className="axis-zone"
							{...(visible
								? {
										role: "group",
										tabIndex: 0,
										"aria-label": axisZoneLabel("x", m.id, title),
									}
								: { "aria-hidden": true })}
							onKeyDown={(e) =>
								handleZoneKey(
									e,
									"x",
									m.id,
									onAxisStep,
									onAutoScaleX,
									onEditRange,
									setEditingXAxisId,
								)
							}
							onContextMenu={(e) => {
								if (!onEditRange) return;
								e.preventDefault();
								e.stopPropagation();
								onEditRange(m.id, e.currentTarget);
							}}
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
								autoFocus
								aria-label={`Rename X axis ${m.id.replace(/^axis-/, "")}`}
								defaultValue={title}
								onBlur={(e) => {
									if (cancelledRef.current) {
										cancelledRef.current = false;
										return;
									}
									const newName = e.target.value.trim();
									useGraphStore.getState().updateXAxis(m.id, { name: newName });
									setEditingXAxisId(null);
								}}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.currentTarget.blur();
										zoneRefs.current.get(m.id)?.focus();
									} else if (e.key === "Escape") {
										cancelledRef.current = true;
										setEditingXAxisId(null);
										zoneRefs.current.get(m.id)?.focus();
										cancelledRef.current = false;
									}
								}}
								style={{
									position: "absolute",
									// Centred on the WebGL title glyphs (baseline at
									// titleBottom) so the opaque box hides the title
									// instead of leaving its lower half peeking out.
									bottom: bY + m.height - m.titleBottom - 7,
									height: 20,
									boxSizing: "border-box",
									left: "50%",
									transform: "translateX(-50%)",
									zIndex: 30,
									textAlign: "center",
									font: `bold 12px ${themeColors.fontFamily}`,
									color: themeColors.labelColor,
									background: themeColors.plotBg,
									border: `1px solid ${themeColors.gridColor}`,
									borderRadius: "4px",
									padding: "0 4px",
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
	/** Displayed axis titles by id, for the zones' accessible names. */
	titles?: Record<string, string>;
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
	onAxisStep: (yAxisId: string, step: AxisStep) => void;
	onEditRange?: EditRangeHandler;
}

export function YAxisInteractionZones({
	axes,
	titles,
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
	onAxisStep,
	onEditRange,
}: YInteractionProps) {
	return (
		<>
			{axes.map((a) => {
				const isL = a.position === "left";
				const am = axisLayout[a.id] || { total: 40 };
				const xP = isL
					? padding.left - (leftOffsets[a.id] ?? 0) - am.total
					: width - padding.right + (rightOffsets[a.id] ?? 0);
				const visible = am.total > 0;
				return (
					<div
						className="axis-zone"
						{...(visible
							? {
									role: "group",
									tabIndex: 0,
									"aria-label": axisZoneLabel("y", a.id, titles?.[a.id] ?? ""),
								}
							: { "aria-hidden": true })}
						key={`wheel-${a.id}`}
						onKeyDown={(e) =>
							handleZoneKey(
								e,
								"y",
								a.id,
								onAxisStep,
								(id) => onAutoScaleY(id),
								onEditRange,
							)
						}
						onContextMenu={(e) => {
							if (!onEditRange) return;
							e.preventDefault();
							e.stopPropagation();
							onEditRange(a.id, e.currentTarget);
						}}
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
