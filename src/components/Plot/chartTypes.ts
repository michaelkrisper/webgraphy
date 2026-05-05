// src/components/Plot/chartTypes.ts
import type { YAxisConfig } from "../../services/persistence";
import type { SecondaryLabel, TimeTick } from "../../utils/time";

type XTicks =
	| {
			result: number[];
			step: number;
			precision: number;
			isXDate: false;
			secondaryLabels?: undefined;
	  }
	| {
			result: TimeTick[];
			isXDate: true;
			secondaryLabels: SecondaryLabel[];
			step?: undefined;
			precision?: undefined;
	  };

export interface XAxisLayout {
	id: string;
	min: number;
	max: number;
	ticks: XTicks;
	title: string;
	color: string;
	showGrid: boolean;
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
