import React, {
	forwardRef,
	useCallback,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type { Dataset, SeriesConfig } from "../../services/persistence";
import { formatAxisLabel } from "../../utils/axisCalculations";
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
	datasets: Dataset[];
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
				datasets,
				axisLayout,
				xAxesMetrics,
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
			const labelsContainerRef = useRef<HTMLDivElement>(null);
			const yTitlePoolRef = useRef<Map<string, HTMLDivElement>>(new Map());
			const yTitleCacheRef = useRef<Map<string, string>>(new Map());
			const yTitleUsedRef = useRef<Set<string>>(new Set());
			// Label string cache: per-axis (id+precision) → tickValue → string.
			// Avoids per-frame toFixed/toExponential calls in formatAxisLabel.
			const labelCacheRef = useRef<Map<string, Map<number, string>>>(new Map());
			const labelCacheUsedRef = useRef<Set<string>>(new Set());
			const getLabel = (
				axisKey: string,
				precision: number,
				value: number,
			): string => {
				const mapKey = `${axisKey}|${precision}`;
				labelCacheUsedRef.current.add(mapKey);
				let m = labelCacheRef.current.get(mapKey);
				if (!m) {
					m = new Map();
					labelCacheRef.current.set(mapKey, m);
				}
				let s = m.get(value);
				if (s === undefined) {
					s = formatAxisLabel(value, precision);
					// Cap to prevent unbounded growth under heavy panning.
					if (m.size > 4096) m.clear();
					m.set(value, s);
				}
				return s;
			};

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

			const seriesByXAxisId = useMemo(() => {
				const dsXAxis = new Map(datasets.map((d) => [d.id, d.xAxisId]));
				const grouped: Record<string, SeriesConfig[]> = {};
				const seen: Record<string, Set<string>> = {};
				for (const s of series) {
					const xId = dsXAxis.get(s.sourceId);
					if (!xId) continue;
					if (!grouped[xId]) {
						grouped[xId] = [];
						seen[xId] = new Set();
					}
					const key = s.name || s.yColumn;
					if (seen[xId].has(key)) continue;
					seen[xId].add(key);
					grouped[xId].push(s);
				}
				return grouped;
			}, [series, datasets]);

			const draw = useCallback(
				(xAxes: XAxisLayout[], yAxes: YAxisLayout[]) => {
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

					yTitleUsedRef.current.clear();
					labelCacheUsedRef.current.clear();
					const getYTitleDiv = (axisId: string) => {
						let div = yTitlePoolRef.current.get(axisId);
						if (!div) {
							div = document.createElement("div");
							div.style.position = "absolute";
							div.style.pointerEvents = "none";
							div.style.whiteSpace = "nowrap";
							div.style.left = "0px";
							div.style.top = "0px";
							labelsContainerRef.current?.appendChild(div);
							yTitlePoolRef.current.set(axisId, div);
						}
						div.style.display = "block";
						yTitleUsedRef.current.add(axisId);
						return div;
					};

					// X Axes Labels (canvas)
					xAxes.forEach((axis, axisIdx) => {
						const metrics = xAxesMetrics[axisIdx];
						if (!metrics) return;
						const baseY = height - padding.bottom + metrics.cumulativeOffset;
						const lblColor = axis.color || labelColor;

						// Primary Labels
						ctx.font = `9px ${fontFamily}`;
						ctx.fillStyle = lblColor;
						ctx.textAlign = "center";
						ctx.textBaseline = "alphabetic";
						const primaryY = baseY + metrics.labelBottom;
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
										? getLabel(`x:${axis.id}`, axis.ticks.precision ?? 0, t)
										: t.label;
							}
							ctx.fillText(label, x, primaryY);
						});

						// Secondary Labels
						if (axis.ticks.secondaryLabels) {
							ctx.font = `bold 10px ${fontFamily}`;
							ctx.textAlign = "left";
							const rectY = baseY + metrics.secLabelBottom - 14;
							const secList = axis.ticks.secondaryLabels;
							secList.forEach((sl: SecondaryLabel, i: number) => {
								const nextSl = secList[i + 1];
								const normX = (sl.timestamp - axis.min) / (axis.max - axis.min);
								const nextNormX = nextSl
									? (nextSl.timestamp - axis.min) / (axis.max - axis.min)
									: 1.5;

								const currentX = padding.left + normX * chartWidth;
								const nextX = padding.left + nextNormX * chartWidth;

								if (currentX > width - padding.right || nextX < padding.left)
									return;

								const x = Math.max(currentX + 5, padding.left + 5);

								const textWidth = ctx.measureText(sl.label).width;
								ctx.fillStyle = secLabelBg;
								ctx.fillRect(x - 2, rectY, textWidth + 4, 14);

								if (currentX > padding.left) {
									ctx.strokeStyle = lblColor;
									ctx.lineWidth = 2;
									ctx.beginPath();
									ctx.moveTo(currentX, rectY);
									ctx.lineTo(currentX, rectY + 14);
									ctx.stroke();
								}

								ctx.fillStyle = lblColor;
								ctx.fillText(sl.label, x, baseY + metrics.secLabelBottom - 2);
							});
						}

						// Axis Title (canvas)
						const axisSeries = seriesByXAxisId[axis.id] || [];
						const uniqueColors = new Set(axisSeries.map((s) => s.lineColor));
						const titleColor =
							uniqueColors.size === 1
								? (axisSeries[0].lineColor ?? labelColor)
								: lblColor;
						ctx.font = `bold 12px ${fontFamily}`;
						ctx.fillStyle = titleColor;
						ctx.textAlign = "center";
						ctx.textBaseline = "alphabetic";
						ctx.fillText(
							axis.title,
							padding.left + chartWidth / 2,
							baseY + metrics.titleBottom,
						);
					});

					// Y Axes Labels (canvas)
					yAxes.forEach((axis) => {
						const isLeft = axis.position === "left";
						const metrics = axisLayout[axis.id] || { total: 40, label: 30 };

						const xPos = isLeft
							? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
							: width - padding.right + (rightOffsets[axis.id] ?? 0);

						const spineX = isLeft ? xPos + metrics.total : xPos;
						const labelX = isLeft ? spineX - 7 : spineX + 7;
						const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

						ctx.font = `9px ${fontFamily}`;
						ctx.fillStyle = labelColor;
						ctx.textAlign = isLeft ? "right" : "left";
						ctx.textBaseline = "middle";
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
								label = getLabel(`y:${axis.id}`, axis.precision, t);
							}
							ctx.fillText(label, labelX, y);
						});

						// Y Axis Title (DOM — multicolor spans, only when changes)
						const axisSeries = seriesByYAxisId[axis.id] || [];
						const titleDiv = getYTitleDiv(axis.id);
						const rotate = isLeft ? "rotate(-90deg)" : "rotate(90deg)";
						const newTransform = `translate(${titleX}px, ${padding.top + chartHeight / 2}px) translate(-50%, -50%) ${rotate}`;
						if (titleDiv.style.transform !== newTransform) {
							titleDiv.style.transform = newTransform;
						}
						const titleKey =
							axisSeries
								.map((s) => `${s.id}:${s.name || s.yColumn}:${s.lineColor}`)
								.join("|") + `||${labelColor}||${fontFamily}`;
						if (yTitleCacheRef.current.get(axis.id) !== titleKey) {
							titleDiv.style.font = `bold 12px ${fontFamily}`;
							let html = "";
							axisSeries.forEach((s, i) => {
								if (i > 0 && axisSeries.length > 1) {
									html += `<span style="color:${labelColor}"> / </span>`;
								}
								const name = (s.name || s.yColumn)
									.replace(/&/g, "&amp;")
									.replace(/</g, "&lt;")
									.replace(/>/g, "&gt;");
								html += `<span style="color:${s.lineColor}">${name}</span>`;
							});
							titleDiv.innerHTML = html;
							yTitleCacheRef.current.set(axis.id, titleKey);
						}
					});

					ctx.restore();

					// Hide y-title divs not used this frame
					yTitlePoolRef.current.forEach((div, axisId) => {
						if (!yTitleUsedRef.current.has(axisId)) {
							div.style.display = "none";
						}
					});
					// Evict label caches for axes/precisions not seen this frame.
					labelCacheRef.current.forEach((_, key) => {
						if (!labelCacheUsedRef.current.has(key))
							labelCacheRef.current.delete(key);
					});
				},
				[
					width,
					height,
					padding,
					xAxesMetrics,
					labelColor,
					secLabelBg,
					fontFamily,
					axisLayout,
					seriesByYAxisId,
					seriesByXAxisId,
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
			}, [initialXAxes, initialYAxes]);

			const dpr = window.devicePixelRatio || 1;

			return (
				<>
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
