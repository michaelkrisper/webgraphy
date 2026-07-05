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
import { LabelSpriteCache } from "./labelSprites";

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


interface DrawXAxisOptions {
	ctx: CanvasRenderingContext2D;
	axis: XAxisLayout;
	metrics?: XAxisMetrics;
	height: number;
	width: number;
	padding: { top: number; right: number; bottom: number; left: number };
	labelColor: string;
	fontFamily: string;
	chartWidth: number;
	getLabel: (axisKey: string, precision: number, value: number) => string;
	secLabelBg: string;
	seriesByXAxisId: Record<string, SeriesConfig[]>;
	sprites: LabelSpriteCache;
}

interface DrawYAxisOptions {
	ctx: CanvasRenderingContext2D;
	axis: YAxisLayout;
	axisLayout: Record<string, { total: number; label: number }>;
	padding: { top: number; right: number; bottom: number; left: number };
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	width: number;
	fontFamily: string;
	labelColor: string;
	chartHeight: number;
	getLabel: (axisKey: string, precision: number, value: number) => string;
	seriesByYAxisId: Record<string, SeriesConfig[]>;
	sprites: LabelSpriteCache;
}

function drawXAxis({
	ctx,
	axis,
	metrics,
	height,
	width,
	padding,
	labelColor,
	fontFamily,
	chartWidth,
	getLabel,
	secLabelBg,
	seriesByXAxisId,
	sprites,
}: DrawXAxisOptions) {
	if (!metrics) return;
	const baseY = height - padding.bottom + metrics.cumulativeOffset;
	const lblColor = axis.color || labelColor;

	// Primary Labels
	const primaryFont = `9px ${fontFamily}`;
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
		sprites.draw(
			ctx,
			label,
			primaryFont,
			lblColor,
			x,
			primaryY,
			"center",
			"alphabetic",
		);
	});

	// Secondary Labels
	if (axis.ticks.secondaryLabels) {
		const secFont = `bold 10px ${fontFamily}`;
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

			const textWidth = sprites.measure(ctx, sl.label, secFont, lblColor);
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

			sprites.draw(
				ctx,
				sl.label,
				secFont,
				lblColor,
				x,
				baseY + metrics.secLabelBottom - 2,
				"left",
				"alphabetic",
			);
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
}

function drawYAxis({
	ctx,
	axis,
	axisLayout,
	padding,
	leftOffsets,
	rightOffsets,
	width,
	fontFamily,
	labelColor,
	chartHeight,
	getLabel,
	seriesByYAxisId,
	sprites,
}: DrawYAxisOptions) {
	const isLeft = axis.position === "left";
	const metrics = axisLayout[axis.id] || { total: 40, label: 30 };

	const xPos = isLeft
		? padding.left - (leftOffsets[axis.id] ?? 0) - metrics.total
		: width - padding.right + (rightOffsets[axis.id] ?? 0);

	const spineX = isLeft ? xPos + metrics.total : xPos;
	const labelX = isLeft ? spineX - 7 : spineX + 7;
	const titleX = isLeft ? xPos + 7.5 : xPos + metrics.total - 7.5;

	const tickFont = `9px ${fontFamily}`;
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
		sprites.draw(
			ctx,
			label,
			tickFont,
			labelColor,
			labelX,
			y,
			isLeft ? "right" : "left",
			"middle",
		);
	});

	// Y Axis Title (canvas — multicolor segments, rotated)
	const axisSeries = seriesByYAxisId[axis.id] || [];
	if (axisSeries.length > 0) {
		ctx.save();
		ctx.font = `bold 12px ${fontFamily}`;
		ctx.textBaseline = "middle";
		ctx.textAlign = "center";
		const sep = " / ";
		const segments: { text: string; color: string }[] = [];
		axisSeries.forEach((s, i) => {
			if (i > 0 && axisSeries.length > 1) {
				segments.push({ text: sep, color: labelColor });
			}
			segments.push({
				text: s.name || s.yColumn,
				color: s.lineColor ?? labelColor,
			});
		});
		const widths = segments.map(
			(seg) => ctx.measureText(seg.text).width,
		);
		const totalW = widths.reduce((a, b) => a + b, 0);
		const cx = titleX;
		const cy = padding.top + chartHeight / 2;
		ctx.translate(cx, cy);
		ctx.rotate(isLeft ? -Math.PI / 2 : Math.PI / 2);
		ctx.textAlign = "left";
		let x = -totalW / 2;
		for (let i = 0; i < segments.length; i++) {
			ctx.fillStyle = segments[i].color;
			ctx.fillText(segments[i].text, x, 0);
			x += widths[i];
		}
		ctx.restore();
	}
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
			// Rendered-label sprite cache: fillText once per unique label, then
			// drawImage per frame. See labelSprites.ts.
			const spritesRef = useRef<LabelSpriteCache | null>(null);
			if (!spritesRef.current) spritesRef.current = new LabelSpriteCache();
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

					labelCacheUsedRef.current.clear();
					const sprites = spritesRef.current as LabelSpriteCache;
					sprites.beginFrame(dpr);

					// X Axes Labels (canvas)
					xAxes.forEach((axis, axisIdx) => {
						drawXAxis({
							ctx,
							axis,
							metrics: xAxesMetrics[axisIdx],
							height,
							width,
							padding,
							labelColor,
							fontFamily,
							chartWidth,
							getLabel,
							secLabelBg,
							seriesByXAxisId,
							sprites,
						});
					});

					// Y Axes Labels (canvas)
					yAxes.forEach((axis) => {
						drawYAxis({
							ctx,
							axis,
							axisLayout,
							padding,
							leftOffsets,
							rightOffsets,
							width,
							fontFamily,
							labelColor,
							chartHeight,
							getLabel,
							seriesByYAxisId,
							sprites,
						});
					});

					ctx.restore();

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

			const isInteractingRef = useRef(isInteracting);
			useEffect(() => {
				isInteractingRef.current = isInteracting;
				if (!isInteracting) {
					drawRef.current(lastXAxes.current, lastYAxes.current);
				}
			}, [isInteracting]);

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

			useEffect(() => {
				if (!isInteractingRef.current) {
					lastXAxes.current = initialXAxes;
					lastYAxes.current = initialYAxes;
					drawRef.current(initialXAxes, initialYAxes);
				}
			}, [initialXAxes, initialYAxes]);

			const dpr = window.devicePixelRatio || 1;

			return (
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
			);
		},
	),
);

AxesLayer.displayName = "AxesLayer";

export { AxesLayer };
