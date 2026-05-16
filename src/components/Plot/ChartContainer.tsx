/* eslint-disable react-hooks/refs */
// src/components/Plot/ChartContainer.tsx

import { ChartGantt, Expand } from "lucide-react";
import type React from "react";
import {
	Fragment,
	useCallback,
	useEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAutoScale } from "../../hooks/useAutoScale";
import { useDataImport } from "../../hooks/useDataImport";
import { usePanZoom } from "../../hooks/usePanZoom";
import { useTheme } from "../../hooks/useTheme";
import type {
	Dataset,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import {
	type AxesFrame,
	calcCategoricalTicks,
	calcNumericPrecision,
	calcNumericStep,
	calcNumericTicks,
	calcYAxisTicks,
	formatAxisLabel,
	syncAxesWithTargets,
} from "../../utils/axisCalculations";
import { applyKeyboardPan, applyKeyboardZoom } from "../../utils/keyboard";
import {
	generateSecondaryLabels,
	generateTimeTicks,
	getTimeStep,
} from "../../utils/time";
import ErrorBoundary from "../ErrorBoundary";
import { ImportSettingsDialog } from "../Layout/ImportSettingsDialog";
import { AxesLayer, type AxesLayerHandle } from "./AxesLayer";
import { ChartLegend } from "./ChartLegend";
import { Crosshair } from "./Crosshair";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";
import { EmptyState } from "./EmptyState";
import { WebGLRenderer, type WebGLRendererHandle } from "./WebGLRenderer";

type DatasetsByAxisId = Record<string, Dataset[]>;

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };

const getXAxisMetrics = (
	xMode: "date" | "numeric" | "categorical",
): Omit<XAxisMetrics, "id" | "cumulativeOffset"> => {
	if (xMode === "date") {
		return {
			height: 70,
			labelBottom: 22,
			secLabelBottom: 38,
			titleBottom: 60,
		};
	}
	return { height: 50, labelBottom: 26, secLabelBottom: 0, titleBottom: 40 };
};

const ChartContainer: React.FC = () => {
	// 1. Core Refs and State
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const { importFile, confirmImport, cancelImport, changeSheet, pendingFile } =
		useDataImport();
	const [width, setWidth] = useState(800);
	const [height, setHeight] = useState(600);
	const [editingXAxisId, setEditingXAxisId] = useState<string | null>(null);

	const targetXAxes = useRef<Record<string, { min: number; max: number }>>({});
	const targetYs = useRef<Record<string, { min: number; max: number }>>({});
	const webglRef = useRef<WebGLRendererHandle | null>(null);
	const axesLayerRef = useRef<AxesLayerHandle | null>(null);
	const pressedKeysRef = useRef<Set<string>>(new Set());

	type OverlayXEntry = {
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		categoryLabels?: string[];
	};
	type OverlayYEntry = {
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		position: "left" | "right";
		categoryLabels?: string[];
	};
	const overlayScratchRef = useRef<{
		xAxes: OverlayXEntry[];
		yAxes: OverlayYEntry[];
		xAxesMetrics: XAxisMetrics[];
		axisLayout: Record<string, { total: number; label: number }>;
		leftOffsets: Record<string, number>;
		rightOffsets: Record<string, number>;
		axisColor: string;
		zeroLineColor: string;
		gridColor: string;
		plotBg: string;
	}>({
		xAxes: [],
		yAxes: [],
		xAxesMetrics: [],
		axisLayout: {},
		leftOffsets: {},
		rightOffsets: {},
		axisColor: "",
		zeroLineColor: "",
		gridColor: "",
		plotBg: "",
	});
	const panStateRef = useRef({
		active: false,
		startX: 0,
		startY: 0,
		currentX: 0,
		currentY: 0,
		target: null,
		startTargetX: {},
		startTargetY: {},
	});

	// 2. Store Data
	const series = useGraphStore((s) => s.series);
	const xAxes = useGraphStore((s) => s.xAxes);
	const yAxes = useGraphStore((s) => s.yAxes);
	const isLoaded = useGraphStore((s) => s.isLoaded);
	const datasets = useGraphStore((s) => s.datasets);
	const highlightedSeriesId = useGraphStore((s) => s.highlightedSeriesId);
	const legendVisible = useGraphStore((s) => s.legendVisible);
	const crosshairVisible = useGraphStore((s) => s.crosshairVisible);
	const [themeName] = useTheme();
	const themeColors = THEMES[themeName];

	// Dimension management
	useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			if (entries.length > 0) {
				const e = entries[entries.length - 1];
				setWidth(e.contentRect.width);
				setHeight(e.contentRect.height);
			}
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	useEffect(() => {
		if (containerRef.current) {
			const rect = containerRef.current.getBoundingClientRect();
			setWidth(rect.width);
			setHeight(rect.height);
		}
	}, []);

	// 3. Layout Memos
	const activeDsIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => {
			set.add(s.sourceId);
		});
		return set;
	}, [series]);

	const usedYAxisIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => {
			set.add(s.yAxisId);
		});
		return set;
	}, [series]);

	const xAxesById = useMemo(() => {
		const m = new Map<string, XAxisConfig>();
		xAxes.forEach((a) => {
			m.set(a.id, a);
		});
		return m;
	}, [xAxes]);
	const yAxesById = useMemo(() => {
		const m = new Map<string, YAxisConfig>();
		yAxes.forEach((a) => {
			m.set(a.id, a);
		});
		return m;
	}, [yAxes]);

	const activeYAxes = useMemo(() => {
		return yAxes.filter((a) => usedYAxisIdsSet.has(a.id));
	}, [yAxes, usedYAxisIdsSet]);

	// Per-axis categorical labels: only when ALL series on the axis bind to a column
	// that has categoryLabels, and they all share the same label set.
	const yAxisCategoryLabels = useMemo(() => {
		const dsById = new Map<string, Dataset>();
		datasets.forEach((d) => {
			dsById.set(d.id, d);
		});
		const out = new Map<string, string[] | undefined>();
		const seriesByAxis = new Map<string, typeof series>();
		series.forEach((s) => {
			const arr = seriesByAxis.get(s.yAxisId) || [];
			arr.push(s);
			seriesByAxis.set(s.yAxisId, arr);
		});
		seriesByAxis.forEach((axisSeries, axisId) => {
			let labels: string[] | undefined;
			let mismatch = false;
			for (const s of axisSeries) {
				const ds = dsById.get(s.sourceId);
				if (!ds) {
					mismatch = true;
					break;
				}
				const colIdx = ds.columns.indexOf(s.yColumn);
				const col = colIdx >= 0 ? ds.data[colIdx] : undefined;
				const cl = col?.categoryLabels;
				if (!cl) {
					mismatch = true;
					break;
				}
				if (!labels) labels = cl;
				else if (
					labels.length !== cl.length ||
					labels.some((v, i) => v !== cl[i])
				) {
					mismatch = true;
					break;
				}
			}
			out.set(axisId, mismatch ? undefined : labels);
		});
		return out;
	}, [series, datasets]);

	// Per-X-axis categorical labels:
	// - if axis.xMode === "categorical": force categorical, derive labels from
	//   column.categoryLabels if available, else stringify unique integer values.
	// - else: auto-detect (all bound datasets' xAxisColumn share categoryLabels).
	const xAxisCategoryLabels = useMemo(() => {
		const out = new Map<
			string,
			{ labels: string[]; ticks?: number[] } | undefined
		>();
		const dssByX = new Map<string, Dataset[]>();
		datasets.forEach((d) => {
			if (!activeDsIdsSet.has(d.id)) return;
			const xId = d.xAxisId || "axis-1";
			const arr = dssByX.get(xId) || [];
			arr.push(d);
			dssByX.set(xId, arr);
		});
		const xAxisById = new Map(xAxes.map((a) => [a.id, a]));
		dssByX.forEach((dss, axisId) => {
			const cfg = xAxisById.get(axisId);
			const forced = cfg?.xMode === "categorical";
			let labels: string[] | undefined;
			let mismatch = false;
			for (const d of dss) {
				const colIdx = d.columns.indexOf(d.xAxisColumn);
				const col = colIdx >= 0 ? d.data[colIdx] : undefined;
				const cl = col?.categoryLabels;
				if (!cl) {
					mismatch = true;
					break;
				}
				if (!labels) labels = cl;
				else if (
					labels.length !== cl.length ||
					labels.some((v, i) => v !== cl[i])
				) {
					mismatch = true;
					break;
				}
			}
			if (!mismatch && labels) {
				out.set(axisId, { labels });
				return;
			}
			if (forced) {
				// Derive labels from unique values across bound datasets.
				const uniq = new Set<number>();
				for (const d of dss) {
					const colIdx = d.columns.indexOf(d.xAxisColumn);
					const col = colIdx >= 0 ? d.data[colIdx] : undefined;
					if (!col) continue;
					const ref = col.refPoint;
					const arr = col.data;
					for (let i = 0; i < arr.length; i++) {
						uniq.add(arr[i] + ref);
					}
					if (uniq.size > 1000) break;
				}
				const sorted = Array.from(uniq).sort((a, b) => a - b);
				out.set(axisId, {
					labels: sorted.map((v) => String(v)),
					ticks: sorted,
				});
				return;
			}
			out.set(axisId, undefined);
		});
		return out;
	}, [activeDsIdsSet, datasets, xAxes]);

	const activeXAxesUsed = useMemo(() => {
		const axisToMinDsIdx = new Map<string, number>();
		datasets.forEach((d, dsIdx) => {
			if (activeDsIdsSet.has(d.id)) {
				const xId = d.xAxisId || "axis-1";
				const currentMin = axisToMinDsIdx.get(xId);
				if (currentMin === undefined || dsIdx < currentMin) {
					axisToMinDsIdx.set(xId, dsIdx);
				}
			}
		});
		return xAxes
			.filter((a) => axisToMinDsIdx.has(a.id))
			.sort(
				(a, b) =>
					(axisToMinDsIdx.get(a.id) || 0) - (axisToMinDsIdx.get(b.id) || 0),
			);
	}, [xAxes, activeDsIdsSet, datasets]);

	const axisLayout = useMemo(() => {
		const layout: Record<string, { total: number; label: number }> = {};
		activeYAxes.forEach((axis) => {
			const categoryLabels = yAxisCategoryLabels.get(axis.id);
			let widestValChars: number;
			if (categoryLabels) {
				widestValChars = categoryLabels.reduce(
					(acc, n) => Math.max(acc, n?.length ?? 0),
					1,
				);
			} else {
				const step = calcNumericStep(
					axis.max - axis.min,
					Math.max(2, Math.floor(height / 30)),
				);
				const precision = calcNumericPrecision(step);
				widestValChars = Math.max(
					formatAxisLabel(axis.min, precision).length,
					formatAxisLabel(axis.max, precision).length,
				);
			}
			const labelWidth = Math.min(100, widestValChars * 6);
			layout[axis.id] = { label: labelWidth, total: labelWidth + 24 };
		});
		return layout;
	}, [activeYAxes, height, yAxisCategoryLabels]);

	const leftAxes = useMemo(
		() => activeYAxes.filter((a) => a.position === "left"),
		[activeYAxes],
	);
	const rightAxes = useMemo(
		() => activeYAxes.filter((a) => a.position === "right"),
		[activeYAxes],
	);

	const { leftOffsets, rightOffsets } = useMemo(() => {
		const leftOffsets: Record<string, number> = {};
		let lOff = 0;
		for (const a of leftAxes) {
			leftOffsets[a.id] = lOff;
			lOff += axisLayout[a.id]?.total || 40;
		}
		const rightOffsets: Record<string, number> = {};
		let rOff = 0;
		for (const a of rightAxes) {
			rightOffsets[a.id] = rOff;
			rOff += axisLayout[a.id]?.total || 40;
		}
		return { leftOffsets, rightOffsets };
	}, [leftAxes, rightAxes, axisLayout]);

	const xAxesMetrics = useMemo((): XAxisMetrics[] => {
		const result: XAxisMetrics[] = [];
		let currentOffset = 0;
		for (const axis of activeXAxesUsed) {
			const base = getXAxisMetrics(axis.xMode);
			result.push({ ...base, id: axis.id, cumulativeOffset: currentOffset });
			currentOffset += base.height;
		}
		return result;
	}, [activeXAxesUsed]);

	const padding = useMemo(() => {
		const base = BASE_PADDING_DESKTOP;
		const leftSum = leftAxes.reduce(
			(sum, a) => sum + (axisLayout[a.id]?.total || 40),
			0,
		);
		const rightSum = rightAxes.reduce(
			(sum, a) => sum + (axisLayout[a.id]?.total || 40),
			0,
		);
		const bottom =
			xAxesMetrics.length > 0
				? xAxesMetrics.reduce((sum, m) => sum + m.height, 0)
				: base.bottom;
		return {
			...base,
			left: base.left + leftSum,
			right: base.right + rightSum,
			bottom,
		};
	}, [leftAxes, rightAxes, axisLayout, xAxesMetrics]);

	const chartWidth = Math.max(0, width - padding.left - padding.right);
	const chartHeight = Math.max(0, height - padding.top - padding.bottom);

	// 4. Callbacks for canvas rendering
	const liveAxesScratchRef = useRef<{ liveX: XAxisConfig[]; liveY: YAxisConfig[] }>({
		liveX: [],
		liveY: [],
	});
	const syncScratchRef = useRef<{
		xUpdates: Record<string, { min: number; max: number }>;
		yUpdates: Record<string, { min: number; max: number }>;
	}>({ xUpdates: {}, yUpdates: {} });
	const buildLiveAxes = useCallback(
		(
			xUpdates: Record<string, { min: number; max: number }>,
			yUpdates: Record<string, { min: number; max: number }>,
		) => {
			const state = useGraphStore.getState();
			const scratch = liveAxesScratchRef.current;
			const liveX = scratch.liveX;
			const liveY = scratch.liveY;
			liveX.length = state.xAxes.length;
			for (let i = 0; i < state.xAxes.length; i++) {
				const a = state.xAxes[i];
				const upd = xUpdates[a.id];
				liveX[i] = upd ? { ...a, min: upd.min, max: upd.max } : a;
			}
			liveY.length = state.yAxes.length;
			for (let i = 0; i < state.yAxes.length; i++) {
				const a = state.yAxes[i];
				const upd = yUpdates[a.id];
				liveY[i] = upd ? { ...a, min: upd.min, max: upd.max } : a;
			}
			return { liveX, liveY };
		},
		[],
	);

	const xLayoutCacheRef = useRef<
		Map<string, { key: string; layout: XAxisLayout }>
	>(new Map());
	const xLayoutCacheDepsRef = useRef<string>("");
	const computeXAxesLayout = useCallback(
		(liveXAxes: XAxisConfig[]): XAxisLayout[] => {
			const dsByX: DatasetsByAxisId = {};
			datasets.forEach((d) => {
				if (activeDsIdsSet.has(d.id)) {
					const xId = d.xAxisId || "axis-1";
					if (!dsByX[xId]) dsByX[xId] = [];
					dsByX[xId].push(d);
				}
			});

			const depsKey = `${chartWidth}|${themeColors.labelColor}|${datasets.length}|${activeDsIdsSet.size}`;
			if (xLayoutCacheDepsRef.current !== depsKey) {
				xLayoutCacheRef.current.clear();
				xLayoutCacheDepsRef.current = depsKey;
			}
			const cache = xLayoutCacheRef.current;

			return liveXAxes
				.filter((axis) => activeXAxesUsed.some((ax) => ax.id === axis.id))
				.map((axis) => {
					const cacheKey = `${axis.min}|${axis.max}|${axis.showGrid}|${axis.xMode}|${axis.name ?? ""}`;
					const cached = cache.get(axis.id);
					if (cached && cached.key === cacheKey) return cached.layout;
					const layout = ((): XAxisLayout => {
					const r = axis.max - axis.min,
						isDate = axis.xMode === "date";
					const catInfo = xAxisCategoryLabels.get(axis.id);
					const categoryLabels = catInfo?.labels;
					const categoryTicks = catInfo?.ticks;
					const dss = dsByX[axis.id] || [];
					const uniqueColumns = Array.from(
						dss.reduce(
							(acc, d: Dataset) => acc.add(d.xAxisColumn),
							new Set<string>(),
						),
					);
					const defaultTitle =
						dss.length > 1 ? uniqueColumns.join(" / ") : uniqueColumns[0];
					const title = axis.name || defaultTitle || "";
					const color = themeColors.labelColor;
					if (r <= 0 || chartWidth <= 0)
						return {
							id: axis.id,
							min: axis.min,
							max: axis.max,
							showGrid: axis.showGrid,
							ticks: {
								result: [],
								step: 1,
								precision: 0,
								isXDate: false as const,
							},
							title,
							color,
							categoryLabels,
							categoryTicks,
						};
					if (categoryLabels) {
						const result = categoryTicks
							? categoryTicks.filter((v) => v >= axis.min && v <= axis.max)
							: calcCategoricalTicks(axis.min, axis.max, categoryLabels.length);
						return {
							id: axis.id,
							min: axis.min,
							max: axis.max,
							showGrid: axis.showGrid,
							ticks: {
								result,
								step: 1,
								precision: 0,
								isXDate: false as const,
							},
							title,
							color,
							categoryLabels,
							categoryTicks,
						};
					}
					if (!isDate) {
						const step = calcNumericStep(
							r,
							Math.max(2, Math.floor(chartWidth / 60)),
						);
						if (step <= 0)
							return {
								id: axis.id,
								min: axis.min,
								max: axis.max,
								showGrid: axis.showGrid,
								ticks: {
									result: [],
									step: 1,
									precision: 0,
									isXDate: false as const,
								},
								title,
								color,
							};
						const precision = calcNumericPrecision(step);
						return {
							id: axis.id,
							min: axis.min,
							max: axis.max,
							showGrid: axis.showGrid,
							ticks: {
								result: calcNumericTicks(axis.min, axis.max, step),
								step,
								precision,
								isXDate: false as const,
							},
							title,
							color,
						};
					} else {
						const ts = getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
						return {
							id: axis.id,
							min: axis.min,
							max: axis.max,
							showGrid: axis.showGrid,
							ticks: {
								result: generateTimeTicks(axis.min, axis.max, ts),
								isXDate: true as const,
								secondaryLabels: generateSecondaryLabels(
									axis.min,
									axis.max,
									ts,
								),
							},
							title,
							color,
						};
					}
				})();
					cache.set(axis.id, { key: cacheKey, layout });
					return layout;
				});
		},
		[
			activeDsIdsSet,
			datasets,
			themeColors.labelColor,
			chartWidth,
			activeXAxesUsed,
			xAxisCategoryLabels,
		],
	);

	const yLayoutCacheRef = useRef<
		Map<string, { key: string; layout: YAxisLayout }>
	>(new Map());
	const yLayoutCacheDepsRef = useRef<string>("");
	const computeYAxesLayout = useCallback(
		(liveYAxes: YAxisConfig[]): YAxisLayout[] => {
			const depsKey = `${chartHeight}|${usedYAxisIdsSet.size}`;
			if (yLayoutCacheDepsRef.current !== depsKey) {
				yLayoutCacheRef.current.clear();
				yLayoutCacheDepsRef.current = depsKey;
			}
			const cache = yLayoutCacheRef.current;
			return liveYAxes
				.filter((a) => usedYAxisIdsSet.has(a.id))
				.map((axis) => {
					const cacheKey = `${axis.min}|${axis.max}|${axis.position}|${axis.showGrid}|${axis.name ?? ""}`;
					const cached = cache.get(axis.id);
					if (cached && cached.key === cacheKey) return cached.layout;
					const categoryLabels = yAxisCategoryLabels.get(axis.id);
					const { ticks, precision, actualStep } = calcYAxisTicks(
						axis.min,
						axis.max,
						chartHeight,
						categoryLabels ? 1 : undefined,
						categoryLabels?.length,
					);
					const layout = {
						...axis,
						ticks,
						precision,
						actualStep,
						categoryLabels,
					};
					cache.set(axis.id, { key: cacheKey, layout });
					return layout;
				});
		},
		[usedYAxisIdsSet, chartHeight, yAxisCategoryLabels],
	);

	const syncViewportRef = useRef<(force?: boolean) => void>(() => {});
	const rafId = useRef<number | null>(null);
	const overlayInitRef = useRef(false);

	// 5. Hooks
	const { handleAutoScaleY, handleAutoScaleX, handleStackedFit } = useAutoScale(
		{
			isLoaded,
			series,
			datasets,
			xAxes,
			activeYAxes,
			activeXAxesUsed,
			padding,
			chartHeight,
			targetXAxes,
			targetYs,
			syncViewport: (force) => syncViewportRef.current(force),
		},
	);

	const handleFitAll = useCallback(() => {
		handleAutoScaleX();
		activeYAxes.forEach((ax) => {
			handleAutoScaleY(ax.id);
		});
	}, [handleAutoScaleX, handleAutoScaleY, activeYAxes]);

	const {
		panTarget,
		isCtrlPressed,
		isShiftPressed,
		isInteracting,
		isZooming,
		zoomBoxSvgRef,
		zoomBoxRectRef,
		handleMouseDown,
		handleTouchStart,
		handleWheel,
	} = usePanZoom({
		containerRef,
		width,
		height,
		padding,
		chartWidth,
		chartHeight,
		activeXAxes: activeXAxesUsed,
		activeYAxes,
		xAxesById,
		yAxesById,
		targetXAxes,
		targetYs,
		syncViewport: (force) => syncViewportRef.current(force),
		xAxesMetrics,
		axisLayout,
		leftAxes,
		rightAxes,
		handleAutoScaleX,
		handleAutoScaleY,
		pressedKeys: pressedKeysRef,
		panStateRef,
		onPanEnd: useCallback(() => {
			panStateRef.current.active = false;
			syncViewportRef.current(true);
		}, []),
	});

	const isInteractingRef = useRef(false);
	useEffect(() => {
		isInteractingRef.current = isInteracting;
	}, [isInteracting]);

	const syncViewport = useCallback(
		(forceStoreUpdate = false) => {
			if (rafId.current && !forceStoreUpdate) return;

			const runSync = () => {
				rafId.current = null;
				const state = useGraphStore.getState();
				const kbZoom = applyKeyboardZoom(
					state,
					pressedKeysRef.current,
					targetXAxes.current,
					targetYs.current,
				);
				const kbPan = applyKeyboardPan(
					state,
					pressedKeysRef.current,
					targetXAxes.current,
					targetYs.current,
				);

				const { xUpdates, yUpdates, hasUpdates }: AxesFrame =
					syncAxesWithTargets(
						state,
						targetXAxes.current,
						targetYs.current,
						syncScratchRef.current,
					);

				if (hasUpdates || !overlayInitRef.current) {
					overlayInitRef.current = true;
					const { liveX, liveY } = buildLiveAxes(xUpdates, yUpdates);

					const isInteractingNow =
						panStateRef.current.active || isInteractingRef.current;
					const xLayout = computeXAxesLayout(liveX);
					const yLayout = computeYAxesLayout(liveY);

					const scratch = overlayScratchRef.current;
					const sx = scratch.xAxes;
					sx.length = xLayout.length;
					for (let i = 0; i < xLayout.length; i++) {
						const a = xLayout[i];
						let entry = sx[i];
						if (!entry) {
							entry = {
								id: a.id,
								min: a.min,
								max: a.max,
								showGrid: a.showGrid,
								ticks: [],
								categoryLabels: a.categoryLabels,
							};
							sx[i] = entry;
						} else {
							entry.id = a.id;
							entry.min = a.min;
							entry.max = a.max;
							entry.showGrid = a.showGrid;
							entry.categoryLabels = a.categoryLabels;
						}
						const src = a.ticks.result;
						const dst = entry.ticks;
						dst.length = src.length;
						for (let j = 0; j < src.length; j++) {
							const t = src[j];
							dst[j] = typeof t === "number" ? t : t.timestamp;
						}
					}
					const sy = scratch.yAxes;
					sy.length = yLayout.length;
					for (let i = 0; i < yLayout.length; i++) {
						const a = yLayout[i];
						let entry = sy[i];
						if (!entry) {
							entry = {
								id: a.id,
								min: a.min,
								max: a.max,
								showGrid: a.showGrid,
								ticks: a.ticks,
								position: a.position,
								categoryLabels: a.categoryLabels,
							};
							sy[i] = entry;
						} else {
							entry.id = a.id;
							entry.min = a.min;
							entry.max = a.max;
							entry.showGrid = a.showGrid;
							entry.ticks = a.ticks;
							entry.position = a.position;
							entry.categoryLabels = a.categoryLabels;
						}
					}
					scratch.xAxesMetrics = xAxesMetrics;
					scratch.axisLayout = axisLayout;
					scratch.leftOffsets = leftOffsets;
					scratch.rightOffsets = rightOffsets;
					scratch.axisColor = themeColors.axisColor;
					scratch.zeroLineColor = themeColors.zeroLineColor;
					scratch.gridColor = themeColors.gridColor;
					scratch.plotBg = themeColors.plotBg;
					webglRef.current?.setOverlay(scratch);
					webglRef.current?.redraw(liveX, liveY);
					axesLayerRef.current?.redraw(xLayout, yLayout);

					// Only sync back to store if not currently interacting (panning/zooming)
					if (forceStoreUpdate || !isInteractingNow) {
						const currentX = state.xAxes;
						const currentY = state.yAxes;

						const filteredXUpdates: Record<
							string,
							{ min: number; max: number }
						> = {};
						const filteredYUpdates: Record<
							string,
							{ min: number; max: number }
						> = {};

						const EPSILON = 1e-10;
						Object.entries(xUpdates).forEach(([id, upd]) => {
							const axis = currentX.find((a) => a.id === id);
							if (
								!axis ||
								Math.abs(axis.min - upd.min) > EPSILON ||
								Math.abs(axis.max - upd.max) > EPSILON
							) {
								filteredXUpdates[id] = upd;
							}
						});

						Object.entries(yUpdates).forEach(([id, upd]) => {
							const axis = currentY.find((a) => a.id === id);
							if (
								!axis ||
								Math.abs(axis.min - upd.min) > EPSILON ||
								Math.abs(axis.max - upd.max) > EPSILON
							) {
								filteredYUpdates[id] = upd;
							}
						});

						if (
							Object.keys(filteredXUpdates).length > 0 ||
							Object.keys(filteredYUpdates).length > 0
						) {
							state.batchUpdateAxes(filteredXUpdates, filteredYUpdates);
						}
					}
				}
				if (kbZoom || kbPan) {
					syncViewportRef.current(false);
				}
			};

			if (forceStoreUpdate) {
				if (rafId.current) cancelAnimationFrame(rafId.current);
				runSync();
			} else {
				rafId.current = requestAnimationFrame(runSync);
			}
		},
		[
			buildLiveAxes,
			computeXAxesLayout,
			computeYAxesLayout,
			xAxesMetrics,
			axisLayout,
			leftOffsets,
			rightOffsets,
			themeColors,
		],
	);

	syncViewportRef.current = syncViewport;

	// 6. Effects
	useEffect(() => {
		if (isLoaded) {
			const EPSILON = 1e-10;
			let changed = false;
			xAxes.forEach((axis) => {
				const target = targetXAxes.current[axis.id];
				if (
					!target ||
					Math.abs(target.min - axis.min) > EPSILON ||
					Math.abs(target.max - axis.max) > EPSILON
				) {
					targetXAxes.current[axis.id] = { min: axis.min, max: axis.max };
					changed = true;
				}
			});
			yAxes.forEach((axis) => {
				const target = targetYs.current[axis.id];
				if (
					!target ||
					Math.abs(target.min - axis.min) > EPSILON ||
					Math.abs(target.max - axis.max) > EPSILON
				) {
					targetYs.current[axis.id] = { min: axis.min, max: axis.max };
					changed = true;
				}
			});
			if (changed) syncViewportRef.current();
		}
	}, [isLoaded, xAxes, yAxes]);

	// Force redraw on sidebar config changes (series, datasets, axes config, theme)
	// that don't affect axis min/max but do affect rendering output.
	useEffect(() => {
		if (isLoaded) {
			overlayInitRef.current = false;
			syncViewportRef.current(true);
		}
	}, [isLoaded, series, datasets, xAxes, yAxes, themeColors]);

	useEffect(() => {
		if (!containerRef.current) return;
		const observer = new ResizeObserver((entries) => {
			if (entries.length > 0) {
				const e = entries[entries.length - 1];
				setWidth(e.contentRect.width);
				setHeight(e.contentRect.height);
			}
		});
		observer.observe(containerRef.current);
		return () => observer.disconnect();
	}, []);

	// 7. Memos for static rendering (JSX)
	const activeYAxesLayout = useMemo((): YAxisLayout[] => {
		return activeYAxes.map((axis) => {
			const categoryLabels = yAxisCategoryLabels.get(axis.id);
			const { ticks, precision, actualStep } = calcYAxisTicks(
				axis.min,
				axis.max,
				chartHeight,
				categoryLabels ? 1 : undefined,
				categoryLabels?.length,
			);
			return { ...axis, ticks, precision, actualStep, categoryLabels };
		});
	}, [activeYAxes, chartHeight, yAxisCategoryLabels]);

	const xAxesLayout = useMemo((): XAxisLayout[] => {
		const dsByX: DatasetsByAxisId = {};
		datasets.forEach((d) => {
			if (activeDsIdsSet.has(d.id)) {
				const xId = d.xAxisId || "axis-1";
				if (!dsByX[xId]) dsByX[xId] = [];
				dsByX[xId].push(d);
			}
		});

		return activeXAxesUsed.map((axis) => {
			const r = axis.max - axis.min,
				isDate = axis.xMode === "date";
			const catInfo = xAxisCategoryLabels.get(axis.id);
			const categoryLabels = catInfo?.labels;
			const categoryTicks = catInfo?.ticks;
			const dss = dsByX[axis.id] || [];
			const uniqueColumns = Array.from(
				dss.reduce(
					(acc, d: Dataset) => acc.add(d.xAxisColumn),
					new Set<string>(),
				),
			);
			const defaultTitle =
				dss.length > 1 ? uniqueColumns.join(" / ") : uniqueColumns[0];
			const title = axis.name || defaultTitle || "";
			const color = themeColors.labelColor;
			if (r <= 0 || chartWidth <= 0)
				return {
					id: axis.id,
					min: axis.min,
					max: axis.max,
					showGrid: axis.showGrid,
					ticks: { result: [], step: 1, precision: 0, isXDate: false as const },
					title,
					color,
					categoryLabels,
					categoryTicks,
				};

			if (categoryLabels) {
				const result = categoryTicks
					? categoryTicks.filter((v) => v >= axis.min && v <= axis.max)
					: calcCategoricalTicks(axis.min, axis.max, categoryLabels.length);
				return {
					id: axis.id,
					min: axis.min,
					max: axis.max,
					showGrid: axis.showGrid,
					ticks: {
						result,
						step: 1,
						precision: 0,
						isXDate: false as const,
					},
					title,
					color,
					categoryLabels,
					categoryTicks,
				};
			}

			if (!isDate) {
				const step = calcNumericStep(
					r,
					Math.max(2, Math.floor(chartWidth / 60)),
				);
				if (step <= 0)
					return {
						id: axis.id,
						min: axis.min,
						max: axis.max,
						showGrid: axis.showGrid,
						ticks: {
							result: [],
							step: 1,
							precision: 0,
							isXDate: false as const,
						},
						title,
						color,
					};
				const precision = calcNumericPrecision(step);
				return {
					id: axis.id,
					min: axis.min,
					max: axis.max,
					showGrid: axis.showGrid,
					ticks: {
						result: calcNumericTicks(axis.min, axis.max, step),
						step,
						precision,
						isXDate: false as const,
					},
					title,
					color,
				};
			} else {
				const ts = getTimeStep(r, Math.max(2, Math.floor(chartWidth / 80)));
				return {
					id: axis.id,
					min: axis.min,
					max: axis.max,
					showGrid: axis.showGrid,
					ticks: {
						result: generateTimeTicks(axis.min, axis.max, ts),
						isXDate: true as const,
						secondaryLabels: generateSecondaryLabels(axis.min, axis.max, ts),
					},
					title,
					color,
				};
			}
		});
	}, [
		activeXAxesUsed,
		chartWidth,
		activeDsIdsSet,
		datasets,
		themeColors.labelColor,
		xAxisCategoryLabels,
	]);

	// 8. Render
	return (
		<>
			<main
				className="plot-area"
				ref={containerRef}
				onMouseDown={(e) => {
					if (datasets.length > 0) handleMouseDown(e, "all");
				}}
				onTouchStart={(e) => {
					if (datasets.length > 0) handleTouchStart(e, "all");
				}}
				onWheel={(e) => {
					if (datasets.length > 0) handleWheel(e, "all");
				}}
				onDoubleClick={() => {
					if (datasets.length > 0 && typeof handleAutoScaleX === "function") {
						handleAutoScaleX();
						if (Array.isArray(activeYAxes)) {
							activeYAxes.forEach((a) => {
								handleAutoScaleY(a.id);
							});
						}
					}
				}}
				onDragOver={(e) => {
					e.preventDefault();
					setIsDragOver(true);
				}}
				onDragLeave={() => setIsDragOver(false)}
				onDrop={(e) => {
					e.preventDefault();
					setIsDragOver(false);
					const file = e.dataTransfer.files[0];
					if (file) importFile(file);
				}}
				style={{
					position: "relative",
					cursor: panTarget
						? "grabbing"
						: isZooming || isCtrlPressed
							? "zoom-in"
							: isShiftPressed
								? "ew-resize"
								: "crosshair",
					backgroundColor: themeColors.plotBg,
					overflow: "hidden",
					touchAction: "none",
					userSelect: "none",
				}}
			>
				{isDragOver && (
					<div
						style={{
							position: "absolute",
							inset: 0,
							zIndex: 100,
							display: "flex",
							alignItems: "center",
							justifyContent: "center",
							backgroundColor: "rgba(0,0,0,0.35)",
							pointerEvents: "none",
						}}
					>
						<span
							style={{
								color: "#fff",
								fontSize: "1.4rem",
								fontWeight: 600,
								letterSpacing: "0.02em",
							}}
						>
							Drop to import
						</span>
					</div>
				)}
				{datasets.length === 0 && (
					<EmptyState width={width} height={height} padding={padding} />
				)}
				<div className="chart-webgl-layer">
					<ErrorBoundary level="component">
						<WebGLRenderer
							ref={webglRef}
							key={themeName}
							datasets={datasets}
							series={series}
							xAxes={xAxes}
							yAxes={yAxes}
							width={width}
							height={height}
							padding={padding}
							isInteracting={isInteracting}
							highlightedSeriesId={highlightedSeriesId}
							plotBg={themeColors.plotBg}
						/>
					</ErrorBoundary>
				</div>
				<AxesLayer
					ref={axesLayerRef}
					xAxes={xAxesLayout}
					yAxes={activeYAxesLayout}
					width={width}
					height={height}
					padding={padding}
					series={series}
					datasets={datasets}
					axisLayout={axisLayout}
					xAxesMetrics={xAxesMetrics}
					axisColor={themeColors.axisColor}
					zeroLineColor={themeColors.zeroLineColor}
					gridColor={themeColors.gridColor}
					plotBg={themeColors.plotBg}
					labelColor={themeColors.labelColor}
					secLabelBg={themeColors.secLabelBg}
					leftOffsets={leftOffsets}
					rightOffsets={rightOffsets}
					fontFamily={themeColors.fontFamily}
					isInteracting={isInteracting}
				/>
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
									handleWheel(e, { xAxisId: m.id });
								}}
								onMouseDown={(e) => {
									e.stopPropagation();
									handleMouseDown(e, { xAxisId: m.id });
								}}
								onTouchStart={(e) => {
									e.stopPropagation();
									handleTouchStart(e, { xAxisId: m.id });
								}}
								onDoubleClick={(e) => {
									e.stopPropagation();
									const rect = e.currentTarget.getBoundingClientRect();
									const yInside = e.clientY - rect.top;
									// Check if double click is in the title area (roughly bottom 30px)
									if (yInside >= m.titleBottom - 30) {
										setEditingXAxisId(m.id);
									} else {
										handleAutoScaleX(m.id);
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
				{activeYAxes.map((a) => {
					const isL = a.position === "left",
						am = axisLayout[a.id] || { total: 40 };
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
								handleWheel(e, { yAxisId: a.id });
							}}
							onMouseDown={(e) => {
								e.stopPropagation();
								handleMouseDown(e, { yAxisId: a.id });
							}}
							onTouchStart={(e) => {
								e.stopPropagation();
								handleTouchStart(e, { yAxisId: a.id });
							}}
							onDoubleClick={(e) => {
								e.stopPropagation();
								const rect = containerRef.current?.getBoundingClientRect();
								handleAutoScaleY(a.id, rect ? e.clientY - rect.top : undefined);
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
				{datasets.length > 0 && (
					<>
						<button
							onClick={handleStackedFit}
							type="button"
							title="Stacked Fit — each Y-axis fitted to its own slice"
							style={{
								position: "absolute",
								bottom: padding.bottom - 29,
								left: padding.left - 29 - 28,
								zIndex: 100,
								backgroundColor: "transparent",
								border: "none",
								borderRadius: "4px",
								color: themeColors.textMuted,
								padding: "4px",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								opacity: 0.6,
								transition: "opacity 0.2s",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
							onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
						>
							<ChartGantt size={18} />
						</button>
						<button
							onClick={handleFitAll}
							type="button"
							title="Fit All"
							style={{
								position: "absolute",
								bottom: padding.bottom - 29,
								left: padding.left - 29,
								zIndex: 100,
								backgroundColor: "transparent",
								border: "none",
								borderRadius: "4px",
								color: themeColors.textMuted,
								padding: "4px",
								cursor: "pointer",
								display: "flex",
								alignItems: "center",
								justifyContent: "center",
								opacity: 0.6,
								transition: "opacity 0.2s",
							}}
							onMouseEnter={(e) => (e.currentTarget.style.opacity = "1")}
							onMouseLeave={(e) => (e.currentTarget.style.opacity = "0.6")}
						>
							<Expand size={18} />
						</button>
					</>
				)}
				{crosshairVisible && (
					<Crosshair
						containerRef={containerRef}
						padding={padding}
						width={width}
						height={height}
						isPanning={isInteracting}
						xAxes={xAxes}
						yAxes={activeYAxes}
						datasets={datasets}
						series={series}
						tooltipColor={themeColors.tooltipColor}
						snapLineColor={themeColors.snapLineColor}
						tooltipDividerColor={themeColors.tooltipDividerColor}
						tooltipSubColor={themeColors.tooltipSubColor}
						plotBg={themeColors.plotBg}
					/>
				)}
				{isZooming && (
					<svg
						ref={zoomBoxSvgRef}
						width="100%"
						height="100%"
						className="chart-abs-fill"
						style={{ zIndex: 30 }}
					>
						<title>Zoom Selection Box</title>
						<rect
							ref={zoomBoxRectRef}
							x={0}
							y={0}
							width={0}
							height={0}
							fill="rgba(0, 123, 255, 0.2)"
							stroke="#007bff"
							strokeWidth="1"
						/>
					</svg>
				)}
				{series.length > 0 && legendVisible && (
					<ChartLegend
						series={series}
						padding={padding}
						onToggleVisibility={(id, hidden) =>
							useGraphStore.getState().updateSeriesVisibility(id, hidden)
						}
						onHighlight={(id) =>
							useGraphStore.getState().setHighlightedSeries(id)
						}
					/>
				)}
			</main>
			{pendingFile && (
				<ImportSettingsDialog
					fileName={pendingFile.file.name}
					fileContent={pendingFile.preview}
					fileType={pendingFile.type}
					sheets={pendingFile.sheets}
					selectedSheet={pendingFile.selectedSheet}
					onSheetChange={changeSheet}
					onConfirm={confirmImport}
					onCancel={cancelImport}
				/>
			)}
		</>
	);
};

export default ChartContainer;
