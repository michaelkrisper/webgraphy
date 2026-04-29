// src/components/Plot/chartTypes.ts
import { type YAxisConfig } from '../../services/persistence';
import { type TimeTick, type SecondaryLabel } from '../../utils/time';

export type XTicks =
  | { result: number[]; step: number; precision: number; isXDate: false; secondaryLabels?: undefined }
  | { result: TimeTick[]; isXDate: true; secondaryLabels: SecondaryLabel[]; step?: undefined; precision?: undefined };

export interface XAxisLayout {
  id: string;
  ticks: XTicks;
  title: string;
  color: string;
}

export interface YAxisLayout extends YAxisConfig {
  ticks: number[];
  precision: number;
  actualStep: number;
}

export interface XAxisMetrics {
  id: string;
  height: number;
  labelBottom: number;
  secLabelBottom: number;
  titleBottom: number;
  cumulativeOffset: number;
}

export type PanTarget = 'all' | { xAxisId: string } | { yAxisId: string };
