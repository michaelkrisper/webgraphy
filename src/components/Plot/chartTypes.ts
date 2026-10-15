// src/components/Plot/chartTypes.ts
import type { YAxisConfig } from "../../services/persistence";
import type { AxisScale } from "../../utils/axisScale";
import type { SecondaryLabel, TimeTick } from "../../utils/time";

type XTicks =
	| {
			result: number[];
			step: number;
			precision: number;
			isXDate: false;
			secondaryLabels?: undefined;
			/** Log axes: unlabelled ticks between the labelled ones. */
			minorTicks?: number[];
	  }
	| {
			result: TimeTick[];
			isXDate: true;
			secondaryLabels: SecondaryLabel[];
			step?: undefined;
			precision?: undefined;
			minorTicks?: undefined;
	  };

export interface XAxisLayout {
	id: string;
	min: number;
	max: number;
	ticks: XTicks;
	title: string;
	color: string;
	showGrid: boolean;
	/** Absent = linear. */
	scale?: AxisScale;
	// If set, axis tick labels are categorical.
	// Default mapping: tick value t maps to categoryLabels[Math.round(t)].
	// If categoryTicks is provided, the i-th label corresponds to categoryTicks[i].
	categoryLabels?: string[];
	categoryTicks?: number[];
}

export interface YAxisLayout extends YAxisConfig {
	ticks: number[];
	precision: number;
	actualStep: number;
	/** Log axes: unlabelled ticks between the labelled ones. */
	minorTicks?: number[];
	// If set, axis tick labels are categorical: tick value t maps to categoryLabels[Math.round(t)].
	categoryLabels?: string[];
}

export interface XAxisMetrics {
	id: string;
	height: number;
	labelBottom: number;
	secLabelBottom: number;
	titleBottom: number;
	cumulativeOffset: number;
}

export type PanTarget = "all" | { xAxisId: string } | { yAxisId: string };

/** The x-axis id a pan target refers to, or undefined for "all"/y-targets. */
export const panTargetXAxisId = (t: PanTarget): string | undefined =>
	typeof t === "object" && "xAxisId" in t ? t.xAxisId : undefined;

/** The y-axis id a pan target refers to, or undefined for "all"/x-targets. */
export const panTargetYAxisId = (t: PanTarget): string | undefined =>
	typeof t === "object" && "yAxisId" in t ? t.yAxisId : undefined;
