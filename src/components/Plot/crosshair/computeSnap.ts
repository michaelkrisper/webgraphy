import type { XAxisConfig } from "../../../services/persistence";
import { findClosest } from "../../../utils/binarySearch";
import { screenToWorld, worldToScreen } from "../../../utils/coords";
import { formatFullDate } from "../../../utils/time";
import type { SeriesMetadata, SnapGroup, SnapResult } from "./types";

interface ComputeSnapParams {
	pos: { x: number; y: number };
	seriesMetadata: SeriesMetadata[];
	xAxisNameById: Record<string, string>;
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
}

export function computeSnap({
	pos,
	seriesMetadata,
	xAxisNameById,
	width,
	height,
	padding,
}: ComputeSnapParams): SnapResult | null {
	if (seriesMetadata.length === 0) return null;
	const firstXAxis = seriesMetadata[0].xAxis;
	if (!firstXAxis) return null;

	let bestDist = Infinity;
	let bestXWorld: number | null = null;
	let bestSeriesXConf: XAxisConfig | null = null;
	const closestIdxByDataset = new Map<string, number>();

	// Series sharing a dataset share xCol/xAxis, so one evaluation per dataset suffices.
	seriesMetadata.forEach(({ ds, xAxis, xCol }) => {
		if (closestIdxByDataset.has(ds.id)) return;
		const xData = xCol.data;
		const refX = xCol.refPoint;
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
		const cachedIdx = findClosest(xData, sMouseWorld.x, refX);
		closestIdxByDataset.set(ds.id, cachedIdx);
		for (let i = cachedIdx - 1; i <= cachedIdx + 1; i++) {
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
}
