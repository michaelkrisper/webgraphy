import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type { SeriesConfig } from "../../services/persistence";
import { formatAxisLabel } from "../../utils/axisCalculations";
import { escapeHTML } from "../../utils/dom";
import type { SecondaryLabel } from "../../utils/time";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";

export interface AxesLayerHandle {
	redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => void;
}

interface AxesLayerProps {
	xAxes: XAxisLayout[];
	yAxes: YAxisLayout[];
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	series: SeriesConfig[];
	axisLayout: Record<string, { total: number; label: number }>;
	xAxesMetrics: XAxisMetrics[];
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
	labelColor: string;
	secLabelBg: string;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	fontFamily: string;
	isInteracting?: boolean;
}

const AxesLayer = React.memo(
	forwardRef<AxesLayerHandle, AxesLayerProps>(
		(
			{
				xAxes: initialXAxes,
				yAxes: initialYAxes,
				width,
				height,
				padding,
				series,
				axisLayout,
				xAxesMetrics,
				axisColor,
				zeroLineColor,
				gridColor,
				plotBg,
				labelColor,
				secLabelBg,
				leftOffsets,
				rightOffsets,
				fontFamily,
				isInteracting = false,
			}: AxesLayerProps,
			ref,
		) => {
			const canvasRef = useRef<HTMLCanvasElement>(null);
			const gridCanvasRef = useRef<HTMLCanvasElement>(null);
			const labelsContainerRef = useRef<HTMLDivElement>(null);
			const labelPoolRef = useRef<HTMLDivElement[]>([]);
			const lastLabelUpdateRef = useRef<number>(0);

			const lastXAxes = useRef<XAxisLayout[]>(initialXAxes);
			const lastYAxes = useRef<YAxisLayout[]>(initialYAxes);
			const drawRef = useRef<
				(xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => void
			>(() => {});

			const seriesByYAxisId = useMemo(() => {
				const grouped: Record<string, SeriesConfig[]> = {};
				for (const s of series) {
					if (!grouped[s.yAxisId]) grouped[s.yAxisId] = [];
					grouped[s.yAxisId].push(s);
				}
				return grouped;
			}, [series]);

			const drawGrid = useCallback(
				(xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
					const canvas = gridCanvasRef.current;
					if (!canvas) return;
					const ctx = canvas.getContext("2d");
					if (!ctx) return;

					const dpr = window.devicePixelRatio || 1;
					ctx.clearRect(0, 0, canvas.width, canvas.height);

					const chartWidth = width - padding.left - padding.right;
					const chartHeight = height - padding.top - padding.bottom;

					ctx.save();
					ctx.scale(dpr, dpr);
					ctx.fillStyle = plotBg;
					ctx.fillRect(padding.left, padding.top, chartWidth, chartHeight);
					ctx.strokeStyle = gridColor;
					ctx.lineWidth = 1;
					ctx.beginPath();
					xAxes.forEach((axis, idx) => {
						if (idx === 0 && axis.showGrid) {
							axis.ticks.result.forEach((t) => {
								const ts = typeof t === "number" ? t : t.timestamp;
								const normX = (ts - axis.min) / (axis.max - axis.min);
								if (normX >= 0 && normX <= 1) {
									const x = padding.left + normX * chartWidth;
									ctx.moveTo(x, padding.top);
									ctx.lineTo(x, height - padding.bottom);
								}
							});
						}
					});
					yAxes.forEach((axis) => {
						if (axis.showGrid) {
							axis.ticks.forEach((t) => {
								const normY = (t - axis.min) / (axis.max - axis.min);
								if (normY >= 0 && normY <= 1) {
									const y = height - padding.bottom - normY * chartHeight;
									ctx.moveTo(padding.left, y);
									ctx.lineTo(width - padding.right, y);
								}
							});
						}
					});
					ctx.stroke();

					// Zero lines for Y axes (horizontal, only when showGrid active)
					yAxes.forEach((axis) => {
						if (axis.categoryLabels) return;
						if (axis.showGrid && axis.min <= 0 && axis.max >= 0) {
							const normY = (0 - axis.min) / (axis.max - axis.min);
							const y = height - padding.bottom - normY * chartHeight;
							const arrowTip = width - padding.right + 8;
							const arrowSize = 6;
							ctx.save();
							ctx.strokeStyle = zeroLineColor;
							ctx.fillStyle = zeroLineColor;
							ctx.lineWidth = 1.5;
							ctx.beginPath();
							ctx.moveTo(padding.left, y);
							ctx.lineTo(arrowTip, y);
							ctx.stroke();
							ctx.beginPath();
							ctx.moveTo(arrowTip, y);
							ctx.lineTo(arrowTip - arrowSize, y - arrowSize / 2);
							ctx.lineTo(arrowTip - arrowSize, y + arrowSize / 2);
							ctx.closePath();
							ctx.fill();
							ctx.restore();
						}
					});

					ctx.restore();
				},
				[width, height, padding, plotBg, gridColor, zeroLineColor],
			);

			const draw = useCallback(
				(xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
					drawGrid(xAxes, yAxes);

					const canvas = canvasRef.current;
					if (!canvas) return;
					const ctx = canvas.getContext("2d");
					if (!ctx) return;

					const dpr = window.devicePixelRatio || 1;
					ctx.clearRect(0, 0, canvas.width, canvas.height);

					const chartWidth = width - padding.left - padding.right;
					const chartHeight = height - padding.top - padding.bottom;

					ctx.save();
					ctx.scale(dpr, dpr);

					// --- Axis Frame & Ticks ---
					ctx.strokeStyle = axisColor;
					ctx.fillStyle = axisColor;
					ctx.lineWidth = 1;

					// Main frame spines
					ctx.beginPath();
					ctx.moveTo(padding.left, padding.top);
					ctx.lineTo(padding.left, height - padding.bottom);
					ctx.moveTo(padding.left, padding.top);
					ctx.lineTo(width - padding.right, padding.top);
					ctx.moveTo(width - padding.right, padding.top);
					ctx.lineTo(width - padding.right, height - padding.bottom);
					ctx.stroke();

					// X Axes lines + ticks + arrows
					xAxes.forEach((axis, idx) => {
						const metrics = xAxesMetrics[idx];
						if (!metrics) return;
						const y = height - padding.bottom + metrics.cumulativeOffset;
						// Axis line
						ctx.beginPath();
						ctx.moveTo(padding.left, y);
						ctx.lineTo(width - padding.right + 8, y);
						ctx.stroke();
						// Arrow at right end
						const size = 6;
						ctx.beginPath();
						ctx.moveTo(width - padding.right + 8, y);
						ctx.lineTo(width - padding.right + 8 - size, y - size / 2);
						ctx.lineTo(width - padding.right + 8 - size, y + size / 2);
						ctx.closePath();
						ctx.fill();
						// Tick marks
						ctx.beginPath();
						axis.ticks.result.forEach((t) => {
							const ts = typeof t === "number" ? t : t.timestamp;
							const normX = (ts - axis.min) / (axis.max - axis.min);
							if (normX >= 0 && normX <= 1) {
								const x = padding.left + normX * chartWidth;
								ctx.moveTo(x, y);
								ctx.lineTo(x, y + 6);
							}
						});
						ctx.stroke();
					});

					// Zero line (from first X axis)
					if (xAxes.length > 0) {
						const axis = xAxes[0];
						if (!axis.categoryLabels && axis.min <= 0 && axis.max >= 0) {
							const normX = (0 - axis.min) / (axis.max - axis.min);
							const x = padding.left + normX * chartWidth;
							ctx.strokeStyle = zeroLineColor;
							ctx.fillStyle = zeroLineColor;
							ctx.beginPath();
							ctx.moveTo(x, height - padding.bottom);
							ctx.lineTo(x, padding.top - 8);
							ctx.stroke();
							// Arrow pointing up
							const size = 6;
							ctx.beginPath();
							ctx.moveTo(x, padding.top - 8);
							ctx.lineTo(x - size / 2, padding.top - 8 + size);
							ctx.lineTo(x + size / 2, padding.top - 8 + size);
							ctx.closePath();
							ctx.fill();
							ctx.strokeStyle = axisColor;
							ctx.fillStyle = axisColor;
						}
					}

					// Y Axes lines + ticks + arrows
					yAxes.forEach((axis) => {
						const isLeft = axis.position === "left";
						const metrics = axisLayout[axis.id] || { total: 40 };
						const xPos = isLeft
							? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
							: width - padding.right + (rightOffsets[axis.id] ?? 0);
						const axisLineX = isLeft ? xPos + metrics.total : xPos;

						// Axis spine line
						ctx.beginPath();
						ctx.moveTo(axisLineX, height - padding.bottom);
						ctx.lineTo(axisLineX, padding.top - 8);
						ctx.stroke();
						// Arrow pointing up
						const size = 6;
						ctx.beginPath();
						ctx.moveTo(axisLineX, padding.top - 8);
						ctx.lineTo(axisLineX - size / 2, padding.top - 8 + size);
						ctx.lineTo(axisLineX + size / 2, padding.top - 8 + size);
						ctx.closePath();
						ctx.fill();
						// Tick marks
						ctx.beginPath();
						axis.ticks.forEach((t) => {
							const normY = (t - axis.min) / (axis.max - axis.min);
							if (normY >= 0 && normY <= 1) {
								const y = height - padding.bottom - normY * chartHeight;
								const x1 = isLeft ? axisLineX - 5 : axisLineX;
								const x2 = isLeft ? axisLineX : axisLineX + 5;
								ctx.moveTo(x1, y);
								ctx.lineTo(x2, y);
							}
						});
						ctx.stroke();
					});

					ctx.restore();

					// --- DOM Labels with Throttling ---
					const now = performance.now();
					const isInteracting = isInteractingRef.current;
					const shouldUpdateLabels = !isInteracting || (now - lastLabelUpdateRef.current > 100);

					if (!shouldUpdateLabels) return;
					lastLabelUpdateRef.current = now;

					let labelIdx = 0;
					const getLabelDiv = () => {
						let div = labelPoolRef.current[labelIdx];
						if (!div) {
							div = document.createElement("div");
							div.style.position = "absolute";
							div.style.pointerEvents = "none";
							div.style.whiteSpace = "nowrap";
							labelsContainerRef.current?.appendChild(div);
							labelPoolRef.current.push(div);
						}
						div.style.display = "block";
						div.style.background = "transparent";
						div.style.border = "none";
						div.style.padding = "0";
						labelIdx++;
						return div;
					};

					// X Axes Labels
					xAxes.forEach((axis, axisIdx) => {
						const metrics = xAxesMetrics[axisIdx];
						if (!metrics) return;
						const baseY = height - padding.bottom + metrics.cumulativeOffset;

						// Primary Labels
						axis.ticks.result.forEach((t) => {
							const timestamp = typeof t === "number" ? t : t.timestamp;
							const normX = (timestamp - axis.min) / (axis.max - axis.min);
							if (normX < 0 || normX > 1) return;
							const x = padding.left + normX * chartWidth;
							let label: string;
							if (axis.categoryLabels) {
								const v = typeof t === "number" ? t : t.timestamp;
								const idx = axis.categoryTicks
									? axis.categoryTicks.indexOf(v)
									: Math.round(v);
								const name = idx >= 0 ? axis.categoryLabels[idx] : undefined;
								if (name === undefined) return;
								label = name;
							} else {
								label =
									typeof t === "number"
										? formatAxisLabel(t, axis.ticks.precision ?? 0)
										: t.label;
							}
							const div = getLabelDiv();
							div.textContent = label;
							div.style.font = `9px ${fontFamily}`;
							div.style.color = axis.color || labelColor;
							div.style.transform = "translate(-50%, -100%)";
							div.style.left = `${x}px`;
							div.style.top = `${baseY + metrics.labelBottom - 9}px`;
						});

						// Secondary Labels
						if (axis.ticks.secondaryLabels) {
							axis.ticks.secondaryLabels.forEach(
								(sl: SecondaryLabel, i: number) => {
									const nextSl = axis.ticks.secondaryLabels?.[i + 1];
									const normX =
										(sl.timestamp - axis.min) / (axis.max - axis.min);
									const nextNormX = nextSl
										? (nextSl.timestamp - axis.min) / (axis.max - axis.min)
										: 1.5;

									const currentX = padding.left + normX * chartWidth;
									const nextX = padding.left + nextNormX * chartWidth;

									if (currentX > width - padding.right || nextX < padding.left)
										return;

									const x = Math.max(currentX + 5, padding.left + 5);

									ctx.save();
									ctx.scale(dpr, dpr);
									ctx.font = `bold 10px ${fontFamily}`;
									const textWidth = ctx.measureText(sl.label).width;
									const rectY = baseY + metrics.secLabelBottom - 14;
									ctx.fillStyle = secLabelBg;
									ctx.fillRect(x - 2, rectY, textWidth + 4, 14);

									if (currentX > padding.left) {
										ctx.strokeStyle = axis.color || labelColor;
										ctx.lineWidth = 2;
										ctx.beginPath();
										ctx.moveTo(currentX, rectY);
										ctx.lineTo(currentX, rectY + 14);
										ctx.stroke();
									}
									ctx.restore();

									const div = getLabelDiv();
									div.textContent = sl.label;
									div.style.font = `bold 10px ${fontFamily}`;
									div.style.color = axis.color || labelColor;
									div.style.transform = "translate(0, 0)";
									div.style.left = `${x}px`;
									div.style.top = `${baseY + metrics.secLabelBottom - 10}px`;
								},
							);
						}

						// Axis Title
						const titleDiv = getLabelDiv();
						titleDiv.textContent = axis.title;
						titleDiv.style.font = `bold 12px ${fontFamily}`;
						titleDiv.style.color = axis.color || labelColor;
						titleDiv.style.transform = "translate(-50%, -100%)";
						titleDiv.style.left = `${padding.left + chartWidth / 2}px`;
						titleDiv.style.top = `${baseY + metrics.titleBottom - 12}px`;
					});

					// Y Axes Labels
					yAxes.forEach((axis) => {
						const isLeft = axis.position === "left";
						const metrics = axisLayout[axis.id] || { total: 40, label: 30 };
						const axisSeries = seriesByYAxisId[axis.id] || [];

						const xPos = isLeft
							? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
							: width - padding.right + (rightOffsets[axis.id] ?? 0);

						const spineX = isLeft ? xPos + metrics.total : xPos;
						const labelX = isLeft ? spineX - 7 : spineX + 7;
						const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

						// Y Labels
						axis.ticks.forEach((t) => {
							const normY = (t - axis.min) / (axis.max - axis.min);
							if (normY < 0 || normY > 1) return;
							const y = padding.top + (1 - normY) * chartHeight;
							let label: string;
							if (axis.categoryLabels) {
								const idx = Math.round(t);
								const name = axis.categoryLabels[idx];
								if (name === undefined) return;
								label = name;
							} else {
								label = formatAxisLabel(t, axis.precision);
							}

							const div = getLabelDiv();
							div.textContent = label;
							div.style.font = `9px ${fontFamily}`;
							div.style.color = labelColor;
							div.style.transform = isLeft
								? "translate(-100%, -50%)"
								: "translate(0, -50%)";
							div.style.left = `${labelX}px`;
							div.style.top = `${y}px`;
						});

						// Y Axis Title
						const titleDiv = getLabelDiv();
						titleDiv.style.font = `bold 12px ${fontFamily}`;
						titleDiv.style.transform = isLeft
							? "translate(-50%, -50%) rotate(-90deg)"
							: "translate(-50%, -50%) rotate(90deg)";
						titleDiv.style.left = `${titleX}px`;
						titleDiv.style.top = `${padding.top + chartHeight / 2}px`;

						const html = axisSeries
							.map((s, i) => {
								const sep =
									i > 0 && axisSeries.length > 1
										? `<span style="color:${escapeHTML(labelColor)}"> / </span>`
										: "";
								const name = escapeHTML(s.name || s.yColumn);
								return `${sep}<span style="color:${escapeHTML(s.lineColor)}">${name}</span>`;
							})
							.join("");
						titleDiv.innerHTML = html;
					});

					// Hide remaining unused label divs
					for (let i = labelIdx; i < labelPoolRef.current.length; i++) {
						labelPoolRef.current[i].style.display = "none";
					}
				},
				[
					drawGrid,
					width,
					height,
					padding,
					xAxesMetrics,
					axisColor,
					zeroLineColor,
					labelColor,
					secLabelBg,
					fontFamily,
					axisLayout,
					seriesByYAxisId,
					leftOffsets,
					rightOffsets,
				],
			);

			useEffect(() => {
				drawRef.current = draw;
			}, [draw]);

			useImperativeHandle(
				ref,
				() => ({
					redraw: (xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
						lastXAxes.current = xAxes;
						lastYAxes.current = yAxes;
						drawRef.current(xAxes, yAxes);
					},
				}),
				[],
			);

			const isInteractingRef = useRef(isInteracting);
			useEffect(() => {
				isInteractingRef.current = isInteracting;
			}, [isInteracting]);

			useEffect(() => {
				if (!isInteractingRef.current) {
					lastXAxes.current = initialXAxes;
					lastYAxes.current = initialYAxes;
					drawRef.current(initialXAxes, initialYAxes);
				}
			}, [initialXAxes, initialYAxes, width, height]);

			const dpr = window.devicePixelRatio || 1;

			return (
				<>
					<canvas
						ref={gridCanvasRef}
						width={width * dpr}
						height={height * dpr}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							pointerEvents: "none",
							zIndex: 0,
						}}
					/>
					<canvas
						ref={canvasRef}
						width={width * dpr}
						height={height * dpr}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							pointerEvents: "none",
							zIndex: 6,
						}}
					/>
					<div
						ref={labelsContainerRef}
						style={{
							position: "absolute",
							inset: 0,
							width: "100%",
							height: "100%",
							pointerEvents: "none",
							zIndex: 7,
							overflow: "hidden",
						}}
					/>
				</>
			);
		},
	),
);

AxesLayer.displayName = "AxesLayer";

export { AxesLayer };
