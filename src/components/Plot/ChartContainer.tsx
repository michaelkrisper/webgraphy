// src/components/Plot/ChartContainer.tsx

import { ChartGantt, Expand } from "lucide-react";
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
import { getColumnIndex } from "../../utils/columns";
import {
	AXIS_EPSILON,
	type AxesFrame,
	DEFAULT_X_AXIS_ID,
	calcNumericPrecision,
	calcNumericStep,
	calcYAxisTicks,
	formatAxisLabel,
	getAxisById,
	syncAxesWithTargets,
} from "../../utils/axisCalculations";
import { applyKeyboardPan, applyKeyboardZoom } from "../../utils/keyboard";
import ErrorBoundary from "../ErrorBoundary";
import { ImportSettingsDialog } from "../Layout/ImportSettingsDialog";
import { AxesLayer, type AxesLayerHandle } from "./AxesLayer";
import { computeAxisOffsets, sumGutterTotals } from "./axisGutters";
import { buildXAxisLayout } from "./buildXAxisLayout";
import { ChartLegend } from "./ChartLegend";
import { Crosshair } from "./Crosshair";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";
import { EmptyState } from "./EmptyState";
import { WebGLRenderer, type WebGLRendererHandle } from "./WebGLRenderer";

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

function updateOverlayAxes(
	scratch: {
		xAxes: OverlayXEntry[];
		yAxes: OverlayYEntry[];
		estVertexCount?: number;
	},
	xLayout: XAxisLayout[],
	yLayout: YAxisLayout[],
) {
	let est = 12 + 12 + 32;

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

		est += (src.length + 1) * 4 + 6;
		if (i === 0 && a.showGrid) {
			est += src.length * 4;
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

		est += (a.ticks.length + 1) * 4 + 6;
		if (a.showGrid) {
			est += a.ticks.length * 4;
		}
	}

	scratch.estVertexCount = est;
}

function syncStoreUpdates(
	state: ReturnType<typeof useGraphStore.getState>,
	xUpdates: Record<string, { min: number; max: number }>,
	yUpdates: Record<string, { min: number; max: number }>,
) {
	const filteredXUpdates: Record<string, { min: number; max: number }> = {};
	const filteredYUpdates: Record<string, { min: number; max: number }> = {};
	let hasX = false;
	let hasY = false;

	const xAxisMap = new Map(state.xAxes.map((a) => [a.id, a]));
	for (const [id, upd] of Object.entries(xUpdates)) {
		const axis = xAxisMap.get(id);
		if (
			!axis ||
			Math.abs(axis.min - upd.min) > AXIS_EPSILON ||
			Math.abs(axis.max - upd.max) > AXIS_EPSILON
		) {
			filteredXUpdates[id] = upd;
			hasX = true;
		}
	}

	const yAxisMap = new Map(state.yAxes.map((a) => [a.id, a]));
	for (const [id, upd] of Object.entries(yUpdates)) {
		const axis = yAxisMap.get(id);
		if (
			!axis ||
			Math.abs(axis.min - upd.min) > AXIS_EPSILON ||
			Math.abs(axis.max - upd.max) > AXIS_EPSILON
		) {
			filteredYUpdates[id] = upd;
			hasY = true;
		}
	}

	if (hasX || hasY) {
		state.batchUpdateAxes(filteredXUpdates, filteredYUpdates);
	}
}

type DatasetsByAxisId = Record<string, Dataset[]>;

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };

/** Cap on x-values sampled when deriving categorical labels for a forced axis. */
const MAX_DERIVED_CATEGORY_LABELS = 1000;

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

export default function ChartContainer() {
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
		estVertexCount?: number;
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

	const activeYAxes = useMemo(() => {
		return yAxes.filter((a) => usedYAxisIdsSet.has(a.id));
	}, [yAxes, usedYAxisIdsSet]);

	// Per-axis categorical labels: only when ALL series on the axis bind to a column
	// that has categoryLabels, and they all share the same label set.
	const yAxisCategoryLabels = useMemo(() => {
		const dsById = new Map(datasets.map((d) => [d.id, d]));

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
				const colIdx = getColumnIndex(ds, s.yColumn);
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
			const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
			const arr = dssByX.get(xId) || [];
			arr.push(d);
			dssByX.set(xId, arr);
		});
		dssByX.forEach((dss, axisId) => {
			const cfg = getAxisById(xAxes, axisId);
			const forced = cfg?.xMode === "categorical";
			let labels: string[] | undefined;
			let mismatch = false;
			for (const d of dss) {
				const colIdx = getColumnIndex(d, d.xAxisColumn);
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
				outer: for (const d of dss) {
					const colIdx = getColumnIndex(d, d.xAxisColumn);
					const col = colIdx >= 0 ? d.data[colIdx] : undefined;
					if (!col) continue;
					const ref = col.refPoint;
					const arr = col.data;
					for (let i = 0; i < arr.length; i++) {
						uniq.add(arr[i] + ref);
						if (uniq.size > MAX_DERIVED_CATEGORY_LABELS) break outer;
					}
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
				const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
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

	const { leftAxes, rightAxes } = useMemo(() => {
		const left: typeof activeYAxes = [];
		const right: typeof activeYAxes = [];
		for (const a of activeYAxes) {
			if (a.position === "left") {
				left.push(a);
			} else {
				right.push(a);
			}
		}
		return { leftAxes: left, rightAxes: right };
	}, [activeYAxes]);

	const { leftOffsets, rightOffsets } = useMemo(
		() => ({
			leftOffsets: computeAxisOffsets(leftAxes, axisLayout),
			rightOffsets: computeAxisOffsets(rightAxes, axisLayout),
		}),
		[leftAxes, rightAxes, axisLayout],
	);

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
		const leftSum = sumGutterTotals(leftAxes, axisLayout);
		const rightSum = sumGutterTotals(rightAxes, axisLayout);
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
	const liveAxesScratchRef = useRef<{
		liveX: XAxisConfig[];
		liveY: YAxisConfig[];
	}>({
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
					const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
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

					const catInfo = xAxisCategoryLabels.get(axis.id);
					const dss = dsByX[axis.id] || [];
					const layout = buildXAxisLayout(
						axis,
						chartWidth,
						themeColors.labelColor,
						catInfo?.labels,
						catInfo?.ticks,
						dss,
					);
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

	const syncViewportRef = useRef<
		(force?: boolean, immediate?: boolean) => void
	>(() => {});
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
			syncViewport: (force, immediate) =>
				syncViewportRef.current(force, immediate),
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
		xAxes,
		yAxes,
		targetXAxes,
		targetYs,
		syncViewport: (force, immediate) =>
			syncViewportRef.current(force, immediate),
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
		(forceStoreUpdate = false, immediate = false) => {
			if (rafId.current && !forceStoreUpdate && !immediate) return;

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

				if (hasUpdates || !overlayInitRef.current || forceStoreUpdate) {
					overlayInitRef.current = true;
					const { liveX, liveY } = buildLiveAxes(xUpdates, yUpdates);

					const isInteractingNow =
						panStateRef.current.active || isInteractingRef.current;
					const xLayout = computeXAxesLayout(liveX);
					const yLayout = computeYAxesLayout(liveY);

					const scratch = overlayScratchRef.current;
					updateOverlayAxes(scratch, xLayout, yLayout);
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
						syncStoreUpdates(state, xUpdates, yUpdates);
					}
				}
				if (kbZoom || kbPan) {
					syncViewportRef.current(false);
				}
			};

			if (forceStoreUpdate || immediate) {
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

	// Latest-callback ref: keep syncViewportRef pointing at the current
	// syncViewport so the stable imperative handle and RAF closures call the
	// up-to-date version. The write is intentional during render.
	// eslint-disable-next-line react-hooks/refs
	syncViewportRef.current = syncViewport;

	// 6. Effects
	// Force redraw on ANY change (ranges, names, config, sidebar, resize, theme).
	// We update targets first to prevent syncAxesWithTargets from seeing "new" world
	// changes if the update came from the store (e.g. undo/redo or sidebar).
	useEffect(() => {
		if (isLoaded) {
			xAxes.forEach((axis) => {
				targetXAxes.current[axis.id] = { min: axis.min, max: axis.max };
			});
			yAxes.forEach((axis) => {
				targetYs.current[axis.id] = { min: axis.min, max: axis.max };
			});

			overlayInitRef.current = false;
			// Use force=false to schedule via rAF, breaking synchronous render loops.
			// Redraw is still forced because we set overlayInitRef.current = false above.
			syncViewportRef.current(false);
		}
	}, [isLoaded, xAxes, yAxes, series, datasets, themeColors, width, height]);

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
				const xId = d.xAxisId || DEFAULT_X_AXIS_ID;
				if (!dsByX[xId]) dsByX[xId] = [];
				dsByX[xId].push(d);
			}
		});

		return activeXAxesUsed.map((axis) => {
			const catInfo = xAxisCategoryLabels.get(axis.id);
			const dss = dsByX[axis.id] || [];
			return buildXAxisLayout(
				axis,
				chartWidth,
				themeColors.labelColor,
				catInfo?.labels,
				catInfo?.ticks,
				dss,
			);
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
}
