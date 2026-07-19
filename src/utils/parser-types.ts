export interface ColumnConfigEntry {
  index: number;
  name?: string;
  type?: "numeric" | "date" | "categorical" | "ignore";
  dateFormat?: string;
}

export interface ParseSettings {
  delimiter?: string;
  decimalPoint?: string;
  startRow?: number;
  commentChar?: string;
  columnConfigs?: ColumnConfigEntry[];
  xAxisColumn?: string;
  splitByColumns?: string[];
}

export interface ParserResult {
  columns: string[];
  rowCount: number;
  data: Float64Array[];
  categoricalMaps: Map<string, number>[];
}

export interface ParseConfig {
  type?: string;
  dateFormat?: string;
}
