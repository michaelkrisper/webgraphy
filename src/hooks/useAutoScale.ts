/* eslint-disable react-hooks/immutability */
// src/hooks/useAutoScale.ts
import { useCallback, useEffect, useMemo, useRef } from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../services/persistence";
import { useGraphStore } from "../store/useGraphStore";
import { getColumnIndex } from "../utils/columns";

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
	syncViewport: (force?: boolean) => void;
}

interface UseAutoScaleResult {
	handleAutoScaleY: (axisId: string, mouseY?: number) => void;
	handleAutoScaleX: (xAxisId?: string) => void;
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

	const datasetsById = useMemo(() => {
		const map = new Map<string, Dataset>();
		datasets.forEach((d) => map.set(d.id, d));
		return map;
	}, [datasets]);

	const xAxesById = useMemo(() => {
		const map = new Map<string, XAxisConfig>();
		xAxes.forEach((a) => map.set(a.id, a));
		return map;
	}, [xAxes]);

	const activeDatasetIdsSet = useMemo(() => {
		const set = new Set<string>();
		series.forEach((s) => set.add(s.sourceId));
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
			datasetsById,
			xAxesById,
			activeDatasetIdsSet,
			seriesByYAxisId,
		};
	});

	const handleAutoScaleY = useCallback(
		(axisId: string, mouseY?: number) => {
			const {
				padding: p,
				chartHeight: ch,
				syncViewport: sv,
				datasetsById: dsById,
				xAxesById: xaById,
				seriesByYAxisId: sByY,
			} = depsRef.current;

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
					// Full fit: use precomputed bounds (no viewport filtering needed)
					if (colY.bounds) {
						if (colY.bounds.min < yMin) yMin = colY.bounds.min;
						if (colY.bounds.max > yMax) yMax = colY.bounds.max;
					}
				} else {
					// Viewport-filtered fit (scroll wheel double-tap)
					const xAxis = xaById.get(ds?.xAxisId || "axis-1");
					if (!xAxis) return;
					const xIdx = getColumnIndex(ds, ds.xAxisColumn);
					if (xIdx === -1) return;
					const colX = ds.data[xIdx];
					if (!colX?.data || !colY.data) return;
					const xData = colX.data,
						yData = colY.data,
						refX = colX.refPoint,
						refY = colY.refPoint;
					let startIdx = -1,
						endIdx = -1,
						low = 0,
						high = xData.length - 1;
					while (low <= high) {
						const mid = (low + high) >>> 1;
						if (xData[mid] + refX >= xAxis.min) {
							startIdx = mid;
							high = mid - 1;
						} else low = mid + 1;
					}
					low = 0;
					high = xData.length - 1;
					while (low <= high) {
						const mid = (low + high) >>> 1;
						if (xData[mid] + refX <= xAxis.max) {
							endIdx = mid;
							low = mid + 1;
						} else high = mid - 1;
					}
					if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
						for (let i = startIdx; i <= endIdx; i++) {
							const v = yData[i] + refY;
							if (v < yMin) yMin = v;
							if (v > yMax) yMax = v;
						}
					}
				}
			});

			if (yMin !== Infinity) {
				let nMin: number, nMax: number;
				const r = yMax - yMin || 1,
					pad = r * 0.05;
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

				// Revert to 5% padding for better fit
				const professionalPad = (nMax - nMin || 1) * 0.05;
				targetYs.current[axisId] = { min: nMin - professionalPad, max: nMax + professionalPad };
				sv();
			}
		},
		[targetYs],
	);

	const handleAutoScaleX = useCallback(
		(xAxisId?: string) => {
			const {
				activeXAxesUsed: axUsed,
				syncViewport: sv,
				datasets: allDs,
				activeDatasetIdsSet: activeDsIds,
			} = depsRef.current;

			if (allDs.length === 0) return;

			const axesToScale = xAxisId ? [xAxisId] : axUsed.map((a) => a.id);
			const xs = targetXAxes.current;

			axesToScale.forEach((id) => {
				const activeDs = allDs.filter(
					(d) => (d.xAxisId || "axis-1") === id && activeDsIds.has(d.id),
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
					const range = xMax - xMin || 1;
					const pad = range * 0.05; // 5% padding
					xs[id] = { min: xMin - pad, max: xMax + pad };
				}
			});
			sv();
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

			const EPSILON = 1e-10;
			series.forEach((s) => {
				const ds = datasetsById.get(s.sourceId);
				const xAxis = xAxesById.get(ds?.xAxisId || "axis-1");
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
					// Uses EPSILON to prevent infinite loops from tiny precision differences
					if (
						xAxis.min <= xCol.bounds.max + EPSILON &&
						xAxis.max >= xCol.bounds.min - EPSILON
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

			// Calculate X bounds per axis
			const xBounds = new Map<string, { min: number; max: number }>();
			series.forEach((s) => {
				const ds = datasetsById.get(s.sourceId);
				if (!ds) return;
				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				const col = ds.data[xIdx];
				if (!col?.bounds || !Number.isFinite(col.bounds.min)) return;
				const xId = ds.xAxisId || "axis-1";
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
					const pad = (bounds.max - bounds.min || 1) * 0.05;
					const nextX = { min: bounds.min - pad, max: bounds.max + pad };
					if (!Number.isNaN(nextX.min) && !Number.isNaN(nextX.max)) {
						xs[id] = nextX;
						xUpdates[id] = nextX;
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
					const pad = (yMax - yMin || 1) * 0.05;
					const nextY = { min: yMin - pad, max: yMax + pad };
					if (!Number.isNaN(nextY.min) && !Number.isNaN(nextY.max)) {
						ys[axis.id] = nextY;
						yUpdates[axis.id] = nextY;
					}
				}
			});

			if (
				Object.keys(xUpdates).length > 0 ||
				Object.keys(yUpdates).length > 0
			) {
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
		const {
			chartHeight: ch,
			syncViewport: sv,
			datasetsById: dsById,
			xAxesById: xaById,
			seriesByYAxisId: sByY,
			activeYAxes: ayAxes,
		} = depsRef.current;

		const orderedAxisIds: string[] = [];
		const seenAxes = new Set<string>();
		for (const ax of ayAxes) {
			if (!seenAxes.has(ax.id)) {
				seenAxes.add(ax.id);
				orderedAxisIds.push(ax.id);
			}
		}

		const n = orderedAxisIds.length;
		if (n === 0) return;

		const sliceH = ch / n;

		orderedAxisIds.forEach((axisId, i) => {
			const axisSeries = sByY.get(axisId);
			if (!axisSeries || axisSeries.length === 0) return;

			let yMin = Infinity, yMax = -Infinity;
			axisSeries.forEach((s) => {
				const ds = dsById.get(s.sourceId);
				if (!ds) return;
				const yIdx = getColumnIndex(ds, s.yColumn);
				if (yIdx === -1) return;
				const colY = ds.data[yIdx];
				if (!colY?.data) return;
				const xAxis = xaById.get(ds.xAxisId || "axis-1");
				if (!xAxis) return;
				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				if (xIdx === -1) return;
				const colX = ds.data[xIdx];
				if (!colX?.data) return;
				const xData = colX.data, yData = colY.data;
				const refX = colX.refPoint, refY = colY.refPoint;
				let startIdx = -1, endIdx = -1, low = 0, high = xData.length - 1;
				while (low <= high) {
					const mid = (low + high) >>> 1;
					if (xData[mid] + refX >= xAxis.min) { startIdx = mid; high = mid - 1; }
					else low = mid + 1;
				}
				low = 0; high = xData.length - 1;
				while (low <= high) {
					const mid = (low + high) >>> 1;
					if (xData[mid] + refX <= xAxis.max) { endIdx = mid; low = mid + 1; }
					else high = mid - 1;
				}
				if (startIdx !== -1 && endIdx !== -1 && startIdx <= endIdx) {
					for (let j = startIdx; j <= endIdx; j++) {
						const v = yData[j] + refY;
						if (v < yMin) yMin = v;
						if (v > yMax) yMax = v;
					}
				}
			});

			if (yMin === Infinity) return;

			const dataRange = yMax - yMin || 1;
			const pad = dataRange * 0.05;
			const dMin = yMin - pad;
			const dMax = yMax + pad;
			const paddedRange = dMax - dMin;

			// Slice i=0 → top of chart, i=n-1 → bottom
			const sliceBot = (i + 1) * sliceH;
			const totalRange = paddedRange * ch / sliceH;
			const targetMin = dMin - totalRange * (ch - sliceBot) / ch;
			const targetMax = targetMin + totalRange;

			targetYs.current[axisId] = { min: targetMin, max: targetMax };
		});

		sv();
	}, [targetYs]);

	return { handleAutoScaleY, handleAutoScaleX, handleStackedFit };
}
