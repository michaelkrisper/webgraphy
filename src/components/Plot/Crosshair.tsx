// src/components/Plot/Crosshair.tsx
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { getColumnIndex } from "../../utils/columns";
import { screenToWorld, worldToScreen } from "../../utils/coords";
import { escapeHTML } from "../../utils/dom";
import { formatFullDate } from "../../utils/time";

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

		const datasetsById = useMemo(() => {
			const map = new Map<string, Dataset>();
			datasets.forEach((d) => {
				map.set(d.id, d);
			});
			return map;
		}, [datasets]);

		const yAxesById = useMemo(() => {
			const map = new Map<string, YAxisConfig>();
			yAxes.forEach((a) => {
				map.set(a.id, a);
			});
			return map;
		}, [yAxes]);

		const xAxesById = useMemo(() => {
			const map = new Map<string, XAxisConfig>();
			xAxes.forEach((a) => {
				map.set(a.id, a);
			});
			return map;
		}, [xAxes]);

		const seriesMetadata = useMemo(() => {
			return series
				.filter((s) => !s.hidden)
				.map((s) => {
					const ds = datasetsById.get(s.sourceId);
					const axis = yAxesById.get(s.yAxisId);
					const xAxis = xAxesById.get(ds?.xAxisId || "axis-1");
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
		}, [datasetsById, yAxesById, xAxesById, series]);

		const xAxisNameById = useMemo(() => {
			const dsByX: Record<string, Dataset[]> = {};
			datasets.forEach((d) => {
				const xId = d.xAxisId || "axis-1";
				if (!dsByX[xId]) dsByX[xId] = [];
				dsByX[xId].push(d);
			});
			const out: Record<string, string> = {};
			for (const xId in dsByX) {
				const dss = dsByX[xId];
				const uniqueColumns = Array.from(
					dss.reduce(
						(acc, d: Dataset) => acc.add(d.xAxisColumn),
						new Set<string>(),
					),
				);
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
						let lo = 0,
							hi = xData.length - 1;
						while (lo < hi) {
							const mid = (lo + hi) >>> 1;
							if (xData[mid] + refX < sMouseWorld.x) lo = mid + 1;
							else hi = mid;
						}
						let bestI = lo;
						if (
							lo > 0 &&
							Math.abs(xData[lo - 1] + refX - sMouseWorld.x) <
								Math.abs(xData[lo] + refX - sMouseWorld.x)
						)
							bestI = lo - 1;
						cachedIdx = bestI;
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

						if (style === "square") {
							ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
							ctx.fillRect(xs - 6.5, ys - 6.5, 13, 13);
							ctx.fillStyle = color;
							ctx.fillRect(xs - 5.5, ys - 5.5, 11, 11);
							ctx.strokeStyle = plotBg;
							ctx.lineWidth = 2.5;
							ctx.strokeRect(xs - 5.5, ys - 5.5, 11, 11);
						} else if (style === "cross") {
							ctx.strokeStyle = "rgba(255, 255, 255, 0.9)";
							ctx.lineWidth = 5.0;
							ctx.beginPath();
							ctx.moveTo(xs - 5.5, ys - 5.5);
							ctx.lineTo(xs + 5.5, ys + 5.5);
							ctx.moveTo(xs + 5.5, ys - 5.5);
							ctx.lineTo(xs - 5.5, ys + 5.5);
							ctx.stroke();

							ctx.strokeStyle = color;
							ctx.lineWidth = 2.5;
							ctx.beginPath();
							ctx.moveTo(xs - 5.5, ys - 5.5);
							ctx.lineTo(xs + 5.5, ys + 5.5);
							ctx.moveTo(xs + 5.5, ys - 5.5);
							ctx.lineTo(xs - 5.5, ys + 5.5);
							ctx.stroke();
						} else {
							ctx.beginPath();
							ctx.arc(xs, ys, 6.5, 0, Math.PI * 2);
							ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
							ctx.fill();

							ctx.beginPath();
							ctx.arc(xs, ys, 5.5, 0, Math.PI * 2);
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
			[isPanning, snapLineColor, padding, height, plotBg],
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
				let html = "";
				snap.entries.forEach((group, gIdx) => {
					const sepStyle =
						gIdx > 0
							? `border-top:1px solid ${escapeHTML(tooltipDividerColor)};padding-top:4px;margin-top:4px;`
							: "";
					html += `<div style="color:${escapeHTML(tooltipSubColor)};font-size:9px;${sepStyle}">`;
					html += `<span class="chart-tooltip-x-label" style="color:${escapeHTML(tooltipColor)}">`;
					if (multi) html += `${escapeHTML(group.xAxisName)}: `;
					html += `${escapeHTML(group.xLabel)}</span></div>`;
					html += `<div class="chart-tooltip-items">`;
					for (const item of group.items) {
						const formatted =
							item.valueLabel ??
							parseFloat(item.value.toPrecision(7)).toLocaleString();
						const sepIdx = formatted.search(/[.,]/);
						const intPart =
							sepIdx === -1 ? formatted : formatted.slice(0, sepIdx);
						const decPart = sepIdx === -1 ? "" : formatted.slice(sepIdx);
						html += `<span class="chart-tooltip-item-label" style="color:${escapeHTML(item.color)}">${escapeHTML(item.label)}:</span>`;
						html += `<span class="chart-tooltip-value-int" style="color:${escapeHTML(tooltipColor)}">${escapeHTML(intPart)}</span>`;
						html += `<span class="chart-tooltip-value-dec" style="color:${escapeHTML(tooltipColor)}">${escapeHTML(decPart)}</span>`;
					}
					html += `</div>`;
				});
				tooltip.innerHTML = html;
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
