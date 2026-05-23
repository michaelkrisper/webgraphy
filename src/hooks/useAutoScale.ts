// src/hooks/useAutoScale.ts
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import { AXIS_EPSILON, DEFAULT_X_AXIS_ID } from "../utils/axisCalculations";
import { findFirstGE, findLastLE } from "../utils/binarySearch";
import { getColumnIndex } from "../utils/columns";

const AXIS_PADDING_RATIO = 0.05;

const axisPadding = (min: number, max: number): number =>
	(max - min || 1) * AXIS_PADDING_RATIO;

/**
 * Find inclusive index range of xData (offset by refX) within [xMin, xMax]
 * via binary search. Returns null if no points fall in range.
 */
function visibleIndexRange(
	xData: ArrayLike<number>,
	refX: number,
	xMin: number,
	xMax: number,
): { startIdx: number; endIdx: number } | null {
	const startIdx = findFirstGE(xData, xMin, refX, -1);
	const endIdx = findLastLE(xData, xMax, refX, -1);
	if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) return null;
	return { startIdx, endIdx };
}

interface UseAutoScaleOptions {
	isLoaded: boolean;
	series: SeriesConfig[];
	datasets: Dataset[];
	xAxes: XAxisConfig[];
	activeYAxes: YAxisConfig[];
	activeXAxesUsed: XAxisConfig[];
	padding: { top: number; right: number; bottom: number; left: number };
	chartHeight: number;
	targetXAxes: React.MutableRefObject<
		Record<string, { min: number; max: number }>
	>;
	targetYs: React.MutableRefObject<
		Record<string, { min: number; max: number }>
	>;
	syncViewport: (force?: boolean, immediate?: boolean) => void;
}

interface AutoScaleDeps {
	padding: { top: number; right: number; bottom: number; left: number };
	chartHeight: number;
	activeXAxesUsed: XAxisConfig[];
	activeYAxes: YAxisConfig[];
	syncViewport: (force?: boolean, immediate?: boolean) => void;
	datasets: Dataset[];
	xAxes: XAxisConfig[];
	series: SeriesConfig[];
	datasetsById: Map<string, Dataset>;
	xAxesById: Map<string, XAxisConfig>;
	activeDatasetIdsSet: Set<string>;
	seriesByYAxisId: Map<string, SeriesConfig[]>;
}

function computeAutoScaleY(
	axisId: string,
	mouseY: number | undefined,
	deps: AutoScaleDeps,
	targetYsRef: React.MutableRefObject<Record<string, { min: number; max: number }>>
): void {
	const targetYs = targetYsRef.current;
	const {
		padding: p,
		chartHeight: ch,
		syncViewport: sv,
		datasetsById: dsById,
		xAxesById: xaById,
		seriesByYAxisId: sByY,
	} = deps;

	const axisSeries = sByY.get(axisId);
	if (!axisSeries || axisSeries.length === 0) return;

	let yMin = Infinity,
		yMax = -Infinity;

	axisSeries.forEach((s) => {
		const ds = dsById.get(s.sourceId);
		if (!ds) return;
		const yIdx = getColumnIndex(ds, s.yColumn);
		if (yIdx === -1) return;
		const colY = ds.data[yIdx];
		if (!colY) return;

		if (mouseY === undefined) {
			if (colY.bounds) {
				if (colY.bounds.min < yMin) yMin = colY.bounds.min;
				if (colY.bounds.max > yMax) yMax = colY.bounds.max;
			}
		} else {
			const xAxis = xaById.get(ds?.xAxisId || DEFAULT_X_AXIS_ID);
			if (!xAxis) return;
			const xIdx = getColumnIndex(ds, ds.xAxisColumn);
			if (xIdx === -1) return;
			const colX = ds.data[xIdx];
			if (!colX?.data || !colY.data) return;
			const xData = colX.data,
				yData = colY.data,
				refX = colX.refPoint,
				refY = colY.refPoint;
			const range = visibleIndexRange(xData, refX, xAxis.min, xAxis.max);
			if (range) {
				for (let i = range.startIdx; i <= range.endIdx; i++) {
					const v = yData[i] + refY;
					if (v < yMin) yMin = v;
					if (v > yMax) yMax = v;
				}
			}
		}
	});

	if (yMin !== Infinity) {
		let nMin: number, nMax: number;
		const r = yMax - yMin || 1;
		const pad = r * AXIS_PADDING_RATIO;
		if (mouseY !== undefined) {
			if (mouseY < p.top + ch / 3) {
				nMin = yMin - r - 3 * pad;
				nMax = yMax + pad;
			} else if (mouseY > p.top + (2 * ch) / 3) {
				nMin = yMin - pad;
				nMax = yMax + r + 3 * pad;
			} else {
				nMin = yMin - pad;
				nMax = yMax + pad;
			}
		} else {
			nMin = yMin - pad;
			nMax = yMax + pad;
		}

		const professionalPad = axisPadding(nMin, nMax);
		targetYs[axisId] = {
			min: nMin - professionalPad,
			max: nMax + professionalPad,
		};
		sv();
	}
}

function computeAutoScaleX(
	xAxisId: string | undefined,
	deps: AutoScaleDeps,
	targetXAxesRef: React.MutableRefObject<Record<string, { min: number; max: number }>>
): void {
	const targetXAxes = targetXAxesRef.current;
	const {
		activeXAxesUsed: axUsed,
		syncViewport: sv,
		datasets: allDs,
		activeDatasetIdsSet: activeDsIds,
	} = deps;

	if (allDs.length === 0) return;

	const axesToScale = xAxisId ? [xAxisId] : axUsed.map((a) => a.id);

	axesToScale.forEach((id) => {
		const activeDs = allDs.filter(
			(d) => (d.xAxisId || DEFAULT_X_AXIS_ID) === id && activeDsIds.has(d.id),
		);
		if (activeDs.length === 0) return;
		let xMin = Infinity,
			xMax = -Infinity;
		activeDs.forEach((ds) => {
			const xIdx = getColumnIndex(ds, ds.xAxisColumn),
				col = ds.data[xIdx];
			if (col?.bounds) {
				if (col.bounds.min < xMin) xMin = col.bounds.min;
				if (col.bounds.max > xMax) xMax = col.bounds.max;
			}
		});
		if (xMin !== Infinity) {
			const pad = axisPadding(xMin, xMax);
			targetXAxes[id] = { min: xMin - pad, max: xMax + pad };
		}
	});
	sv();
}

function computeStackedFit(
	deps: AutoScaleDeps,
	targetXAxesRef: React.MutableRefObject<Record<string, { min: number; max: number }>>,
	targetYsRef: React.MutableRefObject<Record<string, { min: number; max: number }>>
): void {
	const targetXAxes = targetXAxesRef.current;
	const targetYs = targetYsRef.current;
	const {
		chartHeight: ch,
		syncViewport: sv,
		datasetsById: dsById,
		xAxesById: xaById,
		seriesByYAxisId: sByY,
		activeYAxes: ayAxes,
		series: allSeries,
	} = deps;

	const orderedAxisIds: string[] = [];
	const seenAxes = new Set<string>();
	for (const s of allSeries) {
		if (!seenAxes.has(s.yAxisId) && ayAxes.some((a) => a.id === s.yAxisId)) {
			seenAxes.add(s.yAxisId);
			orderedAxisIds.push(s.yAxisId);
		}
	}

	const n = orderedAxisIds.length;
	if (n === 0) return;

	const sliceH = ch / n;

	orderedAxisIds.forEach((axisId, i) => {
		const axisSeries = sByY.get(axisId);
		if (!axisSeries || axisSeries.length === 0) return;

		let yMin = Infinity,
			yMax = -Infinity;
		axisSeries.forEach((s) => {
			const ds = dsById.get(s.sourceId);
			if (!ds) return;
			const yIdx = getColumnIndex(ds, s.yColumn);
			if (yIdx === -1) return;
			const colY = ds.data[yIdx];
			if (!colY?.data) return;
			const xAxisId = ds.xAxisId || DEFAULT_X_AXIS_ID;
			const storeXAxis = xaById.get(xAxisId);
			const liveRange = targetXAxes[xAxisId];
			const xMin = liveRange?.min ?? storeXAxis?.min;
			const xMax = liveRange?.max ?? storeXAxis?.max;
			if (xMin === undefined || xMax === undefined) return;
			const xIdx = getColumnIndex(ds, ds.xAxisColumn);
			if (xIdx === -1) return;
			const colX = ds.data[xIdx];
			if (!colX?.data) return;
			const xData = colX.data,
				yData = colY.data;
			const refX = colX.refPoint,
				refY = colY.refPoint;
			const range = visibleIndexRange(xData, refX, xMin, xMax);
			if (range) {
				for (let j = range.startIdx; j <= range.endIdx; j++) {
					const v = yData[j] + refY;
					if (v < yMin) yMin = v;
					if (v > yMax) yMax = v;
				}
			}
		});

		if (yMin === Infinity) return;

		const pad = axisPadding(yMin, yMax);
		const dMin = yMin - pad;
		const dMax = yMax + pad;
		const paddedRange = dMax - dMin;

		const sliceBot = (i + 1) * sliceH;
		const totalRange = (paddedRange * ch) / sliceH;
		const targetMin = dMin - (totalRange * (ch - sliceBot)) / ch;
		const targetMax = targetMin + totalRange;

		targetYs[axisId] = { min: targetMin, max: targetMax };
	});

	sv();
}

interface UseAutoScaleResult {
	handleAutoScaleY: (axisId: string, mouseY?: number) => void;
	handleAutoScaleX: (xAxisId?: string) => void;
	handleStackedFit: () => void;
}

export function useAutoScale({
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
	syncViewport,
}: UseAutoScaleOptions): UseAutoScaleResult {
	const wasEmptyRef = useRef(true);

	const datasetsById = useMemo(
		() => new Map<string, Dataset>(datasets.map((d) => [d.id, d])),
		[datasets],
	);

	const xAxesById = useMemo(
		() => new Map<string, XAxisConfig>(xAxes.map((a) => [a.id, a])),
		[xAxes],
	);

	const activeDatasetIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => {
			set.add(s.sourceId);
		});
		return set;
	}, [series]);

	const seriesByYAxisId = useMemo(() => {
		const map = new Map<string, SeriesConfig[]>();
		series.forEach((s) => {
			if (!map.has(s.yAxisId)) map.set(s.yAxisId, []);
			map.get(s.yAxisId)?.push(s);
		});
		return map;
	}, [series]);

	// Use refs for dependencies to keep callbacks stable
	const depsRef = useRef({
		padding,
		chartHeight,
		activeXAxesUsed,
		activeYAxes,
		syncViewport,
		datasets,
		xAxes,
		series,
		datasetsById,
		xAxesById,
		activeDatasetIdsSet,
		seriesByYAxisId,
	});

	useEffect(() => {
		depsRef.current = {
			padding,
			chartHeight,
			activeXAxesUsed,
			activeYAxes,
			syncViewport,
			datasets,
			xAxes,
			series,
			datasetsById,
			xAxesById,
			activeDatasetIdsSet,
			seriesByYAxisId,
		};
	});

	const handleAutoScaleY = useCallback(
		(axisId: string, mouseY?: number) => {
						computeAutoScaleY(axisId, mouseY, depsRef.current, targetYs);
		},
		[targetYs],
	);

	const handleAutoScaleX = useCallback(
		(xAxisId?: string) => {
						computeAutoScaleX(xAxisId, depsRef.current, targetXAxes);
		},
		[targetXAxes],
	);

	// Initial load + empty-to-data transition
	useEffect(() => {
		if (!isLoaded) return;
		const state = useGraphStore.getState();

		// If no series, there's nothing to auto-scale or check visibility for.
		// We stay in "wasEmpty" state until at least one series is added.
		if (series.length === 0) {
			wasEmptyRef.current = true;
			return;
		}

		// Determine if we need to reset the view (e.g., first data load or no data visible)
		let shouldReset = wasEmptyRef.current;

		if (!shouldReset && datasets.length > 0) {
			let hasValidData = false;
			let anyDataVisible = false;

			series.forEach((s) => {
				const ds = datasetsById.get(s.sourceId);
				const xAxis = xAxesById.get(ds?.xAxisId || DEFAULT_X_AXIS_ID);
				if (!ds || !xAxis) return;
				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				const xCol = ds.data[xIdx];
				if (
					xCol?.bounds &&
					Number.isFinite(xCol.bounds.min) &&
					Number.isFinite(xCol.bounds.max)
				) {
					hasValidData = true;
					// Robust intersection check: overlap if (min1 <= max2 && max1 >= min2)
					// AXIS_EPSILON prevents infinite loops from tiny precision differences.
					if (
						xAxis.min <= xCol.bounds.max + AXIS_EPSILON &&
						xAxis.max >= xCol.bounds.min - AXIS_EPSILON
					) {
						anyDataVisible = true;
					}
				}
			});
			if (hasValidData && !anyDataVisible) shouldReset = true;
		}

		if (shouldReset && datasets.length > 0) {
			// Mark as no longer empty immediately to prevent re-entry before state update
			wasEmptyRef.current = false;

			const xUpdates: Record<string, { min: number; max: number }> = {};
			const yUpdates: Record<string, { min: number; max: number }> = {};
			let hasXUpdates = false;
			let hasYUpdates = false;

			// Calculate X bounds per axis
			const xBounds = new Map<string, { min: number; max: number }>();
			series.forEach((s) => {
				const ds = datasetsById.get(s.sourceId);
				if (!ds) return;
				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				const col = ds.data[xIdx];
				if (!col?.bounds || !Number.isFinite(col.bounds.min)) return;
				const xId = ds.xAxisId || DEFAULT_X_AXIS_ID;
				const cur = xBounds.get(xId) || { min: Infinity, max: -Infinity };
				xBounds.set(xId, {
					min: Math.min(cur.min, col.bounds.min),
					max: Math.max(cur.max, col.bounds.max),
				});
			});

			const xs = targetXAxes.current;
			xBounds.forEach((bounds, id) => {
				if (
					bounds.min !== Infinity &&
					!Number.isNaN(bounds.min) &&
					!Number.isNaN(bounds.max)
				) {
					const pad = axisPadding(bounds.min, bounds.max);
					const nextX = { min: bounds.min - pad, max: bounds.max + pad };
					if (!Number.isNaN(nextX.min) && !Number.isNaN(nextX.max)) {
						xs[id] = nextX;
						xUpdates[id] = nextX;
						hasXUpdates = true;
					}
				}
			});

			// Calculate Y bounds per axis
			const ys = targetYs.current;
			activeYAxes.forEach((axis) => {
				const axisSeries = seriesByYAxisId.get(axis.id) || [];
				if (axisSeries.length === 0) return;
				let yMin = Infinity,
					yMax = -Infinity;
				axisSeries.forEach((s) => {
					const ds = datasetsById.get(s.sourceId);
					if (!ds) return;
					const yIdx = getColumnIndex(ds, s.yColumn);
					const yCol = ds.data[yIdx];
					if (!yCol?.bounds || !Number.isFinite(yCol.bounds.min)) return;
					if (yCol.bounds.min < yMin) yMin = yCol.bounds.min;
					if (yCol.bounds.max > yMax) yMax = yCol.bounds.max;
				});

				if (yMin !== Infinity && !Number.isNaN(yMin) && !Number.isNaN(yMax)) {
					const pad = axisPadding(yMin, yMax);
					const nextY = { min: yMin - pad, max: yMax + pad };
					if (!Number.isNaN(nextY.min) && !Number.isNaN(nextY.max)) {
						ys[axis.id] = nextY;
						yUpdates[axis.id] = nextY;
						hasYUpdates = true;
					}
				}
			});

			if (hasXUpdates || hasYUpdates) {
				state.batchUpdateAxes(xUpdates, yUpdates);
				syncViewport();
			}
		}
	}, [
		isLoaded,
		syncViewport,
		series,
		datasets,
		datasetsById,
		xAxesById,
		seriesByYAxisId,
		activeYAxes,
		targetXAxes,
		targetYs,
	]);

	// New series detection
	const prevSeriesRef = useRef(series);
	useEffect(() => {
		if (!isLoaded) return;
		if (series.length > prevSeriesRef.current.length) {
			const added = series[series.length - 1];
			if (added) handleAutoScaleY(added.yAxisId);
		} else {
			series.forEach((s) => {
				const prev = prevSeriesRef.current.find((ps) => ps.id === s.id);
				if (
					prev &&
					(prev.yColumn !== s.yColumn || prev.sourceId !== s.sourceId)
				)
					handleAutoScaleY(s.yAxisId);
			});
		}
		prevSeriesRef.current = series;
	}, [series, isLoaded, handleAutoScaleY]);

	const handleStackedFit = useCallback(() => {
		computeStackedFit(depsRef.current, targetXAxes, targetYs);
	}, [targetYs, targetXAxes]);

	return { handleAutoScaleY, handleAutoScaleX, handleStackedFit };
}
