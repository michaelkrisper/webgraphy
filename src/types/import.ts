export type ColumnType = "numeric" | "date" | "categorical" | "ignore";

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
	// If set, parser splits rows by the value of this categorical column,
	// producing one Dataset per distinct group value. The split column itself
	// is excluded from the resulting datasets' columns.
	splitByColumn?: string;
}
