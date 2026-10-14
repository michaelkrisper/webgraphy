// src/components/Plot/ChartContainer.tsx

import {
	Suspense,
	useCallback,
	useEffect,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import { useAutoScale } from "../../hooks/useAutoScale";
import { useContainerSize } from "../../hooks/useContainerSize";
import { useDataImport } from "../../hooks/useDataImport";
import { useDevicePixelSize } from "../../hooks/useDevicePixelSize";
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
	easeAxisUpdates,
	syncAxesWithTargets,
	ZOOM_EASE_FACTOR,
} from "../../utils/axisCalculations";
import {
	type AxisStep,
	applyKeyboardPan,
	applyKeyboardZoom,
	releaseNavigationKeys,
	stepAxisTarget,
} from "../../utils/keyboard";
import { prefersReducedMotion } from "../../utils/reducedMotion";
import ErrorBoundary from "../ErrorBoundary";
import { ImportSettingsDialogLazy } from "../Layout/importSettingsDialogLazy";
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
import { useChartLayout } from "./useChartLayout";

export default function ChartContainer() {
	// 1. Core Refs and State
	const containerRef = useRef<HTMLDivElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);
	const {
		importFiles,
		confirmImport,
		cancelImport,
		changeSheet,
		pendingFile,
		isImporting,
	} = useDataImport();
	const { width, height } = useContainerSize(containerRef, 800, 600);
	// The WebGL layer fills the container's content box, so its device-pixel
	// size is the canvas backing-store size.
	const { dpr, pixelWidth, pixelHeight } = useDevicePixelSize(containerRef);
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
	const {
		activeDsIdsSet,
		usedYAxisIdsSet,
		activeYAxes,
		yAxisCategoryLabels,
		xAxisCategoryLabels,
		activeXAxesUsed,
		axisLayout,
		leftAxes,
		rightAxes,
		leftOffsets,
		rightOffsets,
		xAxesMetrics,
		padding,
		chartWidth,
		chartHeight,
	} = useChartLayout(series, datasets, xAxes, yAxes, width, height);

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

	const syncViewportRef = useRef<(force?: boolean, immediate?: boolean) => void>(
		() => {},
	);
	const rafId = useRef<number | null>(null);
	const overlayInitRef = useRef(false);
	// Axis arrays the last frame drew and then wrote to the store. Their echo
	// through the redraw effect below would draw the same frame again.
	const viewportEchoRef = useRef<{
		xAxes: XAxisConfig[];
		yAxes: YAxisConfig[];
	} | null>(null);
	const sceneDepsRef = useRef<readonly unknown[] | null>(null);

	// 5. Hooks
	const { handleAutoScaleY, handleAutoScaleX, handleStackedFit } = useAutoScale({
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
		syncViewport: (force, immediate) => syncViewportRef.current(force, immediate),
	});

	const handleFitAll = useCallback(() => {
		handleAutoScaleX();
		activeYAxes.forEach((ax) => {
			handleAutoScaleY(ax.id);
		});
	}, [handleAutoScaleX, handleAutoScaleY, activeYAxes]);

	// Keyboard steps on a focused axis zone go through the same target refs
	// and rAF sync as every other pan/zoom.
	const handleXAxisStep = useCallback((id: string, step: AxisStep) => {
		const axis = useGraphStore.getState().xAxes.find((a) => a.id === id);
		if (!axis) return;
		stepAxisTarget(targetXAxes.current, axis, step);
		syncViewportRef.current();
	}, []);
	const handleYAxisStep = useCallback((id: string, step: AxisStep) => {
		const axis = useGraphStore.getState().yAxes.find((a) => a.id === id);
		if (!axis) return;
		stepAxisTarget(targetYs.current, axis, step);
		syncViewportRef.current();
	}, []);

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
		syncViewport: (force, immediate) => syncViewportRef.current(force, immediate),
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
		const dsXAxis = new Map();
		for (let i = 0; i < datasets.length; i++) {
			dsXAxis.set(datasets[i].id, datasets[i].xAxisId);
		}
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

	// Same text the WebGL label pass draws as each y-axis title.
	const yAxisTitles = useMemo(() => {
		const titles: Record<string, string> = {};
		for (const id in seriesByYAxisId) {
			titles[id] = seriesByYAxisId[id].map((s) => s.name || s.yColumn).join(" / ");
		}
		return titles;
	}, [seriesByYAxisId]);

	const isInteractingRef = useRef(false);
	useEffect(() => {
		isInteractingRef.current = isInteracting;
	}, [isInteracting]);

	const commitViewport = useCallback(
		(
			state: ReturnType<typeof useGraphStore.getState>,
			xUpdates: AxesFrame["xUpdates"],
			yUpdates: AxesFrame["yUpdates"],
		) => {
			syncStoreUpdates(state, xUpdates, yUpdates);
			const next = useGraphStore.getState();
			if (next.xAxes !== state.xAxes || next.yAxes !== state.yAxes) {
				viewportEchoRef.current = { xAxes: next.xAxes, yAxes: next.yAxes };
			}
		},
		[],
	);

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
				const reduceMotion = prefersReducedMotion();
				if (reduceMotion && (kbZoom || kbPan)) {
					releaseNavigationKeys(pressedKeysRef.current);
				}

				const { xUpdates, yUpdates, hasUpdates }: AxesFrame = syncAxesWithTargets(
					state,
					targetXAxes.current,
					targetYs.current,
					syncScratchRef.current,
				);

				// Wheel zoom eases toward its target over a few frames; everything
				// else (pan, keyboard, forced syncs) snaps via factor 1, which also
				// keeps the displayed-range records current for the next zoom.
				// Reduced motion snaps the wheel zoom too.
				const easeFactor =
					smoothZoomRef.current && !forceStoreUpdate && !reduceMotion
						? ZOOM_EASE_FACTOR
						: 1;
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

					// Worker backend with a scene context: it derives tick layout,
					// overlay geometry, and labels itself from the axis ranges —
					// the main thread's per-frame work ends here.
					if (webglRef.current?.sceneShared()) {
						webglRef.current.redraw(liveX, liveY);
						if (forceStoreUpdate || !isInteractingNow) {
							commitViewport(state, xUpdates, yUpdates);
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
						buildLabels(xLayout, yLayout, labelCtx, labelStringCacheRef.current),
					);
					webglRef.current?.redraw(liveX, liveY);

					// Only sync back to store if not currently interacting (panning/zooming)
					if (forceStoreUpdate || !isInteractingNow) {
						commitViewport(state, xUpdates, yUpdates);
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
			commitViewport,
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
	// Keep the render worker's scene context current: everything it needs
	// besides the per-frame axis ranges. Sent unconditionally — it is what
	// switches the worker backend to building the scene itself, and it is a
	// no-op on the main-thread backend.
	useEffect(() => {
		const handle = webglRef.current;
		if (!handle) return;
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
				const dses = dsByX[a.id];
				const len = dses ? dses.length : 0;
				const columnNames = new Array(len);
				for (let i = 0; i < len; i++) {
					columnNames[i] = dses[i].xAxisColumn;
				}
				return {
					id: a.id,
					name: a.name,
					showGrid: a.showGrid,
					xMode: a.xMode,
					columnNames,
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
	// DPR changes count as resizes: the canvas is resized (which clears it) and
	// the main-thread backend's overlay geometry is in device pixels.
	// We update targets first to prevent syncAxesWithTargets from seeing "new" world
	// changes if the update came from the store (e.g. undo/redo or sidebar).
	useEffect(() => {
		const sceneDeps = [
			isLoaded,
			series,
			datasets,
			themeColors,
			width,
			height,
			dpr,
			pixelWidth,
			pixelHeight,
		];
		const prevSceneDeps = sceneDepsRef.current;
		sceneDepsRef.current = sceneDeps;
		const echo = viewportEchoRef.current;
		viewportEchoRef.current = null;
		if (!isLoaded) return;
		// Only the ranges the last frame drew and synced came back: that frame
		// is current. Without this, settling a pan/zoom drew two full frames.
		if (
			echo?.xAxes === xAxes &&
			echo.yAxes === yAxes &&
			prevSceneDeps?.every((d, i) => d === sceneDeps[i])
		) {
			return;
		}
		resetAxisTargets(xAxes, yAxes, targetXAxes.current, targetYs.current);
		overlayInitRef.current = false;
		// Use force=false to schedule via rAF, breaking synchronous render loops.
		// Redraw is still forced because we set overlayInitRef.current = false above.
		syncViewportRef.current(false);
	}, [
		isLoaded,
		xAxes,
		yAxes,
		series,
		datasets,
		themeColors,
		width,
		height,
		dpr,
		pixelWidth,
		pixelHeight,
	]);

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
					void importFiles(e.dataTransfer.files);
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
					<EmptyState
						width={width}
						height={height}
						padding={padding}
						onImportFiles={importFiles}
						onLoadDemo={() => useGraphStore.getState().loadDemoData()}
					/>
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
							dpr={dpr}
							pixelWidth={pixelWidth}
							pixelHeight={pixelHeight}
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
					onAxisStep={handleXAxisStep}
				/>
				<YAxisInteractionZones
					axes={activeYAxes}
					titles={yAxisTitles}
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
					onAxisStep={handleYAxisStep}
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
						onHighlight={(id) => useGraphStore.getState().setHighlightedSeries(id)}
					/>
				)}
			</main>
			<Suspense fallback={null}>
				{pendingFile && (
					<ImportSettingsDialogLazy
						key={pendingFile.id}
						fileName={pendingFile.file.name}
						fileContent={pendingFile.preview}
						previewTruncated={pendingFile.previewTruncated}
						fileType={pendingFile.type}
						defaultDelimiter={pendingFile.defaultDelimiter}
						isImporting={isImporting}
						sheets={pendingFile.sheets}
						selectedSheet={pendingFile.selectedSheet}
						onSheetChange={changeSheet}
						onConfirm={confirmImport}
						onCancel={cancelImport}
					/>
				)}
			</Suspense>
		</>
	);
}
