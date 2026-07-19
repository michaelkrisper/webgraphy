// src/components/Plot/ChartContainer.tsx

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useAutoScale } from "../../hooks/useAutoScale";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useDataImport } from "../../hooks/useDataImport";
import { usePanZoom } from "../../hooks/usePanZoom";
import { useTheme } from "../../hooks/useTheme";
import type {
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { THEMES } from "../../themes";
import {
	type AxesFrame,
	DEFAULT_X_AXIS_ID,
	easeAxisUpdates,
	syncAxesWithTargets,
	ZOOM_EASE_FACTOR,
} from "../../utils/axisCalculations";
import { applyKeyboardPan, applyKeyboardZoom } from "../../utils/keyboard";
import ErrorBoundary from "../ErrorBoundary";
import { ImportSettingsDialog } from "../Layout/ImportSettingsDialog";
import {
	buildLabels,
	createLabelStringCache,
	type LabelBuildContext,
} from "./buildLabels";
import { ChartActionButtons } from "./ChartActionButtons";
import {
	XAxisInteractionZones,
	YAxisInteractionZones,
} from "./AxisInteractionZones";
import {
	computeAxisOffsets,
	measureYAxisGutter,
	sumGutterTotals,
} from "./axisGutters";
import {
	type LiveAxesScratch,
	applyAxisUpdates,
	createLiveAxesScratch,
	resetAxisTargets,
} from "./buildLiveAxes";
import { ChartLegend } from "./ChartLegend";
import { PlotDragOverlay, ZoomBoxOverlay } from "./PlotOverlays";
import {
	type AxesLayoutCache,
	buildXAxisLayoutFor,
	computeXAxesLayoutCached,
	computeYAxesLayoutCached,
	createAxesLayoutCache,
	groupActiveDatasetsByXAxis,
} from "./computeAxesLayout";
import {
	computeXAxisCategoryLabels,
	computeYAxisCategoryLabels,
} from "./categoryLabels";
import { Crosshair } from "./Crosshair";
import type { XAxisLayout, XAxisMetrics, YAxisLayout } from "./chartTypes";
import { EmptyState } from "./EmptyState";
import { syncStoreUpdates } from "./syncStoreUpdates";
import {
	applyOverlayContext,
	type OverlayXEntry,
	type OverlayYEntry,
	updateOverlayAxes,
} from "./overlayAxes";
import { WebGLRenderer, type WebGLRendererHandle } from "./WebGLRenderer";
import { computeXAxesMetrics } from "./xAxisMetrics";

const BASE_PADDING_DESKTOP = { top: 20, right: 20, bottom: 60, left: 20 };

export default function ChartContainer() {
	// 1. Core Refs and State
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const { importFile, confirmImport, cancelImport, changeSheet, pendingFile } =
		useDataImport();
	const { width, height } = useContainerSize(containerRef, 800, 600);
	const [editingXAxisId, setEditingXAxisId] = useState<string | null>(null);

	const targetXAxes = useRef<Record<string, { min: number; max: number }>>({});
	const targetYs = useRef<Record<string, { min: number; max: number }>>({});
	// Wheel-zoom easing: last-rendered ranges plus the flag armed by handleWheel.
	const smoothZoomRef = useRef(false);
	const displayedXAxesRef = useRef<Record<string, { min: number; max: number }>>(
		{},
	);
	const displayedYsRef = useRef<Record<string, { min: number; max: number }>>(
		{},
	);
	const webglRef = useRef<WebGLRendererHandle | null>(null);
	const labelStringCacheRef = useRef(createLabelStringCache());
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

	const yAxisCategoryLabels = useMemo(
		() => computeYAxisCategoryLabels(series, datasets),
		[series, datasets],
	);

	const xAxisCategoryLabels = useMemo(
		() => computeXAxisCategoryLabels(activeDsIdsSet, datasets, xAxes),
		[activeDsIdsSet, datasets, xAxes],
	);

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
		for (const axis of activeYAxes) {
			layout[axis.id] = measureYAxisGutter(
				axis,
				height,
				yAxisCategoryLabels.get(axis.id),
			);
		}
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

	const xAxesMetrics = useMemo(
		() => computeXAxesMetrics(activeXAxesUsed),
		[activeXAxesUsed],
	);

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
	const liveAxesScratchRef = useRef<LiveAxesScratch<XAxisConfig, YAxisConfig>>(
		createLiveAxesScratch(),
	);
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
			return applyAxisUpdates(
				liveAxesScratchRef.current,
				state.xAxes,
				state.yAxes,
				xUpdates,
				yUpdates,
			);
		},
		[],
	);

	const xLayoutCacheRef = useRef<AxesLayoutCache<XAxisLayout>>(
		createAxesLayoutCache(),
	);
	const computeXAxesLayout = useCallback(
		(liveXAxes: XAxisConfig[]): XAxisLayout[] =>
			computeXAxesLayoutCached({
				liveXAxes,
				activeXAxesUsed,
				datasets,
				activeDsIdsSet,
				chartWidth,
				labelColor: themeColors.labelColor,
				xAxisCategoryLabels,
				cache: xLayoutCacheRef.current,
			}),
		[
			activeDsIdsSet,
			datasets,
			themeColors.labelColor,
			chartWidth,
			activeXAxesUsed,
			xAxisCategoryLabels,
		],
	);

	const yLayoutCacheRef = useRef<AxesLayoutCache<YAxisLayout>>(
		createAxesLayoutCache(),
	);
	const computeYAxesLayout = useCallback(
		(liveYAxes: YAxisConfig[]): YAxisLayout[] =>
			computeYAxesLayoutCached({
				liveYAxes,
				usedYAxisIdsSet,
				chartHeight,
				yAxisCategoryLabels,
				cache: yLayoutCacheRef.current,
			}),
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
		smoothZoomRef,
		onPanEnd: useCallback(() => {
			panStateRef.current.active = false;
			syncViewportRef.current(true);
		}, []),
	});

	// Series grouped per axis for the WebGL label pass (axis titles).
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

				// Wheel zoom eases toward its target over a few frames; everything
				// else (pan, keyboard, forced syncs) snaps via factor 1, which also
				// keeps the displayed-range records current for the next zoom.
				const easeFactor =
					smoothZoomRef.current && !forceStoreUpdate ? ZOOM_EASE_FACTOR : 1;
				const xEased = easeAxisUpdates(
					displayedXAxesRef.current,
					xUpdates,
					state.xAxes,
					easeFactor,
				);
				const yEased = easeAxisUpdates(
					displayedYsRef.current,
					yUpdates,
					state.yAxes,
					easeFactor,
				);
				const zoomAnimating = !(xEased && yEased);
				if (!zoomAnimating) smoothZoomRef.current = false;

				if (hasUpdates || !overlayInitRef.current || forceStoreUpdate) {
					overlayInitRef.current = true;
					const { liveX, liveY } = buildLiveAxes(xUpdates, yUpdates);

					const isInteractingNow =
						panStateRef.current.active || isInteractingRef.current;

					// Shared-viewport backend: the worker derives tick layout,
					// overlay geometry, and labels itself from the SharedArrayBuffer
					// ranges — the main thread's per-frame work ends here.
					if (webglRef.current?.sceneShared()) {
						webglRef.current.redraw(liveX, liveY);
						if (forceStoreUpdate || !isInteractingNow) {
							syncStoreUpdates(state, xUpdates, yUpdates);
						}
						if (kbZoom || kbPan || zoomAnimating) {
							syncViewportRef.current(false);
						}
						return;
					}

					const xLayout = computeXAxesLayout(liveX);
					const yLayout = computeYAxesLayout(liveY);

					const scratch = overlayScratchRef.current;
					updateOverlayAxes(scratch, xLayout, yLayout);
					applyOverlayContext(scratch, {
						xAxesMetrics,
						axisLayout,
						leftOffsets,
						rightOffsets,
						axisColor: themeColors.axisColor,
						zeroLineColor: themeColors.zeroLineColor,
						gridColor: themeColors.gridColor,
						plotBg: themeColors.plotBg,
					});
					const labelCtx: LabelBuildContext = {
						width,
						height,
						padding,
						axisLayout,
						xAxesMetrics,
						labelColor: themeColors.labelColor,
						secLabelBg: themeColors.secLabelBg,
						fontFamily: themeColors.fontFamily,
						leftOffsets,
						rightOffsets,
						seriesByXAxisId,
						seriesByYAxisId,
					};
					webglRef.current?.setOverlay(scratch);
					webglRef.current?.setLabels(
						buildLabels(
							xLayout,
							yLayout,
							labelCtx,
							labelStringCacheRef.current,
						),
					);
					webglRef.current?.redraw(liveX, liveY);

					// Only sync back to store if not currently interacting (panning/zooming)
					if (forceStoreUpdate || !isInteractingNow) {
						syncStoreUpdates(state, xUpdates, yUpdates);
					}
				}
				if (kbZoom || kbPan || zoomAnimating) {
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
			width,
			height,
			padding,
			seriesByXAxisId,
			seriesByYAxisId,
		],
	);

	// Latest-callback ref: keep syncViewportRef pointing at the current
	// syncViewport so the stable imperative handle and RAF closures call the
	// up-to-date version. We use useLayoutEffect to safely update the ref.
	useLayoutEffect(() => {
		syncViewportRef.current = syncViewport;
	}, [syncViewport]);

	// 6. Effects
	// Keep the render worker's scene context current (shared-viewport mode
	// only): everything the worker needs besides the per-frame axis ranges.
	useEffect(() => {
		const handle = webglRef.current;
		if (!handle?.sceneShared()) return;
		const dsByX = groupActiveDatasetsByXAxis(datasets, activeDsIdsSet);
		handle.setSceneContext({
			width,
			height,
			padding,
			axisLayout,
			xAxesMetrics,
			leftOffsets,
			rightOffsets,
			axisColor: themeColors.axisColor,
			zeroLineColor: themeColors.zeroLineColor,
			gridColor: themeColors.gridColor,
			plotBg: themeColors.plotBg,
			labelColor: themeColors.labelColor,
			secLabelBg: themeColors.secLabelBg,
			fontFamily: themeColors.fontFamily,
			seriesByXAxisId,
			seriesByYAxisId,
			xAxesMeta: activeXAxesUsed.map((a) => {
				const cat = xAxisCategoryLabels.get(a.id);
				return {
					id: a.id,
					name: a.name,
					showGrid: a.showGrid,
					xMode: a.xMode,
					columnNames: (dsByX[a.id] || []).map((d) => d.xAxisColumn),
					categoryLabels: cat?.labels,
					categoryTicks: cat?.ticks,
				};
			}),
			yAxesMeta: activeYAxes.map((a) => ({
				id: a.id,
				name: a.name,
				color: a.color,
				position: a.position,
				showGrid: a.showGrid,
				categoryLabels: yAxisCategoryLabels.get(a.id),
			})),
		});
	}, [
		datasets,
		activeDsIdsSet,
		activeXAxesUsed,
		activeYAxes,
		xAxisCategoryLabels,
		yAxisCategoryLabels,
		width,
		height,
		padding,
		axisLayout,
		xAxesMetrics,
		leftOffsets,
		rightOffsets,
		themeColors,
		seriesByXAxisId,
		seriesByYAxisId,
	]);

	// Force redraw on ANY change (ranges, names, config, sidebar, resize, theme).
	// We update targets first to prevent syncAxesWithTargets from seeing "new" world
	// changes if the update came from the store (e.g. undo/redo or sidebar).
	useEffect(() => {
		if (!isLoaded) return;
		resetAxisTargets(xAxes, yAxes, targetXAxes.current, targetYs.current);
		overlayInitRef.current = false;
		// Use force=false to schedule via rAF, breaking synchronous render loops.
		// Redraw is still forced because we set overlayInitRef.current = false above.
		syncViewportRef.current(false);
	}, [isLoaded, xAxes, yAxes, series, datasets, themeColors, width, height]);

	// 7. Memos for static rendering (JSX)
	const xAxesLayout = useMemo(() => {
		const dsByX = groupActiveDatasetsByXAxis(datasets, activeDsIdsSet);
		return activeXAxesUsed.map((axis) =>
			buildXAxisLayoutFor(
				axis,
				chartWidth,
				themeColors.labelColor,
				xAxisCategoryLabels,
				dsByX,
			),
		);
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
				<PlotDragOverlay visible={isDragOver} />
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
				<XAxisInteractionZones
					xAxesMetrics={xAxesMetrics}
					xAxesLayout={xAxesLayout}
					padding={padding}
					editingXAxisId={editingXAxisId}
					setEditingXAxisId={setEditingXAxisId}
					themeColors={themeColors}
					onWheel={handleWheel}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
					onAutoScaleX={handleAutoScaleX}
				/>
				<YAxisInteractionZones
					axes={activeYAxes}
					axisLayout={axisLayout}
					leftOffsets={leftOffsets}
					rightOffsets={rightOffsets}
					padding={padding}
					width={width}
					containerRef={containerRef}
					onWheel={handleWheel}
					onMouseDown={handleMouseDown}
					onTouchStart={handleTouchStart}
					onAutoScaleY={handleAutoScaleY}
				/>
				{datasets.length > 0 && (
					<ChartActionButtons
						padding={padding}
						themeColors={themeColors}
						onStackedFit={handleStackedFit}
						onFitAll={handleFitAll}
					/>
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
				<ZoomBoxOverlay
					visible={isZooming}
					svgRef={zoomBoxSvgRef}
					rectRef={zoomBoxRectRef}
				/>
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
