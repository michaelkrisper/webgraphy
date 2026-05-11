import React, {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { hexToRgba } from "../../utils/colors";
import { getColumnIndex } from "../../utils/columns";

const VERTEX_SHADER_SOURCE = `
      // === VERTEX SHADER ===
      attribute float a_x;
      attribute float a_y;
      attribute vec2 a_other;
      attribute float a_t;
      attribute float a_dist_start;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      uniform float u_dpr;
      uniform bool u_is_screen_space;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;

      vec2 toScreen(vec2 pos) {
        float x = pos.x * u_x_scale_offset.x + u_x_scale_offset.y;
        float y = pos.y * u_y_scale_offset.x + u_y_scale_offset.y;
        return vec2(x, y);
      }

      void main() {
        vec2 p;
        if (u_is_screen_space) {
          p = vec2(a_x, a_y); // Already scaled by dpr in the buffer
        } else {
          p = toScreen(vec2(a_x, a_y));
        }
        vec2 other;
        if (u_is_screen_space) {
          other = vec2(a_other.x, a_other.y);
        } else {
          other = toScreen(a_other);
        }
        v_t = a_t;
        v_len = length(other - p);
        v_dist_start = a_dist_start;
        
        // Correctly map screen pixels (0=top, res.y=bottom) to clip space (-1 to 1)
        // x: [0, res.x] -> [-1, 1]  => (x / res.x * 2.0) - 1.0
        // y: [0, res.y] -> [1, -1]  => 1.0 - (y / res.y * 2.0)
        gl_Position = vec4((p.x / u_resolution.x * 2.0) - 1.0, 1.0 - (p.y / u_resolution.y * 2.0), 0, 1);
        gl_PointSize = u_point_size;
      }
`;

const FRAGMENT_SHADER_SOURCE = `
      // === FRAGMENT SHADER ===
      precision highp float;
      varying highp float v_t;
      varying highp float v_len;
      varying highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;
      uniform float u_point_size;

      void drawCircle() {
        vec2 p = (gl_PointCoord - 0.5) * u_point_size;
        float r = length(p);
        float halfSize = 0.5 * u_point_size;
        float dOut = r - halfSize;
        float a = 1.0 - smoothstep(-0.5, 0.5, dOut);
        if (a <= 0.0) discard;
        float alpha = u_color.a * a;
        gl_FragColor = vec4(u_color.rgb * alpha, alpha);
      }

      void drawSquare() {
        // Work in device pixels for crisp axis-aligned AA.
        vec2 p = (gl_PointCoord - 0.5) * u_point_size;
        vec2 ap = abs(p);
        float halfSize = 0.5 * u_point_size;
        // Signed distance to outer edge (negative inside)
        float dOut = max(ap.x, ap.y) - halfSize;
        float a = 1.0 - smoothstep(-0.5, 0.5, dOut);
        if (a <= 0.0) discard;
        float alpha = u_color.a * a;
        gl_FragColor = vec4(u_color.rgb * alpha, alpha);
      }

      void drawCross() {
        vec2 p = gl_PointCoord - 0.5;
        // Stroke half-width: at least 1px in point-coord space, scaled with size
        float t = max(0.15, 1.5 / max(u_point_size, 2.0));
        if (abs(p.x - p.y) > t && abs(p.x + p.y) > t) discard;
        gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawLineSegment() {
        if (u_line_style > 0) {
          float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
          float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
          float total = (dashLen + gapLen) * u_dpr;
          float dist = mod(v_dist_start + mod(v_t * v_len, total), total);
          if (dist > dashLen * u_dpr) discard;
        }
        gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawSolid() {
        gl_FragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void main() {
        if (u_style == 0) {
          drawCircle();
        } else if (u_style == 1) {
          drawSquare();
        } else if (u_style == 2) {
          drawCross();
        } else if (u_style == 3) {
          drawSolid();
        } else {
          drawLineSegment();
        }
      }
`;

interface WebGLLocations {
	xLoc: number;
	yLoc: number;
	otherLoc: number;
	tLoc: number;
	distStartLoc: number;
	xScaleOffLoc: WebGLUniformLocation | null;
	yScaleOffLoc: WebGLUniformLocation | null;
	padLoc: WebGLUniformLocation | null;
	resLoc: WebGLUniformLocation | null;
	colorLoc: WebGLUniformLocation | null;
	styleLoc: WebGLUniformLocation | null;
	lineStyleLoc: WebGLUniformLocation | null;
	dprLoc: WebGLUniformLocation | null;
	sizeLoc: WebGLUniformLocation | null;
	screenSpaceLoc: WebGLUniformLocation | null; // kept for shader compatibility
}

interface Props {
	datasets: Dataset[];
	series: SeriesConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	isInteracting?: boolean;
	highlightedSeriesId?: string | null;
	plotBg: string;
}

export interface WebGLRendererHandle {
	redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => void;
}

/**
 * WebGLRenderer Component (v0.5.2 - Optimized Lifecycle & Stable Initialization)
 */
export const WebGLRenderer = React.memo(
	forwardRef<WebGLRendererHandle, Props>((props, ref) => {
		const {
			datasets,
			series,
			xAxes,
			yAxes,
			width,
			height,
			padding,
			isInteracting = false,
			highlightedSeriesId,
			plotBg,
		} = props;

		const canvasRef = useRef<HTMLCanvasElement>(null);
		const glRef = useRef<WebGLRenderingContext | null>(null);
		const programRef = useRef<WebGLProgram | null>(null);
		const locationsRef = useRef<WebGLLocations | null>(null);
		const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
		const m4OutsRef = useRef<Map<string, { x: Float32Array; y: Float32Array }>>(
			new Map(),
		);
		const scratchXRef = useRef<Float32Array | null>(null);
		const scratchYRef = useRef<Float32Array | null>(null);
		const segParamsRef = useRef<Map<string, string>>(new Map());
		const monoCacheRef = useRef<WeakMap<Float32Array, boolean>>(new WeakMap());
		// Adaptive decimation: tracks last frame time and adjusts pixel budget multiplier.
		// Budget scales down when rendering is slow, up when there is headroom.
		const pixelBudgetMultRef = useRef<number>(64);
		const frameTimeRef = useRef<number>(0);
		const lastBudgetUpdateRef = useRef<number>(0);
		const liveXAxesRef = useRef<XAxisConfig[]>(xAxes);
		const liveYAxesRef = useRef<YAxisConfig[]>(yAxes);
		const drawFrameRef = useRef<
			((xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => void) | null
		>(null);

		// Sync props to ref for use in drawFrame without closure issues
		const propsRef = useRef(props);
		useEffect(() => {
			propsRef.current = props;
		}, [props]);

		const previewColor = useGraphStore((state) => state.previewColor);

		useImperativeHandle(
			ref,
			() => ({
				redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => {
					liveXAxesRef.current = xAxes;
					liveYAxesRef.current = yAxes;
					drawFrameRef.current?.(xAxes, yAxes);
				},
			}),
			[],
		);

		// Synchronous Initialization
		useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			const gl = canvas.getContext("webgl", {
				preserveDrawingBuffer: true,
				antialias: true,
				alpha: true,
			});
			if (!gl) return;
			glRef.current = gl;

			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

			const vs = gl.createShader(gl.VERTEX_SHADER)!;
			gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
			gl.compileShader(vs);
			if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
				console.error("VS Error:", gl.getShaderInfoLog(vs));
				return;
			}

			const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
			gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
			gl.compileShader(fs);
			if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
				console.error("FS Error:", gl.getShaderInfoLog(fs));
				return;
			}

			const pg = gl.createProgram()!;
			gl.attachShader(pg, vs);
			gl.attachShader(pg, fs);
			gl.linkProgram(pg);
			if (!gl.getProgramParameter(pg, gl.LINK_STATUS)) {
				console.error("Link Error:", gl.getProgramInfoLog(pg));
				return;
			}
			programRef.current = pg;

			locationsRef.current = {
				xScaleOffLoc: gl.getUniformLocation(pg, "u_x_scale_offset"),
				yScaleOffLoc: gl.getUniformLocation(pg, "u_y_scale_offset"),
				padLoc: gl.getUniformLocation(pg, "u_padding"),
				resLoc: gl.getUniformLocation(pg, "u_resolution"),
				colorLoc: gl.getUniformLocation(pg, "u_color"),
				styleLoc: gl.getUniformLocation(pg, "u_style"),
				lineStyleLoc: gl.getUniformLocation(pg, "u_line_style"),
				dprLoc: gl.getUniformLocation(pg, "u_dpr"),
				sizeLoc: gl.getUniformLocation(pg, "u_point_size"),
				screenSpaceLoc: gl.getUniformLocation(pg, "u_is_screen_space"),
				xLoc: gl.getAttribLocation(pg, "a_x"),
				yLoc: gl.getAttribLocation(pg, "a_y"),
				otherLoc: gl.getAttribLocation(pg, "a_other"),
				tLoc: gl.getAttribLocation(pg, "a_t"),
				distStartLoc: gl.getAttribLocation(pg, "a_dist_start"),
			};

			// Trigger initial draw
			if (drawFrameRef.current) {
				drawFrameRef.current(liveXAxesRef.current, liveYAxesRef.current);
			}
		}, []);

		useEffect(() => {
			const gl = glRef.current;
			if (!gl) return;
			buffersRef.current.forEach((buf) => {
				gl.deleteBuffer(buf);
			});
			buffersRef.current.clear();
			segParamsRef.current.clear();
		}, []);

		const seriesMetadata = useMemo(() => {
			const datasetsById = new Map<string, Dataset>();
			datasets.forEach((d) => {
				datasetsById.set(d.id, d);
			});

			return series
				.map((s) => {
					const ds = datasetsById.get(s.sourceId);
					if (!ds) return null;

					const xIdx = getColumnIndex(ds, ds.xAxisColumn);
					const yIdx = getColumnIndex(ds, s.yColumn);

					if (xIdx === -1 || yIdx === -1) {
						return null;
					}

					const isPreviewed = previewColor?.seriesId === s.id;
					const effectiveLineColor = isPreviewed
						? previewColor.color
						: s.lineColor;
					const effectivePointColor = isPreviewed
						? previewColor.color
						: s.pointColor;

					return {
						series: s,
						ds,
						xIdx,
						yIdx,
						lineColorRgba: hexToRgba(effectiveLineColor),
						pointColorRgba: hexToRgba(effectivePointColor),
					};
				})
				.filter(Boolean) as {
				series: SeriesConfig;
				ds: Dataset;
				xIdx: number;
				yIdx: number;
				lineColorRgba: number[];
				pointColorRgba: number[];
			}[];
		}, [datasets, series, previewColor]);

		useEffect(() => {
			liveXAxesRef.current = xAxes;
			liveYAxesRef.current = yAxes;
		}, [xAxes, yAxes]);

		useEffect(() => {
			const gl = glRef.current;
			if (!gl || !programRef.current || !locationsRef.current) return;

			const drawFrame = (
				currentXAxes: XAxisConfig[],
				currentYAxes: YAxisConfig[],
			) => {
				const pg = programRef.current;
				const locs = locationsRef.current;
				if (!pg || !locs) return;

				// Use latest props from ref to avoid stale closures
				const { width, height, padding, highlightedSeriesId } =
					propsRef.current;
				const xAxesById = new Map<string, XAxisConfig>();
				currentXAxes.forEach((a) => {
					xAxesById.set(a.id, a);
				});
				const yAxesById = new Map<string, YAxisConfig>();
				currentYAxes.forEach((a) => {
					yAxesById.set(a.id, a);
				});

				const chartWidth = width - padding.left - padding.right;
				const chartHeight = height - padding.top - padding.bottom;
				if (chartWidth <= 0 || chartHeight <= 0) return;

				const dpr = window.devicePixelRatio || 1;
				const pw = width * dpr,
					ph = height * dpr;

				gl.viewport(0, 0, pw, ph);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				gl.useProgram(pg);
				gl.uniform4f(
					locs.padLoc,
					padding.top * dpr,
					padding.right * dpr,
					padding.bottom * dpr,
					padding.left * dpr,
				);
				gl.uniform2f(locs.resLoc, pw, ph);
				gl.uniform1f(locs.dprLoc, dpr);

				// Data Rendering (with scissor)
				gl.uniform1i(locs.screenSpaceLoc, 0);
				gl.enable(gl.SCISSOR_TEST);
				gl.scissor(
					padding.left * dpr,
					padding.bottom * dpr,
					chartWidth * dpr,
					chartHeight * dpr,
				);

				const t0 = performance.now();
				seriesMetadata.forEach(
					({ series: s, ds, xIdx, yIdx, lineColorRgba, pointColorRgba }) => {
						const xAxis = xAxesById.get(ds.xAxisId || "axis-1");
						const yAxis = yAxesById.get(s.yAxisId);
						if (!xAxis || !yAxis) return;

						if (s.hidden) return;
						const colX = ds.data[xIdx];
						const colY = ds.data[yIdx];
						if (!colX || !colY) return;

						const xData = colX.data;
						const yData = colY.data;
						const xRef = colX.refPoint;

						const xRange = xAxis.max - xAxis.min || 1;
						const yRange = yAxis.max - yAxis.min || 1;

						// Pixel-anchored M4: 1 bucket per device pixel, tied to world-X (xAxis.min..max).
						// Bucket boundaries don't shift with slice length, so extrema stay stable under zoom.
						// Binary-search requires globally monotonic X. If column has internal drops
						// (e.g. concatenated groups), fall back to scanning the full array —
						// the per-segment loop below splits at xDrop and handles each correctly.
						const xDataLen = xData.length;
						let isMonotonic = monoCacheRef.current.get(xData);
						if (isMonotonic === undefined) {
							isMonotonic = true;
							for (let i = 1; i < xDataLen; i++) {
								if (xData[i] < xData[i - 1]) {
									isMonotonic = false;
									break;
								}
							}
							monoCacheRef.current.set(xData, isMonotonic);
						}
						let rawStart = 0,
							rawEnd = xData.length - 1;
						{
							let lo = 0,
								hi = xData.length - 1;
							while (lo <= hi) {
								const m = (lo + hi) >>> 1;
								if (xData[m] + xRef <= xAxis.min) {
									rawStart = m;
									lo = m + 1;
								} else hi = m - 1;
							}
						}
						{
							let lo = 0,
								hi = xData.length - 1;
							while (lo <= hi) {
								const m = (lo + hi) >>> 1;
								if (xData[m] + xRef >= xAxis.max) {
									rawEnd = m;
									hi = m - 1;
								} else lo = m + 1;
							}
						}
						const sliceStart = isMonotonic
							? Math.max(0, rawStart > 0 ? rawStart - 1 : 0)
							: 0;
						const sliceEnd = isMonotonic
							? Math.min(
									xDataLen - 1,
									rawEnd < xDataLen - 1 ? rawEnd + 1 : rawEnd,
								)
							: xDataLen - 1;

						// M4-decimate the visible slice; m4Float32 passes through when sliceLen <= pixelBudget
						const sliceX = xData.subarray(sliceStart, sliceEnd + 1);
						const sliceY = yData.subarray(sliceStart, sliceEnd + 1);
						const sliceLen2 = sliceX.length;

						// Find contiguous non-NaN, monotonically-increasing-X segments
						const rawSegments: { start: number; end: number }[] = [];
						{
							let segStart = -1;
							for (let i = 0; i <= sliceLen2; i++) {
								const nan = i === sliceLen2 || Number.isNaN(sliceY[i]);
								const xDrop =
									!nan && i > 0 && segStart !== -1 && sliceX[i] < sliceX[i - 1];
								const break_ = nan || xDrop;
								if (!break_ && segStart === -1) segStart = i;
								else if (break_ && segStart !== -1) {
									rawSegments.push({ start: segStart, end: i - 1 });
									segStart = -1;
									if (xDrop && !nan) segStart = i; // start new segment at current point
								}
							}
						}

						// Decimate each segment independently so NaN gaps are preserved
						let m4Out = m4OutsRef.current.get(s.id);
						if (!m4Out) {
							m4Out = { x: new Float32Array(0), y: new Float32Array(0) };
							m4OutsRef.current.set(s.id, m4Out);
						}

						// Build final draw data: array of {x, y} per segment (decimated or raw)
						const drawSegments: { x: Float32Array; y: Float32Array }[] = [];
						let totalDrawCount = 0;
						for (const { start, end } of rawSegments) {
							const segLen = end - start + 1;
							const segX = sliceX.subarray(start, end + 1);
							const segY = sliceY.subarray(start, end + 1);
							drawSegments.push({ x: segX, y: segY });
							totalDrawCount += segLen;
						}

						// Flatten all segments into a single buffer separated by NaN sentinels
						const reqLen =
							totalDrawCount + Math.max(0, drawSegments.length - 1);
						let flatX = scratchXRef.current;
						let flatY = scratchYRef.current;
						if (!flatX || !flatY || flatX.length < reqLen) {
							const newCap = Math.max(reqLen, (flatX?.length || 0) * 2 || 1024);
							flatX = new Float32Array(newCap);
							flatY = new Float32Array(newCap);
							scratchXRef.current = flatX;
							scratchYRef.current = flatY;
						}
						// Track per-segment offsets for multi-draw
						const drawRanges: { start: number; count: number }[] = [];
						let offset = 0;
						for (const seg of drawSegments) {
							drawRanges.push({ start: offset, count: seg.x.length });
							flatX.set(seg.x, offset);
							flatY.set(seg.y, offset);
							offset += seg.x.length + 1; // +1 gap (NaN sentinel, unused in GPU)
						}

						const drawCount = reqLen;

						const xScaleVal = (chartWidth * dpr) / xRange;
						const xOffsetVal =
							padding.left * dpr - (xAxis.min - xRef) * xScaleVal;
						const yScaleVal =
							(padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
						const yOffsetVal =
							(height - padding.bottom) * dpr -
							(yAxis.min - colY.refPoint) * yScaleVal;

						// Upload to a per-series dynamic buffer (STREAM_DRAW — changes every frame when zooming)
						const dynXKey = `dyn-x-${ds.id}-${xIdx}-${yIdx}`;
						const dynYKey = `dyn-y-${ds.id}-${xIdx}-${yIdx}`;
						let xBuffer = buffersRef.current.get(dynXKey);
						if (!xBuffer) {
							xBuffer = gl.createBuffer()!;
							buffersRef.current.set(dynXKey, xBuffer);
						}
						let yBuffer = buffersRef.current.get(dynYKey);
						if (!yBuffer) {
							yBuffer = gl.createBuffer()!;
							buffersRef.current.set(dynYKey, yBuffer);
						}

						gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
						gl.bufferData(
							gl.ARRAY_BUFFER,
							flatX.subarray(0, drawCount),
							gl.STREAM_DRAW,
						);
						gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
						gl.bufferData(
							gl.ARRAY_BUFFER,
							flatY.subarray(0, drawCount),
							gl.STREAM_DRAW,
						);

						gl.uniform2f(locs.xScaleOffLoc, xScaleVal, xOffsetVal);
						gl.uniform2f(locs.yScaleOffLoc, yScaleVal, yOffsetVal);

						const isHighlighted = highlightedSeriesId === s.id;
						const baseLineWidth = isHighlighted ? 2.5 : 1;

						if (s.lineStyle !== "none") {
							const c = lineColorRgba;
							gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
							gl.uniform1f(locs.sizeLoc, (isHighlighted ? 2.5 : 1.5) * dpr);
							const lStyle =
								s.lineStyle === "solid" ? 0 : s.lineStyle === "dashed" ? 1 : 2;
							gl.uniform1i(locs.lineStyleLoc, lStyle);
							gl.uniform1i(locs.styleLoc, -1);

							if (lStyle === 0) {
								gl.disableVertexAttribArray(locs.otherLoc);
								gl.vertexAttrib2f(locs.otherLoc, 0, 0);
								gl.disableVertexAttribArray(locs.tLoc);
								gl.vertexAttrib1f(locs.tLoc, 0);
								gl.disableVertexAttribArray(locs.distStartLoc);
								gl.vertexAttrib1f(locs.distStartLoc, 0);

								gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
								gl.enableVertexAttribArray(locs.xLoc);
								gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);

								gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
								gl.enableVertexAttribArray(locs.yLoc);
								gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);

								gl.lineWidth(baseLineWidth);
								for (const seg of drawRanges) {
									if (seg.count >= 2)
										gl.drawArrays(gl.LINE_STRIP, seg.start, seg.count);
								}
							} else {
								const segBufferKey = `seg-${ds.id}-${xIdx}-${yIdx}-dyn`;
								const paramKey = `${xAxis.min}-${xAxis.max}-${yAxis.min}-${yAxis.max}-${chartWidth}-${chartHeight}-${dpr}-${drawCount}`;
								let segBuffer = buffersRef.current.get(segBufferKey);
								if (!segBuffer) {
									segBuffer = gl.createBuffer()!;
									buffersRef.current.set(segBufferKey, segBuffer);
								}

								// Count total line segments across all draw segments (skip gaps)
								let totalLineSegs = 0;
								for (const seg of drawSegments)
									totalLineSegs += Math.max(0, seg.x.length - 1);

								if (segParamsRef.current.get(segBufferKey) !== paramKey) {
									const sharedArr = new Float32Array(totalLineSegs * 12);
									const pChartWidth = chartWidth * dpr;
									const pChartHeight = chartHeight * dpr;
									const dashLen = (lStyle === 1 ? 8.0 : 2.0) * dpr;
									const gapLen = (lStyle === 1 ? 6.0 : 4.0) * dpr;
									const period = dashLen + gapLen;
									const scaleX = pChartWidth / xRange;
									const scaleY = pChartHeight / yRange;

									let outIdx = 0;
									for (const seg of drawSegments) {
										let cumDist = 0;
										let ax = seg.x[0];
										let ay = seg.y[0];
										const n = seg.x.length - 1;
										for (let i = 0; i < n; i++) {
											const bx = seg.x[i + 1];
											const by = seg.y[i + 1];
											const screenDx = (bx - ax) * scaleX;
											const screenDy = (by - ay) * scaleY;
											const segScreenLen = Math.sqrt(
												screenDx * screenDx + screenDy * screenDy,
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
											cumDist += segScreenLen;
											if (cumDist >= period) cumDist %= period;
											ax = bx;
											ay = by;
											outIdx++;
										}
									}
									gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
									gl.bufferData(gl.ARRAY_BUFFER, sharedArr, gl.STREAM_DRAW);
									segParamsRef.current.set(segBufferKey, paramKey);
								} else {
									gl.bindBuffer(gl.ARRAY_BUFFER, segBuffer);
								}

								gl.enableVertexAttribArray(locs.xLoc);
								gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 24, 0);
								gl.enableVertexAttribArray(locs.yLoc);
								gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 24, 4);
								gl.enableVertexAttribArray(locs.otherLoc);
								gl.vertexAttribPointer(
									locs.otherLoc,
									2,
									gl.FLOAT,
									false,
									24,
									8,
								);
								gl.enableVertexAttribArray(locs.tLoc);
								gl.vertexAttribPointer(locs.tLoc, 1, gl.FLOAT, false, 24, 16);
								gl.enableVertexAttribArray(locs.distStartLoc);
								gl.vertexAttribPointer(
									locs.distStartLoc,
									1,
									gl.FLOAT,
									false,
									24,
									20,
								);

								gl.lineWidth(baseLineWidth);
								gl.drawArrays(gl.LINES, 0, totalLineSegs * 2);
							}
						}

						if (s.pointStyle !== "none") {
							const c = pointColorRgba;
							const baseSize = (isHighlighted ? 8.0 : 6.0) * dpr;
							const pStyle =
								s.pointStyle === "circle"
									? 0
									: s.pointStyle === "square"
										? 1
										: 2;
							gl.uniform1i(locs.styleLoc, pStyle);

							gl.disableVertexAttribArray(locs.otherLoc);
							gl.vertexAttrib2f(locs.otherLoc, 0, 0);
							gl.disableVertexAttribArray(locs.tLoc);
							gl.vertexAttrib1f(locs.tLoc, 0);
							gl.disableVertexAttribArray(locs.distStartLoc);
							gl.vertexAttrib1f(locs.distStartLoc, 0);

							gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
							gl.enableVertexAttribArray(locs.xLoc);
							gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 0, 0);

							gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
							gl.enableVertexAttribArray(locs.yLoc);
							gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 0, 0);

							// Pass 1: Borders — use plot background color like crosshair dots
							const bg = hexToRgba(plotBg ?? "#ffffff");
							gl.uniform4f(locs.colorLoc, bg[0], bg[1], bg[2], 1.0);
							// Slightly larger size for border pass
							gl.uniform1f(
								locs.sizeLoc,
								baseSize + (pStyle === 2 ? 3.0 : 2.0) * dpr,
							);
							for (const seg of drawRanges) {
								if (seg.count >= 1)
									gl.drawArrays(gl.POINTS, seg.start, seg.count);
							}

							// Pass 2: Centers
							gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
							gl.uniform1f(locs.sizeLoc, baseSize);
							for (const seg of drawRanges) {
								if (seg.count >= 1)
									gl.drawArrays(gl.POINTS, seg.start, seg.count);
							}
						}
					},
				);
				gl.disable(gl.SCISSOR_TEST);

				// Adaptive pixel budget: scale down when slow, scale up when there is headroom.
				// TARGET_MS = 20 (~50 fps) — only throttle on visible stutter. Clamp multiplier to [8, 64].
				// Budget update throttled to ~30 Hz (every 33 ms) to avoid rapid oscillation.
				const TARGET_MS = 20;
				const BUDGET_UPDATE_INTERVAL = 33;
				const now = performance.now();
				frameTimeRef.current = now - t0;
				if (now - lastBudgetUpdateRef.current >= BUDGET_UPDATE_INTERVAL) {
					lastBudgetUpdateRef.current = now;
					if (frameTimeRef.current > TARGET_MS) {
						pixelBudgetMultRef.current = Math.max(
							32,
							pixelBudgetMultRef.current * 0.8,
						);
					} else if (frameTimeRef.current < TARGET_MS * 0.5) {
						pixelBudgetMultRef.current = Math.min(
							64,
							pixelBudgetMultRef.current * 1.2,
						);
					}
				}
			};

			drawFrameRef.current = drawFrame;
			if (!isInteracting) {
				drawFrame(liveXAxesRef.current, liveYAxesRef.current);
			}
		}, [seriesMetadata, isInteracting, highlightedSeriesId, plotBg]);

		// Redraw when dimensions or padding change
		useEffect(() => {
			if (!isInteracting && drawFrameRef.current) {
				drawFrameRef.current(liveXAxesRef.current, liveYAxesRef.current);
			}
		}, [width, height, padding, isInteracting]);

		// After interaction ends: debounce-redraw at full quality (max pixel budget).
		useEffect(() => {
			if (isInteracting) return;
			const id = setTimeout(() => {
				pixelBudgetMultRef.current = 64;
				drawFrameRef.current?.(liveXAxesRef.current, liveYAxesRef.current);
			}, 0);
			return () => clearTimeout(id);
		}, [isInteracting]);

		const dpr = window.devicePixelRatio || 1;
		return (
			<canvas
				ref={canvasRef}
				width={width * dpr}
				height={height * dpr}
				style={{ display: "block", width: "100%", height: "100%" }}
			/>
		);
	}),
);
