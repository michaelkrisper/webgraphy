export type ColumnType = "numeric" | "date" | "categorical" | "ignore";

/** `accept` filter for every file picker that feeds `importFile`. */
export const IMPORT_FILE_ACCEPT = ".csv,.json,.xlsx,.xls";

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
	commentChar: string;
	columnConfigs: ColumnConfig[];
	xAxisColumn?: string;
	// If set, parser splits rows by the combined values of these categorical
	// columns, producing one Dataset per distinct combination. The split
	// columns are excluded from the resulting datasets' columns.
	splitByColumns?: string[];
}
