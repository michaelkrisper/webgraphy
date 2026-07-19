export interface FormulaContext {
	queues: Record<number, number[]>;
	sums: Record<number, number>;
	sumsSq: Record<number, number>;
	timeQueues: Record<number, { t: number; v: number }[]>;
	timeSums: Record<number, number>;
	groupSums: Record<number, number>;
	groupCounts: Record<number, number>;
	groupLastKey: Record<number, string | number>;
	lagBuffers: Record<number, number[]>;
	prevVals: Record<number, number>;
	hasPrev: Record<number, boolean>;
	cumState: Record<number, number>;
	cumHas: Record<number, boolean>;
	filterState: Record<
		number,
		{ estimate: number; errorCov: number; measurementNoise: number }
	>;
}

export interface FormulaResult {
	evaluate: (rowValues: number[], ctx?: FormulaContext) => number;
	usedColumnIndices: number[];
	error?: string;
	errorPos?: number;
	createContext?: () => FormulaContext;
	expression?: string;
}

export type Token =
	| { type: "NUMBER"; value: number; pos: number }
	| { type: "VAR"; index: number; pos: number }
	| {
			type: "OP";
			value: string;
			prec: number;
			assoc: "L" | "R";
			unary?: boolean;
			pos: number;
	  }
	| {
			type: "FUNC";
			value: string;
			id: number;
			args?: number;
			constN?: number;
			pos: number;
	  }
	| { type: "CONST"; value: number; pos: number }
	| { type: "LPAREN"; pos: number }
	| { type: "RPAREN"; pos: number }
	| { type: "COMMA"; pos: number };

export class FormulaError extends Error {
	pos: number;
	constructor(message: string, pos: number) {
		super(message);
		this.pos = pos;
	}
}

export type Granularity = "day" | "hour" | "minute" | "second";

export interface FormulaWorkerParams {
	/** Request id, assigned by the worker client to correlate responses. */
	id?: number;
	datasetId: string;
	name: string;
	formula: string;
	columns: string[];
	rowCount: number;
	columnData: { data: Float32Array; refPoint: number }[];
}

export interface FormulaEvaluationResult {
	/** Echoes the originating request id so concurrent calls can be matched. */
	id?: number;
	type: "success" | "error";
	newColumn?: {
		isFloat64: boolean;
		refPoint: number;
		bounds: { min: number; max: number };
		data: Float32Array;
		formula?: string;
	};
	sparseXColumn?: {
		isFloat64: boolean;
		refPoint: number;
		bounds: { min: number; max: number };
		data: Float32Array;
	};
	datasetId?: string;
	name?: string;
	error?: string;
}
