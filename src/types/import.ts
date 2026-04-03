export type ColumnType = 'numeric' | 'date' | 'categorical' | 'ignore';

export interface ColumnConfig {
  index: number;
  name: string;
  type: ColumnType;
  dateFormat?: string;
}

export interface ImportSettings {
  delimiter: string;
  decimalPoint: string;
  startRow: number;
  columnConfigs: ColumnConfig[];
}
