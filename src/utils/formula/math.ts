
export const MATH_UNARY: Record<string, (a: number) => number> = {
	sin: Math.sin,
	cos: Math.cos,
	tan: Math.tan,
	asin: Math.asin,
	acos: Math.acos,
	atan: Math.atan,
	sinh: Math.sinh,
	cosh: Math.cosh,
	tanh: Math.tanh,
	sqrt: Math.sqrt,
	abs: Math.abs,
	exp: Math.exp,
	log: Math.log10,
	log2: Math.log2,
	ln: Math.log,
	round: Math.round,
	floor: Math.floor,
	ceil: Math.ceil,
	trunc: Math.trunc,
	sign: Math.sign,
	isnan: (a) => (Number.isNaN(a) ? 1 : 0),
};

export function mathModulo(a: number, b: number): number {
	if (b === 0) return NaN;
	return a - b * Math.floor(a / b);
}

export function isTruthy(x: number): boolean {
	return !Number.isNaN(x) && x !== 0;
}

export function sampleVariance(values: number[]): number {
	const n = values.length;
	if (n < 2) return 0;
	let mean = 0;
	for (let i = 0; i < n; i++) mean += values[i];
	mean /= n;
	let acc = 0;
	for (let i = 0; i < n; i++) {
		const d = values[i] - mean;
		acc += d * d;
	}
	return acc / (n - 1);
}

export function median(values: number[]): number {
	if (values.length === 0) return NaN;
	const sorted = values.slice().sort((a, b) => a - b);
	const mid = sorted.length >> 1;
	return sorted.length % 2 === 0
		? (sorted[mid - 1] + sorted[mid]) / 2
		: sorted[mid];
}
