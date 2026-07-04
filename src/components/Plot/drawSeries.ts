/**
 * Pure draw helpers for the WebGL renderer core.
 *
 * `drawOverlay` renders the background / grid / spines / ticks group buffer
 * prepared via `buildOverlay`. `drawSeriesLines` renders series lines as
 * instanced triangle capsules: each segment is expanded to a screen-space
 * quad in the vertex shader (six vertices per instance via `gl_VertexID`)
 * and shaded with a capsule SDF, which gives antialiasing, real stroke
 * widths, round joins, and dash patterns. Native `gl.LINES`/`LINE_STRIP` is
 * only used for 1px overlay primitives — driver line width is capped at 1px
 * on most platforms (ANGLE/D3D, core profiles), so series lines never go
 * through it. `drawSeriesPoints` renders markers via `gl.POINTS`; line and
 * point decimation share the M4 cache logic in `getOrComputeM4`.
 */

import { findFirstGE, findLastLE } from "../../utils/binarySearch";
import { m4ByXFloat32 } from "../../utils/decimation";
import type { GLStateCache } from "./GLStateCache";

export interface OverlayState {
	packed: Float32Array;
	packedLen: number;
	groups: Array<{
		topology: "LINES" | "TRIANGLES";
		rgba: [number, number, number, number];
		width: number;
		offset: number;
		count: number;
	}>;
}

interface DecimEntry {
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

/**
 * Decimation results keyed by yData identity, then xData identity — two
 * series sharing a y column but different x columns must not evict each
 * other's entry every frame.
 */
export type DecimCache = WeakMap<
	Float32Array,
	WeakMap<Float32Array, DecimEntry>
>;

export interface SegParams {
	xRange: number;
	yRange: number;
	chartWidth: number;
	chartHeight: number;
	dpr: number;
	totalLineSegs: number;
	rangesLen: number;
	firstStart: number;
}

interface DrawRange {
	start: number;
	count: number;
}

export interface SeriesDrawBundle {
	xData: Float32Array;
	yData: Float32Array;
	xRef: number;
	yRef: number;
	xAxisMin: number;
	xAxisMax: number;
	xRange: number;
	yRange: number;
	chartWidth: number;
	chartHeight: number;
	padding: { top: number; right: number; bottom: number; left: number };
	height: number;
	dpr: number;
	// Data → device-px transform, shared by both programs.
	xScale: number;
	xOff: number;
	yScale: number;
	yOff: number;
	lineColorRgba: number[];
	pointColorRgba: number[];
	plotBgRgba: number[];
	isHighlighted: boolean;
	isMonotonic: boolean;
	cachedSegments: { start: number; end: number }[];
	drawRanges: DrawRange[];
	xBuffer: WebGLBuffer;
	yBuffer: WebGLBuffer;
	sliceStart: number;
	sliceEnd: number;
	lineStyle: "solid" | "dashed" | "dotted" | "none";
	pointStyle: "circle" | "square" | "cross" | "none";
}

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
	let entry = byX.get(xData);
	if (
		entry &&
		entry.bucketWidth === bucketWidth &&
		entry.xRef === xRef &&
		entry.qMin <= xAxisMin &&
		entry.qMax >= xAxisMax
	) {
		return entry;
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

	let xBuf = entry?.xBuf ?? null;
	let yBuf = entry?.yBuf ?? null;
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
	entry = {
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
	byX.set(xData, entry);
	return entry;
}

export function drawOverlay(
	st: GLStateCache,
	overlay: OverlayState,
	overlayBuf: WebGLBuffer,
): void {
	const { gl, locs } = st;
	if (overlay.packedLen <= 0 || overlay.groups.length === 0) return;

	st.useMain();
	st.setScreenSpace(1);
	st.setStyle(3);
	st.setLineStyle(0);
	st.disableAttribConst2(locs.otherLoc, 0, 0);
	st.disableAttribConst1(locs.tLoc, 0);
	st.disableAttribConst1(locs.distStartLoc, 0);

	gl.bindBuffer(gl.ARRAY_BUFFER, overlayBuf);
	gl.bufferData(
		gl.ARRAY_BUFFER,
		overlay.packed.subarray(0, overlay.packedLen),
		gl.STREAM_DRAW,
	);
	st.enableAttrib(locs.xLoc);
	gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 8, 0);
	st.enableAttrib(locs.yLoc);
	gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 8, 4);

	for (const grp of overlay.groups) {
		if (grp.count === 0) continue;
		const c = grp.rgba;
		st.setColor(c[0], c[1], c[2], c[3]);
		if (grp.topology === "LINES") {
			st.setLineWidth(grp.width);
			gl.drawArrays(gl.LINES, grp.offset, grp.count);
		} else {
			gl.drawArrays(gl.TRIANGLES, grp.offset, grp.count);
		}
	}
}

/**
 * Bind consecutive column samples as per-instance segment endpoints: with a
 * 4-byte stride and divisor 1, instance `i` reads `data[start + i]` for the
 * segment start and `data[start + i + 1]` for the end — no geometry buffer
 * is built; the raw column buffers are read twice at a one-float offset.
 */
function bindColumnSegments(
	st: GLStateCache,
	xBuf: WebGLBuffer,
	yBuf: WebGLBuffer,
	startIndex: number,
): void {
	const { gl } = st;
	const lineLocs = st.lineLocs;
	if (!lineLocs) return;
	const byteOff = startIndex * 4;
	gl.bindBuffer(gl.ARRAY_BUFFER, xBuf);
	st.enableAttrib(lineLocs.x0Loc, 1);
	gl.vertexAttribPointer(lineLocs.x0Loc, 1, gl.FLOAT, false, 4, byteOff);
	st.enableAttrib(lineLocs.x1Loc, 1);
	gl.vertexAttribPointer(lineLocs.x1Loc, 1, gl.FLOAT, false, 4, byteOff + 4);
	gl.bindBuffer(gl.ARRAY_BUFFER, yBuf);
	st.enableAttrib(lineLocs.y0Loc, 1);
	gl.vertexAttribPointer(lineLocs.y0Loc, 1, gl.FLOAT, false, 4, byteOff);
	st.enableAttrib(lineLocs.y1Loc, 1);
	gl.vertexAttribPointer(lineLocs.y1Loc, 1, gl.FLOAT, false, 4, byteOff + 4);
}

function drawDecimatedLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	lineDecimCache: DecimCache,
	scratch: { x: Float32Array; y: Float32Array },
	numBuckets: number,
): void {
	const { gl } = st;
	const entry = getOrComputeM4(
		gl,
		lineDecimCache,
		scratch,
		bundle.xData,
		bundle.yData,
		bundle.xRef,
		bundle.xAxisMin,
		bundle.xAxisMax,
		bundle.xRange,
		numBuckets,
		3,
	);
	if (!entry.xBuf || !entry.yBuf || entry.count < 2) return;

	bindColumnSegments(st, entry.xBuf, entry.yBuf, 0);
	gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, entry.count - 1);
}

function drawPlainLines(st: GLStateCache, bundle: SeriesDrawBundle): void {
	const { gl } = st;
	for (const seg of bundle.drawRanges) {
		if (seg.count < 2) continue;
		bindColumnSegments(st, bundle.xBuffer, bundle.yBuffer, seg.start);
		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, seg.count - 1);
	}
}

// Reusable scratch for per-range step counts. Cleared/resized in place each
// call to avoid allocating a fresh array per dashed-line series per frame.
const STEPS_SCRATCH: number[] = [];

// Floats per dashed-line instance: x0, y0, x1, y1, cumulative start distance.
const DASH_FLOATS = 5;
const DASH_STRIDE = DASH_FLOATS * 4;

function drawDashedLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	segBuffersRef: Map<string, WebGLBuffer>,
	segParamsRef: Map<string, SegParams>,
	segBufferKey: string,
): void {
	const { gl } = st;
	const lineLocs = st.lineLocs;
	if (!lineLocs) return;
	const {
		drawRanges,
		xData,
		yData,
		xRange,
		yRange,
		chartWidth,
		chartHeight,
		dpr,
	} = bundle;
	STEPS_SCRATCH.length = drawRanges.length;
	let totalLineSegs = 0;
	for (let i = 0; i < drawRanges.length; i++) {
		const n = Math.max(0, drawRanges[i].count - 1);
		const step = Math.max(1, Math.floor(n / 4000));
		STEPS_SCRATCH[i] = step;
		totalLineSegs += Math.ceil(n / step);
	}
	if (totalLineSegs === 0) return;
	const rangesLen = drawRanges.length;
	const firstStart = drawRanges[0]?.start ?? 0;
	// Pan = translation (xRange/yRange constant) so cache hits every frame.
	// Zoom changes them, miss is amortized over many frames. Exact === is
	// fine because pan preserves range exactly in floating point.
	const prev = segParamsRef.get(segBufferKey);
	const needsRebuild =
		!prev ||
		prev.xRange !== xRange ||
		prev.yRange !== yRange ||
		prev.chartWidth !== chartWidth ||
		prev.chartHeight !== chartHeight ||
		prev.dpr !== dpr ||
		prev.totalLineSegs !== totalLineSegs ||
		prev.rangesLen !== rangesLen ||
		prev.firstStart !== firstStart;

	let segBuffer = segBuffersRef.get(segBufferKey);
	if (!segBuffer) {
		const b = gl.createBuffer();
		if (!b) return;
		segBuffer = b;
		segBuffersRef.set(segBufferKey, segBuffer);
	}

	if (needsRebuild) {
		const sharedArr = new Float32Array(totalLineSegs * DASH_FLOATS);
		const scaleX = (chartWidth * dpr) / xRange;
		const scaleY = (chartHeight * dpr) / yRange;

		let outIdx = 0;
		for (let rIdx = 0; rIdx < drawRanges.length; rIdx++) {
			const r = drawRanges[rIdx];
			const step = STEPS_SCRATCH[rIdx];
			let cumDist = 0;
			const n = r.count - 1;
			for (let i = 0; i < n; i += step) {
				const ai = r.start + i;
				let bi = ai + step;
				if (bi > r.start + n) bi = r.start + n;

				const ax = xData[ai];
				const ay = yData[ai];
				const bx = xData[bi];
				const by = yData[bi];
				const off = outIdx * DASH_FLOATS;
				sharedArr[off] = ax;
				sharedArr[off + 1] = ay;
				sharedArr[off + 2] = bx;
				sharedArr[off + 3] = by;
				sharedArr[off + 4] = cumDist;
				cumDist += Math.sqrt(
					((bx - ax) * scaleX) ** 2 + ((by - ay) * scaleY) ** 2,
				);
				outIdx++;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sharedArr, gl.STREAM_DRAW);
		segParamsRef.set(segBufferKey, {
			xRange,
			yRange,
			chartWidth,
			chartHeight,
			dpr,
			totalLineSegs,
			rangesLen,
			firstStart,
		});
	} else {
		gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
	}
	st.enableAttrib(lineLocs.x0Loc, 1);
	gl.vertexAttribPointer(lineLocs.x0Loc, 1, gl.FLOAT, false, DASH_STRIDE, 0);
	st.enableAttrib(lineLocs.y0Loc, 1);
	gl.vertexAttribPointer(lineLocs.y0Loc, 1, gl.FLOAT, false, DASH_STRIDE, 4);
	st.enableAttrib(lineLocs.x1Loc, 1);
	gl.vertexAttribPointer(lineLocs.x1Loc, 1, gl.FLOAT, false, DASH_STRIDE, 8);
	st.enableAttrib(lineLocs.y1Loc, 1);
	gl.vertexAttribPointer(lineLocs.y1Loc, 1, gl.FLOAT, false, DASH_STRIDE, 12);
	st.enableAttrib(lineLocs.dist0Loc, 1);
	gl.vertexAttribPointer(
		lineLocs.dist0Loc,
		1,
		gl.FLOAT,
		false,
		DASH_STRIDE,
		16,
	);
	gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, totalLineSegs);
}

export function drawSeriesLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	lineDecimCache: DecimCache,
	lineDecimScratch: { x: Float32Array; y: Float32Array },
	segBuffersRef: Map<string, WebGLBuffer>,
	segParamsRef: Map<string, SegParams>,
	segBufferKey: string,
): void {
	if (bundle.lineStyle === "none") return;
	const lineLocs = st.lineLocs;
	if (!lineLocs) return;

	st.useLine();
	st.lpSetXScaleOff(bundle.xScale, bundle.xOff);
	st.lpSetYScaleOff(bundle.yScale, bundle.yOff);
	const c = bundle.lineColorRgba;
	st.lpSetColor(c[0], c[1], c[2], 1.0);
	st.lpSetWidth((bundle.isHighlighted ? 2.5 : 1.0) * bundle.dpr);

	if (bundle.lineStyle === "solid") {
		st.lpSetDash(0, 0);
		st.disableAttribConst1(lineLocs.dist0Loc, 0);

		// M4 decimation: only when the visible slice is denser than 4 samples
		// per device pixel. Output preserves per-bucket (first,min,max,last) so
		// vertical extrema survive the downsample.
		const chartWidthPx = bundle.chartWidth * bundle.dpr;
		const numBuckets = Math.max(8, Math.ceil(chartWidthPx));
		const visibleCount = bundle.sliceEnd - bundle.sliceStart + 1;
		const useDecim =
			bundle.isMonotonic &&
			bundle.cachedSegments.length === 1 &&
			visibleCount > numBuckets * 4;

		if (useDecim) {
			drawDecimatedLines(
				st,
				bundle,
				lineDecimCache,
				lineDecimScratch,
				numBuckets,
			);
		} else {
			drawPlainLines(st, bundle);
		}
	} else {
		if (bundle.lineStyle === "dashed") {
			st.lpSetDash(8 * bundle.dpr, 6 * bundle.dpr);
		} else {
			st.lpSetDash(2 * bundle.dpr, 4 * bundle.dpr);
		}
		drawDashedLines(st, bundle, segBuffersRef, segParamsRef, segBufferKey);
	}
}

export function drawSeriesPoints(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	pointDecimCache: DecimCache,
	pointDecimScratch: { x: Float32Array; y: Float32Array },
	isInteracting: boolean,
): void {
	if (bundle.pointStyle === "none") return;

	const { gl, locs } = st;
	st.useMain();
	const visibleCount = bundle.sliceEnd - bundle.sliceStart + 1;
	const chartWidthPx = bundle.chartWidth * bundle.dpr;
	const pixelDensity = visibleCount / Math.max(1, chartWidthPx);

	const c = bundle.pointColorRgba;
	const baseSize = (bundle.isHighlighted ? 8.0 : 6.0) * bundle.dpr;
	const pStyle =
		bundle.pointStyle === "circle" ? 0 : bundle.pointStyle === "square" ? 1 : 2;
	st.setStyle(pStyle);

	st.disableAttribConst2(locs.otherLoc, 0, 0);
	st.disableAttribConst1(locs.tLoc, 0);
	st.disableAttribConst1(locs.distStartLoc, 0);

	// M4 point decimation: per X-pixel bucket emit (first,min,max,last) so
	// Y-extrema survive. Only used during interaction (pan/zoom) where the
	// visible density exceeds one sample per device pixel.
	let useDecim = false;
	let decimEntry: DecimEntry | null = null;
	let decimDrawStart = 0;
	let decimDrawCount = 0;
	if (isInteracting && bundle.isMonotonic && pixelDensity > 1) {
		const numBuckets = Math.max(8, Math.ceil(chartWidthPx));
		const entry = getOrComputeM4(
			gl,
			pointDecimCache,
			pointDecimScratch,
			bundle.xData,
			bundle.yData,
			bundle.xRef,
			bundle.xAxisMin,
			bundle.xAxisMax,
			bundle.xRange,
			numBuckets,
			1,
		);
		if (entry.xBuf && entry.yBuf && entry.count >= 1) {
			const xArr = entry.xArr;
			const cnt = entry.count;
			const lowIdx = findLastLE(xArr, bundle.xAxisMin, bundle.xRef, 0);
			const highIdx = findFirstGE(xArr, bundle.xAxisMax, bundle.xRef, cnt - 1);
			const dStart = Math.max(0, lowIdx > 0 ? lowIdx - 1 : 0);
			const dEnd = Math.min(cnt - 1, highIdx < cnt - 1 ? highIdx + 1 : highIdx);
			if (dEnd >= dStart) {
				useDecim = true;
				decimEntry = entry;
				decimDrawStart = dStart;
				decimDrawCount = dEnd - dStart + 1;
			}
		}
	}

	if (useDecim && decimEntry) {
		gl.bindBuffer(gl.ARRAY_BUFFER, decimEntry.xBuf!);
		st.enableAttrib(locs.xLoc);
		gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, decimEntry.yBuf!);
		st.enableAttrib(locs.yLoc);
		gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);
	} else {
		gl.bindBuffer(gl.ARRAY_BUFFER, bundle.xBuffer);
		st.enableAttrib(locs.xLoc);
		gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);
		gl.bindBuffer(gl.ARRAY_BUFFER, bundle.yBuffer);
		st.enableAttrib(locs.yLoc);
		gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);
	}

	const bg = bundle.plotBgRgba;
	st.setColor(bg[0], bg[1], bg[2], 1.0);
	st.setPointSize(baseSize + (pStyle === 2 ? 3.0 : 2.0) * bundle.dpr);
	if (useDecim) {
		gl.drawArrays(gl.POINTS, decimDrawStart, decimDrawCount);
	} else {
		for (const seg of bundle.drawRanges) {
			if (seg.count >= 1) gl.drawArrays(gl.POINTS, seg.start, seg.count);
		}
	}

	st.setColor(c[0], c[1], c[2], 1.0);
	st.setPointSize(baseSize);
	if (useDecim) {
		gl.drawArrays(gl.POINTS, decimDrawStart, decimDrawCount);
	} else {
		for (const seg of bundle.drawRanges) {
			if (seg.count >= 1) gl.drawArrays(gl.POINTS, seg.start, seg.count);
		}
	}
}
