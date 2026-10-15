import React from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";

export interface SeriesMetadata {
	series: SeriesConfig;
	ds: Dataset;
	axis: YAxisConfig;
	xAxis: XAxisConfig;
	xIdx: number;
	yIdx: number;
	xCol: { data: Float32Array; refPoint: number; categoryLabels?: string[] };
	yCol: { data: Float32Array; refPoint: number; categoryLabels?: string[] };
}

export interface SnapItem {
	seriesId: string;
	label: string;
	value: number;
	/** World x of this series' snapped sample (its own x axis). */
	xValue: number;
	xAxisId: string;
	yAxisId: string;
	valueLabel?: string;
	color: string;
	yScreen: number;
	xScreen: number;
	pointStyle: string;
	lineStyle: string;
}

export interface SnapGroup {
	xLabel: string;
	xAxisName: string;
	items: SnapItem[];
}

export interface SnapResult {
	snapScreenX: number;
	/** World x of the closest sample overall, on axis `snapXAxisId`. */
	snapX: number;
	snapXAxisId: string;
	entries: SnapGroup[];
}

export interface CrosshairProps {
	containerRef: React.RefObject<HTMLDivElement | null>;
	padding: { top: number; right: number; bottom: number; left: number };
	width: number;
	height: number;
	isPanning: boolean;
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	datasets: Dataset[];
	series: SeriesConfig[];
	tooltipColor: string;
	snapLineColor: string;
	tooltipDividerColor: string;
	tooltipSubColor: string;
	plotBg: string;
}
