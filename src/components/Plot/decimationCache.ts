import { m4ByXFloat32, m4MergeOctave } from "../../utils/decimation";

export interface DecimEntry {
	// Numeric signature fields — compared directly to avoid per-frame string
	// allocation on cache hits (hot path during pan/zoom).
	bucketWidth: number;
	qMin: number;
	qMax: number;
	xRef: number;
	xArr: Float32Array;
	yArr: Float32Array;
	count: number;
	xBuf: WebGLBuffer | null;
	yBuf: WebGLBuffer | null;
}

export interface DecimSlot {
	/** Entry served most recently (windowed scan or a pyramid level). */
	entry: DecimEntry | null;
	/** Windowed scan result whose GL buffers are re-uploaded in place. */
	windowed: DecimEntry | null;
	/**
	 * Full-span pyramid levels keyed by log2(bucketWidth); their coverage is
	 * infinite so pan/zoom re-entry at that octave never rescans raw data.
	 */
	levels: Map<number, DecimEntry>;
}

/** Levels are ~4 floats per bucket, so this caps memory at a few 100KB. */
export const MAX_PYRAMID_LEVELS = 12;

/**
 * Decimation results keyed by yData identity, then xData identity — two
 * series sharing a y column but different x columns must not evict each
 * other's entry every frame.
 */
export type DecimCache = WeakMap<
	Float32Array,
	WeakMap<Float32Array, DecimSlot>
>;

/**
 * Pixel-anchored M4 decimation with a result cache keyed by column identity.
 * `bucketDivisor = 3` is used for line decimation (sub-pixel buckets keep
 * the polyline visually identical), `1` for point decimation (one bucket per
 * pixel column emits the four extrema).
 *
 * The bucket width is quantized to the next-lower power of two (never coarser
 * than the pixel target). Combined with the world-0 grid anchor this keeps
 * bucket boundaries fixed while xRange varies within an octave, and nests
 * grids across octaves — so the chosen extrema stay put during smooth zoom
 * instead of re-bucketing (and visually jumping) every frame.
 *
 * With `interacting` set, a covering entry whose bucket width is within two
 * octaves of the ideal is served as-is: recomputing M4 over a large window
 * mid-gesture costs tens of ms and causes visible hitches, while a ≤4x
 * coarser grid is at most ~1.3px buckets for line decimation (divisor 3) and
 * a finer grid is exact. The settle redraw runs strict and recomputes.
 */
export function getOrComputeM4(
	gl: WebGL2RenderingContext,
	cache: DecimCache,
	scratch: { x: Float32Array; y: Float32Array },
	xData: Float32Array,
	yData: Float32Array,
	xRef: number,
	xAxisMin: number,
	xAxisMax: number,
	xRange: number,
	numBuckets: number,
	bucketDivisor: number,
	interacting = false,
): DecimEntry {
	// Pad the computed window so panning within ±½ viewport reuses the result.
	const pad = xRange * 0.5;
	const decimMin = xAxisMin - pad;
	const decimMax = xAxisMax + pad;
	// Quantize the window edges to a power-of-two step; qMin/qMax are then
	// exact multiples of bucketWidth, so the grid-start snap in m4 is drift-free.
	const q = 2 ** Math.floor(Math.log2(xRange / 8));
	const qMin = Math.floor(decimMin / q) * q;
	const qMax = Math.ceil(decimMax / q) * q;
	const bucketWidth =
		2 ** Math.floor(Math.log2(xRange / (numBuckets * bucketDivisor)));

	// Reuse the cached result as long as it was computed at the same grid and
	// still covers the visible window — pan and zoom-in within an octave hit;
	// recompute only when the viewport leaves the cached window or the bucket
	// width crosses an octave.
	let byX = cache.get(yData);
	if (!byX) {
		byX = new WeakMap();
		cache.set(yData, byX);
	}
	let slot = byX.get(xData);
	if (!slot) {
		slot = { entry: null, windowed: null, levels: new Map() };
		byX.set(xData, slot);
	}

	const prev = slot.entry;
	if (
		prev &&
		prev.xRef === xRef &&
		prev.qMin <= xAxisMin &&
		prev.qMax >= xAxisMax &&
		(prev.bucketWidth === bucketWidth ||
			(interacting &&
				prev.bucketWidth <= bucketWidth * 4 &&
				prev.bucketWidth >= bucketWidth / 4))
	) {
		return prev;
	}

	// Pyramid level for this octave? Levels cover the full span, so any pan
	// or zoom re-entry at their bucket width is free.
	const levelKey = Math.round(Math.log2(bucketWidth));
	const exact = slot.levels.get(levelKey);
	if (exact && exact.xRef === xRef) {
		slot.entry = exact;
		return exact;
	}
	if (interacting) {
		for (const d of [-1, 1, -2, 2]) {
			const near = slot.levels.get(levelKey + d);
			if (near && near.xRef === xRef) {
				slot.entry = near;
				return near;
			}
		}
	}

	const n = xData.length;
	if (n > 0) {
		// Derive the level by merging up from a stored finer level —
		// O(level size) instead of a raw-data scan (zoom-out fast path).
		for (let k = 1; k <= 3; k++) {
			const finer = slot.levels.get(levelKey - k);
			if (!finer || finer.xRef !== xRef) continue;
			let cur = finer;
			for (let step = levelKey - k + 1; step <= levelKey; step++) {
				const w = 2 ** step;
				const merged = m4MergeOctave(cur.xArr, cur.yArr, xRef, w);
				cur = storePyramidLevel(gl, slot, step, w, xRef, merged.x, merged.y);
			}
			slot.entry = cur;
			return cur;
		}

		// When the requested window already spans most of the data, extend the
		// scan to the full span and keep the result as a pyramid level.
		const spanMin = xData[0] + xRef;
		const spanMax = xData[n - 1] + xRef;
		if (qMax - qMin >= 0.5 * (spanMax - spanMin)) {
			const { x: dx, y: dy } = m4ByXFloat32(
				xData,
				yData,
				xRef,
				spanMin,
				spanMax,
				bucketWidth,
				scratch,
			);
			const level = storePyramidLevel(
				gl,
				slot,
				levelKey,
				bucketWidth,
				xRef,
				dx,
				dy,
			);
			slot.entry = level;
			return level;
		}
	}

	const { x: dx, y: dy } = m4ByXFloat32(
		xData,
		yData,
		xRef,
		qMin,
		qMax,
		bucketWidth,
		scratch,
	);
	// Copy into entry-owned buffers so the cache retains stable arrays;
	// `subarray` returned by m4 shares the underlying scratch buffer.
	const xArr = new Float32Array(dx.length);
	const yArr = new Float32Array(dy.length);
	xArr.set(dx);
	yArr.set(dy);

	let xBuf = slot.windowed?.xBuf ?? null;
	let yBuf = slot.windowed?.yBuf ?? null;
	if (!xBuf) xBuf = gl.createBuffer();
	if (!yBuf) yBuf = gl.createBuffer();
	if (xBuf) {
		gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
		gl.bufferData(gl.ARRAY_BUFFER, xArr, gl.DYNAMIC_DRAW);
	}
	if (yBuf) {
		gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
		gl.bufferData(gl.ARRAY_BUFFER, yArr, gl.DYNAMIC_DRAW);
	}
	const entry: DecimEntry = {
		bucketWidth,
		qMin,
		qMax,
		xRef,
		xArr,
		yArr,
		count: xArr.length,
		xBuf,
		yBuf,
	};
	slot.windowed = entry;
	slot.entry = entry;
	return entry;
}

/**
 * Copy an M4 result into a full-span pyramid level with its own GL buffers
 * and infinite coverage, evicting the finest level when over the cap.
 */
export function storePyramidLevel(
	gl: WebGL2RenderingContext,
	slot: DecimSlot,
	levelKey: number,
	bucketWidth: number,
	xRef: number,
	dx: Float32Array,
	dy: Float32Array,
): DecimEntry {
	const xArr = new Float32Array(dx.length);
	const yArr = new Float32Array(dy.length);
	xArr.set(dx);
	yArr.set(dy);
	const xBuf = gl.createBuffer();
	const yBuf = gl.createBuffer();
	if (xBuf) {
		gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
		gl.bufferData(gl.ARRAY_BUFFER, xArr, gl.DYNAMIC_DRAW);
	}
	if (yBuf) {
		gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
		gl.bufferData(gl.ARRAY_BUFFER, yArr, gl.DYNAMIC_DRAW);
	}
	const level: DecimEntry = {
		bucketWidth,
		qMin: -Infinity,
		qMax: Infinity,
		xRef,
		xArr,
		yArr,
		count: xArr.length,
		xBuf,
		yBuf,
	};
	slot.levels.set(levelKey, level);
	if (slot.levels.size > MAX_PYRAMID_LEVELS) {
		let finest = Infinity;
		for (const key of slot.levels.keys()) if (key < finest) finest = key;
		const evicted = slot.levels.get(finest);
		slot.levels.delete(finest);
		if (evicted) {
			gl.deleteBuffer(evicted.xBuf);
			gl.deleteBuffer(evicted.yBuf);
		}
	}
	return level;
}
