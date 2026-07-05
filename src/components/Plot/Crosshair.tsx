// src/components/Plot/Crosshair.tsx
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { DEFAULT_X_AXIS_ID, getAxisById } from "../../utils/axisCalculations";
import { findClosest } from "../../utils/binarySearch";
import { getColumnIndex } from "../../utils/columns";
import { screenToWorld, worldToScreen } from "../../utils/coords";
import { formatFullDate } from "../../utils/time";

// Highlighted-point marker glyph sizes (px): a white "halo" drawn behind the
// smaller colored glyph. Square side = half * 2; circle radius = half.
const MARKER_OUTER_HALF = 6.5;
const MARKER_INNER_HALF = 5.5;

interface SeriesMetadata {
	series: SeriesConfig;
	ds: Dataset;
	axis: YAxisConfig;
	xAxis: XAxisConfig;
	xIdx: number;
	yIdx: number;
	xCol: { data: Float32Array; refPoint: number; categoryLabels?: string[] };
	yCol: { data: Float32Array; refPoint: number; categoryLabels?: string[] };
}

interface SnapItem {
	label: string;
	value: number;
	valueLabel?: string;
	color: string;
	yScreen: number;
	xScreen: number;
	pointStyle: string;
}

interface SnapGroup {
	xLabel: string;
	xAxisName: string;
	items: SnapItem[];
}

interface SnapResult {
	snapScreenX: number;
	entries: SnapGroup[];
}

interface CrosshairProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	padding: { top: number; right: number; bottom: number; left: number };
	width: number;
	height: number;
	isPanning: boolean;
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	datasets: Dataset[];
	series: SeriesConfig[];
	tooltipColor: string;
	snapLineColor: string;
	tooltipDividerColor: string;
	tooltipSubColor: string;
	plotBg: string;
}

const Crosshair = React.memo(
	({
		containerRef,
		padding,
		width,
		height,
		isPanning,
		xAxes,
		yAxes,
		datasets,
		series,
		tooltipColor,
		snapLineColor,
		tooltipDividerColor,
		tooltipSubColor,
		plotBg,
	}: CrosshairProps) => {
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const tooltipRef = useRef<HTMLDivElement>(null);
		const posRef = useRef<{ x: number; y: number } | null>(null);
		const lastSnapRef = useRef<SnapResult | null>(null);

		const datasetsById = useMemo(
			() => new Map(datasets.map((d) => [d.id, d])),
			[datasets],
		);

		const seriesMetadata = useMemo(() => {
			return series
				.filter((s) => !s.hidden)
				.map((s) => {
					const ds = datasetsById.get(s.sourceId);
					const axis = getAxisById(yAxes, s.yAxisId);
					const xAxis = getAxisById(xAxes, ds?.xAxisId || DEFAULT_X_AXIS_ID);
					if (!ds || !axis || !xAxis) return null;
					const xIdx = getColumnIndex(ds, ds.xAxisColumn);
					const yIdx = getColumnIndex(ds, s.yColumn);
					if (xIdx === -1 || yIdx === -1) return null;
					const xCol = ds.data[xIdx];
					const yCol = ds.data[yIdx];
					if (!xCol?.data || !yCol?.data) return null;
					return { series: s, ds, axis, xAxis, xIdx, yIdx, xCol, yCol };
				})
				.filter(Boolean) as SeriesMetadata[];
		}, [datasetsById, yAxes, xAxes, series]);

		const xAxisNameById = useMemo(() => {
			const dsByX: Record<string, Dataset[]> = {};
			datasets.forEach((d) => {
				const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
				if (!dsByX[xId]) dsByX[xId] = [];
				dsByX[xId].push(d);
			});
			const out: Record<string, string> = {};
			for (const xId in dsByX) {
				const dss = dsByX[xId];
				const uniqueSet = new Set<string>();
				for (const d of dss) {
					uniqueSet.add(d.xAxisColumn);
				}
				const uniqueColumns = Array.from(uniqueSet);
				out[xId] =
					dss.length > 1 ? uniqueColumns.join(" / ") : uniqueColumns[0];
			}
			return out;
		}, [datasets]);

		const computeSnap = useCallback(
			(pos: { x: number; y: number }): SnapResult | null => {
				if (seriesMetadata.length === 0) return null;
				const firstXAxis = seriesMetadata[0].xAxis;
				if (!firstXAxis) return null;

				let bestDist = Infinity;
				let bestXWorld: number | null = null;
				let bestSeriesXConf: XAxisConfig | null = null;
				const closestIdxByDataset = new Map<string, number>();

				seriesMetadata.forEach(({ ds, xAxis, xCol }) => {
					let cachedIdx = closestIdxByDataset.get(ds.id);
					const xData = xCol.data;
					const refX = xCol.refPoint;
					if (cachedIdx === undefined) {
						const sVp = {
							xMin: xAxis.min,
							xMax: xAxis.max,
							yMin: 0,
							yMax: 100,
							width,
							height,
							padding,
						};
						const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
						cachedIdx = findClosest(xData, sMouseWorld.x, refX);
						closestIdxByDataset.set(ds.id, cachedIdx);
					}
					const sVp = {
						xMin: xAxis.min,
						xMax: xAxis.max,
						yMin: 0,
						yMax: 100,
						width,
						height,
						padding,
					};
					const sMouseWorld = screenToWorld(pos.x, pos.y, sVp);
					for (const i of [cachedIdx - 1, cachedIdx, cachedIdx + 1]) {
						if (i < 0 || i >= xData.length) continue;
						const wx = xData[i] + refX;
						const d = Math.abs(wx - sMouseWorld.x);
						if (d < bestDist) {
							bestDist = d;
							bestXWorld = wx;
							bestSeriesXConf = xAxis;
						}
					}
				});

				if (bestXWorld === null || !bestSeriesXConf) return null;
				const finalBestXWorld = bestXWorld as number;
				const finalXConf = bestSeriesXConf as XAxisConfig;

				const entriesMap = new Map<string, SnapGroup>();

				seriesMetadata.forEach(({ series: s, ds, xAxis, xCol, yCol, axis }) => {
					const xData = xCol.data,
						yData = yCol.data;
					const refX = xCol.refPoint,
						refY = yCol.refPoint;
					const bestI = closestIdxByDataset.get(ds.id) as number;
					const yVal = yData[bestI] + refY;
					const xVal = xData[bestI] + refX;
					const label = s.name || s.yColumn;
					const xCatLabel = xCol.categoryLabels?.[Math.round(xVal)];
					const xLab =
						xCatLabel !== undefined
							? xCatLabel
							: xAxis.xMode === "date"
								? formatFullDate(xVal)
								: parseFloat(xVal.toPrecision(7)).toLocaleString(undefined, {
										minimumFractionDigits: 0,
										maximumFractionDigits: 10,
									});

					const xAxisName = xAxisNameById[xAxis.id] || "Unknown Axis";
					const groupKey = `${xLab}|${xAxisName}`;

					const yScreen = worldToScreen(0, yVal, {
						xMin: 0,
						xMax: 1,
						yMin: axis.min,
						yMax: axis.max,
						width,
						height,
						padding,
					}).y;

					const xScreen = worldToScreen(xVal, 0, {
						xMin: xAxis.min,
						xMax: xAxis.max,
						yMin: 0,
						yMax: 1,
						width,
						height,
						padding,
					}).x;

					let group = entriesMap.get(groupKey);
					if (!group) {
						group = { xLabel: xLab, xAxisName, items: [] };
						entriesMap.set(groupKey, group);
					}
					const yCatLabel = yCol.categoryLabels?.[Math.round(yVal)];
					group.items.push({
						label,
						value: yVal,
						valueLabel: yCatLabel,
						color: s.lineColor || "#333",
						yScreen,
						xScreen,
						pointStyle: s.pointStyle,
					});
				});

				const entries = Array.from(entriesMap.values());
				const snapScreenX = worldToScreen(finalBestXWorld, 0, {
					xMin: finalXConf.min,
					xMax: finalXConf.max,
					yMin: 0,
					yMax: 100,
					width,
					height,
					padding,
				}).x;
				return { snapScreenX, entries };
			},
			[seriesMetadata, width, height, padding, xAxisNameById],
		);

		const drawCanvas = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				const canvas = canvasRef.current;
				if (!canvas) return;
				const ctx = canvas.getContext("2d");
				if (!ctx) return;
				const dpr = window.devicePixelRatio || 1;
				ctx.clearRect(0, 0, canvas.width, canvas.height);
				if (!snap || isPanning || !pos) return;

				ctx.save();
				ctx.scale(dpr, dpr);

				ctx.strokeStyle = snapLineColor;
				ctx.lineWidth = 1;
				ctx.setLineDash([3, 3]);
				ctx.beginPath();
				ctx.moveTo(pos.x, padding.top);
				ctx.lineTo(pos.x, height - padding.bottom);
				ctx.stroke();

				ctx.setLineDash([]);
				for (const group of snap.entries) {
					for (const item of group.items) {
						const { xScreen: xs, yScreen: ys, pointStyle: style, color } = item;

						// Skip markers for points outside the plot area — they would
						// otherwise draw over axis labels/titles in the gutters.
						if (
							ys < padding.top ||
							ys > height - padding.bottom ||
							xs < padding.left ||
							xs > width - padding.right
						) {
							continue;
						}

						if (style === "square") {
							ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
							ctx.fillRect(
								xs - MARKER_OUTER_HALF,
								ys - MARKER_OUTER_HALF,
								MARKER_OUTER_HALF * 2,
								MARKER_OUTER_HALF * 2,
							);
							ctx.fillStyle = color;
							ctx.fillRect(
								xs - MARKER_INNER_HALF,
								ys - MARKER_INNER_HALF,
								MARKER_INNER_HALF * 2,
								MARKER_INNER_HALF * 2,
							);
							ctx.strokeStyle = plotBg;
							ctx.lineWidth = 2.5;
							ctx.strokeRect(
								xs - MARKER_INNER_HALF,
								ys - MARKER_INNER_HALF,
								MARKER_INNER_HALF * 2,
								MARKER_INNER_HALF * 2,
							);
						} else if (style === "cross") {
							ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
							ctx.lineWidth = 5.0;
							ctx.beginPath();
							ctx.moveTo(xs - MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
							ctx.lineTo(xs + MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
							ctx.moveTo(xs + MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
							ctx.lineTo(xs - MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
							ctx.stroke();

							ctx.strokeStyle = color;
							ctx.lineWidth = 2.5;
							ctx.beginPath();
							ctx.moveTo(xs - MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
							ctx.lineTo(xs + MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
							ctx.moveTo(xs + MARKER_INNER_HALF, ys - MARKER_INNER_HALF);
							ctx.lineTo(xs - MARKER_INNER_HALF, ys + MARKER_INNER_HALF);
							ctx.stroke();
						} else {
							ctx.beginPath();
							ctx.arc(xs, ys, MARKER_OUTER_HALF, 0, Math.PI * 2);
							ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
							ctx.fill();

							ctx.beginPath();
							ctx.arc(xs, ys, MARKER_INNER_HALF, 0, Math.PI * 2);
							ctx.fillStyle = color;
							ctx.fill();

							ctx.strokeStyle = plotBg;
							ctx.lineWidth = 2.5;
							ctx.stroke();
						}
					}
				}
				ctx.restore();
			},
			[isPanning, snapLineColor, padding, height, width, plotBg],
		);

		const renderTooltipHTML = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				const tooltip = tooltipRef.current;
				if (!tooltip) return;
				if (!snap || !pos || isPanning) {
					tooltip.style.display = "none";
					return;
				}
				tooltip.style.display = "";
				tooltip.style.left = `${pos.x + 12}px`;
				tooltip.style.top = `${pos.y + 15}px`;

				const multi = snap.entries.length > 1;

				// DOM node recycling
				let groupNode = tooltip.firstElementChild as HTMLElement | null;
				for (let gIdx = 0; gIdx < snap.entries.length; gIdx++) {
					const group = snap.entries[gIdx];

					if (!groupNode) {
						groupNode = document.createElement("div");
						tooltip.appendChild(groupNode);
					}

					groupNode.style.display = "";
					groupNode.style.color = tooltipSubColor;
					groupNode.style.fontSize = "9px";
					if (gIdx > 0) {
						groupNode.style.borderTop = `1px solid ${tooltipDividerColor}`;
						groupNode.style.paddingTop = "4px";
						groupNode.style.marginTop = "4px";
					} else {
						groupNode.style.borderTop = "";
						groupNode.style.paddingTop = "";
						groupNode.style.marginTop = "";
					}

					let labelSpan = groupNode.firstElementChild as HTMLElement | null;
					let itemsDiv = groupNode.lastElementChild as HTMLElement | null;

					if (!labelSpan || labelSpan === itemsDiv) {
						labelSpan = document.createElement("span");
						labelSpan.className = "chart-tooltip-x-label";
						groupNode.insertBefore(labelSpan, groupNode.firstChild);
					}
					if (!itemsDiv || itemsDiv === labelSpan) {
						itemsDiv = document.createElement("div");
						itemsDiv.className = "chart-tooltip-items";
						groupNode.appendChild(itemsDiv);
					}

					labelSpan.style.color = tooltipColor;
					let labelText = "";
					if (multi) labelText += `${group.xAxisName}: `;
					labelText += group.xLabel;
					labelSpan.textContent = labelText;

					let itemNode = itemsDiv.firstElementChild as HTMLElement | null;
					for (let iIdx = 0; iIdx < group.items.length; iIdx++) {
						const item = group.items[iIdx];
						const formatted =
							item.valueLabel ??
							parseFloat(item.value.toPrecision(7)).toLocaleString();
						const sepIdx = formatted.search(/[.,]/);
						const intPart =
							sepIdx === -1 ? formatted : formatted.slice(0, sepIdx);
						const decPart = sepIdx === -1 ? "" : formatted.slice(sepIdx);

						if (!itemNode) {
							itemNode = document.createElement("div");
							itemNode.className = "chart-tooltip-item-row";

							const itemLabelSpan = document.createElement("span");
							itemLabelSpan.className = "chart-tooltip-item-label";
							itemNode.appendChild(itemLabelSpan);

							const intPartSpan = document.createElement("span");
							intPartSpan.className = "chart-tooltip-value-int";
							itemNode.appendChild(intPartSpan);

							const decPartSpan = document.createElement("span");
							decPartSpan.className = "chart-tooltip-value-dec";
							itemNode.appendChild(decPartSpan);

							itemsDiv.appendChild(itemNode);
						}

						itemNode.hidden = false;
						const itemLabelSpan = itemNode.children[0] as HTMLElement;
						const intPartSpan = itemNode.children[1] as HTMLElement;
						const decPartSpan = itemNode.children[2] as HTMLElement;

						itemLabelSpan.style.color = item.color;
						itemLabelSpan.textContent = `${item.label}:`;

						intPartSpan.style.color = tooltipColor;
						intPartSpan.textContent = intPart;

						decPartSpan.style.color = tooltipColor;
						decPartSpan.textContent = decPart;

						itemNode = itemNode.nextElementSibling as HTMLElement | null;
					}

					// Hide remaining unused items in this group
					while (itemNode) {
						itemNode.hidden = true;
						itemNode = itemNode.nextElementSibling as HTMLElement | null;
					}

					groupNode = groupNode.nextElementSibling as HTMLElement | null;
				}

				// Hide remaining unused groups
				while (groupNode) {
					groupNode.style.display = "none";
					groupNode = groupNode.nextElementSibling as HTMLElement | null;
				}
			},
			[isPanning, tooltipColor, tooltipDividerColor, tooltipSubColor],
		);

		const updateCrosshair = useCallback(
			(pos: { x: number; y: number } | null) => {
				posRef.current = pos;
				const snap = pos ? computeSnap(pos) : null;
				lastSnapRef.current = snap;
				drawCanvas(snap, pos);
				renderTooltipHTML(snap, pos);
			},
			[computeSnap, drawCanvas, renderTooltipHTML],
		);

		useEffect(() => {
			const el = containerRef.current;
			if (!el) return;
			let rafId: number | null = null;
			let pendingPos: { x: number; y: number } | null = null;
			let cachedRect: DOMRect = el.getBoundingClientRect();
			const refreshRect = () => {
				cachedRect = el.getBoundingClientRect();
			};
			const ro = new ResizeObserver(refreshRect);
			ro.observe(el);
			window.addEventListener("scroll", refreshRect, true);
			window.addEventListener("resize", refreshRect);

			const schedule = () => {
				if (rafId !== null) return;
				rafId = requestAnimationFrame(() => {
					rafId = null;
					updateCrosshair(pendingPos);
				});
			};

			const handleMove = (e: MouseEvent | TouchEvent) => {
				if (isPanning) {
					if (rafId) cancelAnimationFrame(rafId);
					rafId = null;
					pendingPos = null;
					updateCrosshair(null);
					return;
				}
				const rect = cachedRect;
				let clientX: number;
				let clientY: number;
				if ("touches" in e) {
					if (e.touches.length !== 1) {
						pendingPos = null;
						schedule();
						return;
					}
					clientX = e.touches[0].clientX;
					clientY = e.touches[0].clientY;
				} else {
					clientX = e.clientX;
					clientY = e.clientY;
				}
				const x = clientX - rect.left;
				const y = clientY - rect.top;
				if (
					x >= padding.left &&
					x <= width - padding.right &&
					y >= padding.top &&
					y <= height - padding.bottom
				) {
					pendingPos = { x, y };
				} else {
					pendingPos = null;
				}
				schedule();
			};
			const handleLeave = () => {
				pendingPos = null;
				schedule();
			};
			window.addEventListener("mousemove", handleMove);
			window.addEventListener("touchstart", handleMove);
			window.addEventListener("touchmove", handleMove);
			el.addEventListener("mouseleave", handleLeave);
			return () => {
				if (rafId) cancelAnimationFrame(rafId);
				ro.disconnect();
				window.removeEventListener("scroll", refreshRect, true);
				window.removeEventListener("resize", refreshRect);
				window.removeEventListener("mousemove", handleMove);
				window.removeEventListener("touchstart", handleMove);
				window.removeEventListener("touchmove", handleMove);
				el.removeEventListener("mouseleave", handleLeave);
			};
		}, [containerRef, padding, width, height, isPanning, updateCrosshair]);

		// Redraw when inputs that affect snap/styles change (without depending on pos).
		useEffect(() => {
			updateCrosshair(posRef.current);
		}, [updateCrosshair]);

		useEffect(() => {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (e.ctrlKey && (e.key === "c" || e.key === "C")) {
					const snap = lastSnapRef.current;
					if (!snap) return;
					const text = snap.entries
						.map((g) => {
							const itemsText = g.items
								.map(
									(i) =>
										`${i.label}: ${i.valueLabel ?? i.value.toLocaleString(undefined, { maximumSignificantDigits: 7 })}`,
								)
								.join("\n");
							return `${g.xAxisName}: ${g.xLabel}\n${itemsText}`;
						})
						.join("\n\n");
					navigator.clipboard.writeText(text);
				}
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, []);

		return (
			<>
				<canvas
					ref={canvasRef}
					width={width * (window.devicePixelRatio || 1)}
					height={height * (window.devicePixelRatio || 1)}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						pointerEvents: "none",
						zIndex: 15,
					}}
				/>
				<div
					ref={tooltipRef}
					className="chart-tooltip"
					style={{
						whiteSpace: "pre",
						boxShadow: "0 10px 15px -3px var(--shadow)",
						display: "none",
					}}
				/>
			</>
		);
	},
);

Crosshair.displayName = "Crosshair";

export { Crosshair };
