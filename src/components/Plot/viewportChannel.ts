/**
 * Lock-free viewport handoff between the UI thread and the render worker.
 *
 * The per-frame payload during pan/zoom is purely numeric (axis ranges +
 * flags), so instead of a postMessage per frame the main thread writes into a
 * SharedArrayBuffer guarded by a seqlock and the worker's render loop polls
 * it once per rAF: the writer bumps the sequence counter to an odd value,
 * writes, and bumps it even again; the reader retries (skips the frame) when
 * it observes an odd or changed counter. Requires `crossOriginIsolated` —
 * callers fall back to the postMessage path when SharedArrayBuffer is
 * unavailable.
 *
 * Layout: Int32 header [seq, version, interacting, xCount, yCount], padded to
 * 8 bytes, then Float64 (min, max) pairs for up to MAX_AXES x-axes followed
 * by up to MAX_AXES y-axes, in the slot order fixed by the current scene
 * context (`version` guards against reading ranges with a stale order).
 */

export const MAX_AXES = 9;

const HEADER_I32 = 6; // seq, version, interacting, xCount, yCount, (pad)
const FLOATS_OFFSET_BYTES = HEADER_I32 * 4; // 24, 8-byte aligned
export const VIEWPORT_SAB_BYTES =
	FLOATS_OFFSET_BYTES + MAX_AXES * 2 * 2 * 8;

const SEQ = 0;
const VERSION = 1;
const INTERACTING = 2;
const X_COUNT = 3;
const Y_COUNT = 4;

export interface ViewportRange {
	min: number;
	max: number;
}

export interface ViewportSnapshot {
	version: number;
	interacting: boolean;
	xCount: number;
	yCount: number;
	/** (min, max) pairs, x axes first — slice length xCount*2 + yCount*2. */
	ranges: Float64Array;
}

export const createViewportSnapshot = (): ViewportSnapshot => ({
	version: 0,
	interacting: false,
	xCount: 0,
	yCount: 0,
	ranges: new Float64Array(MAX_AXES * 4),
});

export class ViewportWriter {
	private i32: Int32Array;
	private f64: Float64Array;

	constructor(buffer: SharedArrayBuffer | ArrayBuffer) {
		this.i32 = new Int32Array(buffer, 0, HEADER_I32);
		this.f64 = new Float64Array(buffer, FLOATS_OFFSET_BYTES, MAX_AXES * 4);
	}

	write(
		version: number,
		interacting: boolean,
		xRanges: readonly ViewportRange[],
		yRanges: readonly ViewportRange[],
	): void {
		const { i32, f64 } = this;
		const xCount = Math.min(xRanges.length, MAX_AXES);
		const yCount = Math.min(yRanges.length, MAX_AXES);
		Atomics.add(i32, SEQ, 1); // odd: write in progress
		i32[VERSION] = version;
		i32[INTERACTING] = interacting ? 1 : 0;
		i32[X_COUNT] = xCount;
		i32[Y_COUNT] = yCount;
		let o = 0;
		for (let i = 0; i < xCount; i++) {
			f64[o++] = xRanges[i].min;
			f64[o++] = xRanges[i].max;
		}
		for (let i = 0; i < yCount; i++) {
			f64[o++] = yRanges[i].min;
			f64[o++] = yRanges[i].max;
		}
		Atomics.add(i32, SEQ, 1); // even: stable
	}
}

export class ViewportReader {
	private i32: Int32Array;
	private f64: Float64Array;
	private lastSeq = 0;

	constructor(buffer: SharedArrayBuffer | ArrayBuffer) {
		this.i32 = new Int32Array(buffer, 0, HEADER_I32);
		this.f64 = new Float64Array(buffer, FLOATS_OFFSET_BYTES, MAX_AXES * 4);
	}

	/**
	 * Copies the latest consistent snapshot into `out`. Returns false when
	 * nothing new was published or a write raced this read (retry next frame).
	 */
	read(out: ViewportSnapshot): boolean {
		const { i32, f64 } = this;
		const s1 = Atomics.load(i32, SEQ);
		if ((s1 & 1) === 1 || s1 === this.lastSeq) return false;
		out.version = i32[VERSION];
		out.interacting = i32[INTERACTING] === 1;
		out.xCount = i32[X_COUNT];
		out.yCount = i32[Y_COUNT];
		const n = (out.xCount + out.yCount) * 2;
		for (let i = 0; i < n; i++) out.ranges[i] = f64[i];
		if (Atomics.load(i32, SEQ) !== s1) return false;
		this.lastSeq = s1;
		return true;
	}
}
