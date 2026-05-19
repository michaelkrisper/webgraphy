/**
 * Pure draw helpers for the WebGL renderer.
 *
 * `drawOverlay` renders the background / grid / spines / ticks group buffer that
 * the WebGLRenderer prepares via `setOverlay`. `drawSeriesLines` and
 * `drawSeriesPoints` render the per-series geometry; both share the M4 cache
 * logic in `getOrComputeM4` (line and point modes only differ in `bucketDivisor`).
 */

import { findFirstGE, findLastLE } from "../../utils/binarySearch";
import { m4ByXFloat32 } from "../../utils/decimation";
import type { GLStateCache, WebGLLocations } from "./GLStateCache";

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

export interface DecimEntry {
	sig: string;
	xArr: Float32Array;
	yArr: Float32Array;
	count: number;
	xBuf: WebGLBuffer | null;
	yBuf: WebGLBuffer | null;
}

export interface DrawRange {
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
 * Pixel-anchored M4 decimation with a result cache keyed by yData identity.
 * `bucketDivisor = 3` is used for line decimation (sub-pixel buckets keep
 * the polyline visually identical), `1` for point decimation (one bucket per
 * pixel column emits the four extrema).
 */
export function getOrComputeM4(
	gl: WebGLRenderingContext,
	cache: WeakMap<Float32Array, DecimEntry>,
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
	// Pad the cached window so panning within ±½ viewport reuses the result.
	const pad = xRange * 0.5;
	const decimMin = xAxisMin - pad;
	const decimMax = xAxisMax + pad;
	// Quantize the cache key to a power-of-two xRange step so wheel zoom
	// rebuilds gracefully while pan-within-window hits the cache.
	const q = 2 ** Math.floor(Math.log2(xRange / 8));
	const qMin = Math.floor(decimMin / q) * q;
	const qMax = Math.ceil(decimMax / q) * q;
	const bucketWidth = xRange / (numBuckets * bucketDivisor);
	const sig = `${bucketWidth}|${qMin}|${qMax}|${xRef}`;

	let entry = cache.get(yData);
	if (entry && entry.sig === sig) return entry;

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
	entry = { sig, xArr, yArr, count: xArr.length, xBuf, yBuf };
	cache.set(yData, entry);
	return entry;
}

export function drawOverlay(
	st: GLStateCache,
	overlay: OverlayState,
	overlayBuf: WebGLBuffer,
): void {
	const { gl, locs } = st;
	if (overlay.packedLen <= 0 || overlay.groups.length === 0) return;

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

function drawDecimatedLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	lineDecimCache: WeakMap<Float32Array, DecimEntry>,
	scratch: { x: Float32Array; y: Float32Array },
	chartWidthPx: number,
	numBuckets: number,
	baseLineWidth: number,
): void {
	const { gl, locs } = st;
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
	void chartWidthPx;

	gl.bindBuffer(gl.ARRAY_BUFFER, entry.xBuf);
	st.enableAttrib(locs.xLoc);
	gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, entry.yBuf);
	st.enableAttrib(locs.yLoc);
	gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);
	st.setLineWidth(baseLineWidth);
	gl.drawArrays(gl.LINE_STRIP, 0, entry.count);
}

function drawPlainLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	baseLineWidth: number,
): void {
	const { gl, locs } = st;
	gl.bindBuffer(gl.ARRAY_BUFFER, bundle.xBuffer);
	st.enableAttrib(locs.xLoc);
	gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);
	gl.bindBuffer(gl.ARRAY_BUFFER, bundle.yBuffer);
	st.enableAttrib(locs.yLoc);
	gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);
	st.setLineWidth(baseLineWidth);
	for (const seg of bundle.drawRanges) {
		if (seg.count >= 2) gl.drawArrays(gl.LINE_STRIP, seg.start, seg.count);
	}
}

function drawDashedLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	lStyle: number,
	baseLineWidth: number,
	segBuffersRef: Map<string, WebGLBuffer>,
	segParamsRef: Map<string, string>,
	segBufferKey: string,
): void {
	const { gl, locs } = st;
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
	const STEPS: number[] = [];
	let totalLineSegs = 0;
	for (const r of drawRanges) {
		const n = Math.max(0, r.count - 1);
		const step = Math.max(1, Math.floor(n / 4000));
		STEPS.push(step);
		totalLineSegs += Math.ceil(n / step);
	}
	// Quantize float ranges so micro pan jitter hits cache.
	// Pan = translation (xRange constant) so cache hits every frame.
	// Zoom changes range slowly; rebuild cost amortized over many frames.
	const qx = xRange.toPrecision(4);
	const qy = yRange.toPrecision(4);
	const paramKey = `${qx}-${qy}-${chartWidth}-${chartHeight}-${dpr}-${totalLineSegs}-${drawRanges.length}-${drawRanges[0]?.start ?? 0}`;

	let segBuffer = segBuffersRef.get(segBufferKey);
	if (!segBuffer) {
		const b = gl.createBuffer();
		if (!b) return;
		segBuffer = b;
		segBuffersRef.set(segBufferKey, segBuffer);
	}

	if (segParamsRef.get(segBufferKey) !== paramKey) {
		const sharedArr = new Float32Array(totalLineSegs * 12);
		const scaleX = (chartWidth * dpr) / xRange;
		const scaleY = (chartHeight * dpr) / yRange;

		let outIdx = 0;
		for (let rIdx = 0; rIdx < drawRanges.length; rIdx++) {
			const r = drawRanges[rIdx];
			const step = STEPS[rIdx];
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
				const sLen = Math.sqrt(
					((bx - ax) * scaleX) ** 2 + ((by - ay) * scaleY) ** 2,
				);
				const off = outIdx * 12;
				sharedArr[off] = ax;
				sharedArr[off + 1] = ay;
				sharedArr[off + 2] = bx;
				sharedArr[off + 3] = by;
				sharedArr[off + 4] = 0;
				sharedArr[off + 5] = cumDist;
				sharedArr[off + 6] = bx;
				sharedArr[off + 7] = by;
				sharedArr[off + 8] = ax;
				sharedArr[off + 9] = ay;
				sharedArr[off + 10] = 1;
				sharedArr[off + 11] = cumDist;
				cumDist += sLen;
				outIdx++;
			}
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
		gl.bufferData(gl.ARRAY_BUFFER, sharedArr, gl.STREAM_DRAW);
		segParamsRef.set(segBufferKey, paramKey);
	} else {
		gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
	}
	void lStyle;
	st.enableAttrib(locs.xLoc);
	gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 24, 0);
	st.enableAttrib(locs.yLoc);
	gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 24, 4);
	st.enableAttrib(locs.otherLoc);
	gl.vertexAttribPointer(locs.otherLoc, 2, gl.FLOAT, false, 24, 8);
	st.enableAttrib(locs.tLoc);
	gl.vertexAttribPointer(locs.tLoc, 1, gl.FLOAT, false, 24, 16);
	st.enableAttrib(locs.distStartLoc);
	gl.vertexAttribPointer(locs.distStartLoc, 1, gl.FLOAT, false, 24, 20);
	st.setLineWidth(baseLineWidth);
	gl.drawArrays(gl.LINES, 0, totalLineSegs * 2);
}

export function drawSeriesLines(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	lineDecimCache: WeakMap<Float32Array, DecimEntry>,
	lineDecimScratch: { x: Float32Array; y: Float32Array },
	segBuffersRef: Map<string, WebGLBuffer>,
	segParamsRef: Map<string, string>,
	segBufferKey: string,
): void {
	if (bundle.lineStyle === "none") return;
	const { locs } = st;
	const c = bundle.lineColorRgba;
	st.setColor(c[0], c[1], c[2], 1.0);
	st.setPointSize((bundle.isHighlighted ? 2.5 : 1.5) * bundle.dpr);
	const lStyle =
		bundle.lineStyle === "solid" ? 0 : bundle.lineStyle === "dashed" ? 1 : 2;
	st.setLineStyle(lStyle);
	st.setStyle(-1);

	const baseLineWidth = bundle.isHighlighted ? 2.5 : 1;

	if (lStyle === 0) {
		st.disableAttribConst2(locs.otherLoc, 0, 0);
		st.disableAttribConst1(locs.tLoc, 0);
		st.disableAttribConst1(locs.distStartLoc, 0);

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
				chartWidthPx,
				numBuckets,
				baseLineWidth,
			);
		} else {
			drawPlainLines(st, bundle, baseLineWidth);
		}
	} else {
		drawDashedLines(
			st,
			bundle,
			lStyle,
			baseLineWidth,
			segBuffersRef,
			segParamsRef,
			segBufferKey,
		);
	}
}

export function drawSeriesPoints(
	st: GLStateCache,
	bundle: SeriesDrawBundle,
	pointDecimCache: WeakMap<Float32Array, DecimEntry>,
	pointDecimScratch: { x: Float32Array; y: Float32Array },
	isInteracting: boolean,
): void {
	if (bundle.pointStyle === "none") return;

	const { gl, locs } = st;
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

export type { WebGLLocations };
