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

export interface OverlayInput {
	xAxes: Array<{
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		categoryLabels?: string[];
	}>;
	yAxes: Array<{
		id: string;
		min: number;
		max: number;
		showGrid: boolean;
		ticks: number[];
		position: "left" | "right";
		categoryLabels?: string[];
	}>;
	xAxesMetrics: Array<{ id: string; cumulativeOffset: number }>;
	axisLayout: Record<string, { total: number; label: number }>;
	leftOffsets: Record<string, number>;
	rightOffsets: Record<string, number>;
	axisColor: string;
	zeroLineColor: string;
	gridColor: string;
	plotBg: string;
}

export interface WebGLRendererHandle {
	redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => void;
	setOverlay: (overlay: OverlayInput) => void;
}

/**
 * WebGLRenderer Component (v0.6.0 - Highly Optimized Draw Loop)
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
			isInteracting = false,
			plotBg,
		} = props;
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const glRef = useRef<WebGLRenderingContext | null>(null);
		const programRef = useRef<WebGLProgram | null>(null);
		const locationsRef = useRef<WebGLLocations | null>(null);
		const buffersRef = useRef<Map<string, WebGLBuffer>>(new Map());
		const segParamsRef = useRef<Map<string, string>>(new Map());
		const segmentCacheRef = useRef<
			WeakMap<Float32Array, { start: number; end: number }[]>
		>(new WeakMap());
		const monoCacheRef = useRef<WeakMap<Float32Array, boolean>>(new WeakMap());
		// Cache GPU buffers keyed by source Float32Array identity (raw column data).
		// Pan/zoom reuses these without re-uploading.
		const columnBufferRef = useRef<WeakMap<Float32Array, WebGLBuffer>>(
			new WeakMap(),
		);
		// Overlay screen-space: one packed Float32Array (x,y pairs) for all primitives.
		// Groups reference offsets/counts into this buffer.
		const overlayRef = useRef<{
			packed: Float32Array; // (x,y) pairs in device pixels
			packedLen: number; // valid floats in packed
			groups: Array<{
				topology: "LINES" | "TRIANGLES";
				rgba: [number, number, number, number];
				width: number;
				offset: number; // vertex offset
				count: number; // vertex count
			}>;
		}>({ packed: new Float32Array(2048), packedLen: 0, groups: [] });

		const pixelBudgetMultRef = useRef<number>(64);
		const frameTimeRef = useRef<number>(0);
		const lastBudgetUpdateRef = useRef<number>(0);
		const liveXAxesRef = useRef<XAxisConfig[]>(xAxes);
		const liveYAxesRef = useRef<YAxisConfig[]>(yAxes);
		const drawFrameRef = useRef<
			((xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => void) | null
		>(null);

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
				setOverlay: (overlay: OverlayInput) => {
					const { width: w, height: h, padding: pad } = propsRef.current;
					const dpr = window.devicePixelRatio || 1;
					const cw = w - pad.left - pad.right;
					const ch = h - pad.top - pad.bottom;

					const hexRgba = (
						hex: string,
						a = 1,
					): [number, number, number, number] => {
						const c = hexToRgba(hex);
						return [c[0], c[1], c[2], a];
					};
					const gridRgba = hexRgba(overlay.gridColor, 1);
					const axisRgba = hexRgba(overlay.axisColor, 1);
					const zeroRgba = hexRgba(overlay.zeroLineColor, 1);
					const bgRgba = hexRgba(overlay.plotBg, 1);

					const ov = overlayRef.current;
					// Estimate vertex count and grow packed buffer as needed.
					let est = 12; // bg quad (6 verts * 2 floats)
					if (overlay.xAxes[0]?.showGrid)
						est += overlay.xAxes[0].ticks.length * 4;
					for (const ax of overlay.yAxes)
						if (ax.showGrid) est += ax.ticks.length * 4;
					for (const ax of overlay.xAxes) est += (ax.ticks.length + 1) * 4 + 6;
					for (const ax of overlay.yAxes) est += (ax.ticks.length + 1) * 4 + 6;
					est += 12 + 32;
					if (ov.packed.length < est)
						ov.packed = new Float32Array(Math.max(est, ov.packed.length * 2));
					const buf = ov.packed;
					let p = 0;
					ov.groups.length = 0;

					// --- Background quad (TRIANGLES) ---
					const x0 = pad.left * dpr,
						y0 = pad.top * dpr,
						x1 = (pad.left + cw) * dpr,
						y1 = (pad.top + ch) * dpr;
					const bgStart = p / 2;
					buf[p++] = x0; buf[p++] = y0;
					buf[p++] = x1; buf[p++] = y0;
					buf[p++] = x0; buf[p++] = y1;
					buf[p++] = x1; buf[p++] = y0;
					buf[p++] = x1; buf[p++] = y1;
					buf[p++] = x0; buf[p++] = y1;
					ov.groups.push({
						topology: "TRIANGLES",
						rgba: bgRgba,
						width: 1,
						offset: bgStart,
						count: 6,
					});

					// Grid: vertical (first x axis) + horizontal (y axes that show grid).
					const gridStart = p / 2;
					if (overlay.xAxes.length > 0) {
						const ax = overlay.xAxes[0];
						if (ax.showGrid && ax.max > ax.min) {
							const range = ax.max - ax.min;
							const yTop = pad.top * dpr;
							const yBot = (pad.top + ch) * dpr;
							for (const t of ax.ticks) {
								const norm = (t - ax.min) / range;
								if (norm < 0 || norm > 1) continue;
								const sx = (pad.left + norm * cw) * dpr;
								buf[p++] = sx; buf[p++] = yTop;
								buf[p++] = sx; buf[p++] = yBot;
							}
						}
					}
					for (const ax of overlay.yAxes) {
						if (!ax.showGrid || ax.max <= ax.min) continue;
						const range = ax.max - ax.min;
						const xL = pad.left * dpr;
						const xR = (w - pad.right) * dpr;
						for (const t of ax.ticks) {
							const norm = (t - ax.min) / range;
							if (norm < 0 || norm > 1) continue;
							const sy = (pad.top + (1 - norm) * ch) * dpr;
							buf[p++] = xL; buf[p++] = sy;
							buf[p++] = xR; buf[p++] = sy;
						}
					}
					const gridCount = p / 2 - gridStart;
					if (gridCount > 0)
						ov.groups.push({
							topology: "LINES",
							rgba: gridRgba,
							width: 1,
							offset: gridStart,
							count: gridCount,
						});

					// Zero lines (horizontal for y-axes, vertical for first x-axis).
					const zeroLineStart = p / 2;
					for (const ax of overlay.yAxes) {
						if (ax.categoryLabels) continue;
						if (ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
							const range = ax.max - ax.min;
							const norm = (0 - ax.min) / range;
							const sy = (pad.top + (1 - norm) * ch) * dpr;
							const arrowTipX = (w - pad.right + 8) * dpr;
							buf[p++] = pad.left * dpr; buf[p++] = sy;
							buf[p++] = arrowTipX; buf[p++] = sy;
						}
					}
					if (overlay.xAxes.length > 0) {
						const ax = overlay.xAxes[0];
						if (!ax.categoryLabels && ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
							const range = ax.max - ax.min;
							const norm = (0 - ax.min) / range;
							const sx = (pad.left + norm * cw) * dpr;
							const tipY = (pad.top - 8) * dpr;
							buf[p++] = sx; buf[p++] = (h - pad.bottom) * dpr;
							buf[p++] = sx; buf[p++] = tipY;
						}
					}
					const zeroLineCount = p / 2 - zeroLineStart;
					if (zeroLineCount > 0)
						ov.groups.push({
							topology: "LINES",
							rgba: zeroRgba,
							width: 1.5,
							offset: zeroLineStart,
							count: zeroLineCount,
						});

					// Axis lines: frame spines + x/y axis lines + tick marks.
					const axisLineStart = p / 2;
					buf[p++] = pad.left * dpr; buf[p++] = pad.top * dpr;
					buf[p++] = pad.left * dpr; buf[p++] = (pad.top + ch) * dpr;
					buf[p++] = pad.left * dpr; buf[p++] = pad.top * dpr;
					buf[p++] = (w - pad.right) * dpr; buf[p++] = pad.top * dpr;
					buf[p++] = (w - pad.right) * dpr; buf[p++] = pad.top * dpr;
					buf[p++] = (w - pad.right) * dpr; buf[p++] = (pad.top + ch) * dpr;
					overlay.xAxes.forEach((ax, idx) => {
						const m = overlay.xAxesMetrics[idx];
						if (!m) return;
						const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
						buf[p++] = pad.left * dpr; buf[p++] = yL;
						buf[p++] = (w - pad.right + 8) * dpr; buf[p++] = yL;
						if (ax.max <= ax.min) return;
						const range = ax.max - ax.min;
						const tickEnd = yL + 6 * dpr;
						for (const t of ax.ticks) {
							const norm = (t - ax.min) / range;
							if (norm < 0 || norm > 1) continue;
							const sx = (pad.left + norm * cw) * dpr;
							buf[p++] = sx; buf[p++] = yL;
							buf[p++] = sx; buf[p++] = tickEnd;
						}
					});
					for (const ax of overlay.yAxes) {
						const isLeft = ax.position === "left";
						const metrics = overlay.axisLayout[ax.id] || { total: 40, label: 30 };
						const xPos = isLeft
							? pad.left - (overlay.leftOffsets[ax.id] ?? 0) - metrics.total
							: w - pad.right + (overlay.rightOffsets[ax.id] ?? 0);
						const lineX = isLeft ? xPos + metrics.total : xPos;
						const tipY = (pad.top - 8) * dpr;
						buf[p++] = lineX * dpr; buf[p++] = (h - pad.bottom) * dpr;
						buf[p++] = lineX * dpr; buf[p++] = tipY;
						if (ax.max <= ax.min) continue;
						const range = ax.max - ax.min;
						const xa = (isLeft ? lineX - 5 : lineX) * dpr;
						const xb = (isLeft ? lineX : lineX + 5) * dpr;
						for (const t of ax.ticks) {
							const norm = (t - ax.min) / range;
							if (norm < 0 || norm > 1) continue;
							const sy = (pad.top + (1 - norm) * ch) * dpr;
							buf[p++] = xa; buf[p++] = sy;
							buf[p++] = xb; buf[p++] = sy;
						}
					}
					const axisLineCount = p / 2 - axisLineStart;
					if (axisLineCount > 0)
						ov.groups.push({
							topology: "LINES",
							rgba: axisRgba,
							width: 1,
							offset: axisLineStart,
							count: axisLineCount,
						});

					// Zero-line arrow triangles.
					const zeroTriStart = p / 2;
					for (const ax of overlay.yAxes) {
						if (ax.categoryLabels) continue;
						if (ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
							const range = ax.max - ax.min;
							const norm = (0 - ax.min) / range;
							const sy = (pad.top + (1 - norm) * ch) * dpr;
							const arrowTipX = (w - pad.right + 8) * dpr;
							const aSize = 6 * dpr;
							buf[p++] = arrowTipX; buf[p++] = sy;
							buf[p++] = arrowTipX - aSize; buf[p++] = sy - aSize / 2;
							buf[p++] = arrowTipX - aSize; buf[p++] = sy + aSize / 2;
						}
					}
					if (overlay.xAxes.length > 0) {
						const ax = overlay.xAxes[0];
						if (!ax.categoryLabels && ax.min <= 0 && ax.max >= 0 && ax.max > ax.min) {
							const range = ax.max - ax.min;
							const norm = (0 - ax.min) / range;
							const sx = (pad.left + norm * cw) * dpr;
							const tipY = (pad.top - 8) * dpr;
							const aSize = 6 * dpr;
							buf[p++] = sx; buf[p++] = tipY;
							buf[p++] = sx - aSize / 2; buf[p++] = tipY + aSize;
							buf[p++] = sx + aSize / 2; buf[p++] = tipY + aSize;
						}
					}
					const zeroTriCount = p / 2 - zeroTriStart;
					if (zeroTriCount > 0)
						ov.groups.push({
							topology: "TRIANGLES",
							rgba: zeroRgba,
							width: 1,
							offset: zeroTriStart,
							count: zeroTriCount,
						});

					// Axis arrow triangles (x/y).
					const axisTriStart = p / 2;
					overlay.xAxes.forEach((_, idx) => {
						const m = overlay.xAxesMetrics[idx];
						if (!m) return;
						const yL = (h - pad.bottom + m.cumulativeOffset) * dpr;
						const aSize = 6 * dpr;
						buf[p++] = (w - pad.right + 8) * dpr; buf[p++] = yL;
						buf[p++] = (w - pad.right + 8 - 6) * dpr; buf[p++] = yL - aSize / 2;
						buf[p++] = (w - pad.right + 8 - 6) * dpr; buf[p++] = yL + aSize / 2;
					});
					for (const ax of overlay.yAxes) {
						const isLeft = ax.position === "left";
						const metrics = overlay.axisLayout[ax.id] || { total: 40, label: 30 };
						const xPos = isLeft
							? pad.left - (overlay.leftOffsets[ax.id] ?? 0) - metrics.total
							: w - pad.right + (overlay.rightOffsets[ax.id] ?? 0);
						const lineX = isLeft ? xPos + metrics.total : xPos;
						const tipY = (pad.top - 8) * dpr;
						const aSize = 6 * dpr;
						buf[p++] = lineX * dpr; buf[p++] = tipY;
						buf[p++] = (lineX - 3) * dpr; buf[p++] = tipY + aSize;
						buf[p++] = (lineX + 3) * dpr; buf[p++] = tipY + aSize;
					}
					const axisTriCount = p / 2 - axisTriStart;
					if (axisTriCount > 0)
						ov.groups.push({
							topology: "TRIANGLES",
							rgba: axisRgba,
							width: 1,
							offset: axisTriStart,
							count: axisTriCount,
						});

					ov.packedLen = p;
				},
			}),
			[],
		);

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

			const vs = gl.createShader(gl.VERTEX_SHADER);
			if (!vs) return;
			gl.shaderSource(vs, VERTEX_SHADER_SOURCE);
			gl.compileShader(vs);
			if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
				console.error("VS Error:", gl.getShaderInfoLog(vs));
				return;
			}

			const fs = gl.createShader(gl.FRAGMENT_SHADER);
			if (!fs) return;
			gl.shaderSource(fs, FRAGMENT_SHADER_SOURCE);
			gl.compileShader(fs);
			if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
				console.error("FS Error:", gl.getShaderInfoLog(fs));
				return;
			}

			const program = gl.createProgram();
			if (!program) return;
			gl.attachShader(program, vs);
			gl.attachShader(program, fs);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
				console.error("Link Error:", gl.getProgramInfoLog(program));
				return;
			}
			programRef.current = program;
			locationsRef.current = {
				xScaleOffLoc: gl.getUniformLocation(program, "u_x_scale_offset"),
				yScaleOffLoc: gl.getUniformLocation(program, "u_y_scale_offset"),
				padLoc: gl.getUniformLocation(program, "u_padding"),
				resLoc: gl.getUniformLocation(program, "u_resolution"),
				colorLoc: gl.getUniformLocation(program, "u_color"),
				styleLoc: gl.getUniformLocation(program, "u_style"),
				lineStyleLoc: gl.getUniformLocation(program, "u_line_style"),
				dprLoc: gl.getUniformLocation(program, "u_dpr"),
				sizeLoc: gl.getUniformLocation(program, "u_point_size"),
				screenSpaceLoc: gl.getUniformLocation(program, "u_is_screen_space"),
				xLoc: gl.getAttribLocation(program, "a_x"),
				yLoc: gl.getAttribLocation(program, "a_y"),
				otherLoc: gl.getAttribLocation(program, "a_other"),
				tLoc: gl.getAttribLocation(program, "a_t"),
				distStartLoc: gl.getAttribLocation(program, "a_dist_start"),
			};

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
			const datasetsById: Record<string, Dataset> = {};
			for (let i = 0; i < datasets.length; i++) {
				datasetsById[datasets[i].id] = datasets[i];
			}

			const result: {
				series: SeriesConfig;
				ds: Dataset;
				xIdx: number;
				yIdx: number;
				lineColorRgba: number[];
				pointColorRgba: number[];
			}[] = [];

			for (let i = 0; i < series.length; i++) {
				const s = series[i];
				const ds = datasetsById[s.sourceId];
				if (!ds) continue;

				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				const yIdx = getColumnIndex(ds, s.yColumn);

				if (xIdx === -1 || yIdx === -1) {
					continue;
				}

				const isPreviewed = previewColor?.seriesId === s.id;
				const effectiveLineColor = isPreviewed
					? previewColor.color
					: s.lineColor;
				const effectivePointColor = isPreviewed
					? previewColor.color
					: s.pointColor;

				result.push({
					series: s,
					ds,
					xIdx,
					yIdx,
					lineColorRgba: hexToRgba(effectiveLineColor),
					pointColorRgba: hexToRgba(effectivePointColor),
				});
			}

			return result;
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
				const program = programRef.current;
				const locs = locationsRef.current;
				if (!program || !locs) return;

				const { width, height, padding, highlightedSeriesId } =
					propsRef.current;

				const chartWidth = width - padding.left - padding.right;
				const chartHeight = height - padding.top - padding.bottom;
				if (chartWidth <= 0 || chartHeight <= 0) return;

				const dpr = window.devicePixelRatio || 1;
				const pw = width * dpr,
					ph = height * dpr;

				gl.viewport(0, 0, pw, ph);
				gl.clearColor(0, 0, 0, 0);
				gl.clear(gl.COLOR_BUFFER_BIT);

				gl["useProgram"](program);
				gl.uniform4f(
					locs.padLoc,
					padding.top * dpr,
					padding.right * dpr,
					padding.bottom * dpr,
					padding.left * dpr,
				);
				gl.uniform2f(locs.resLoc, pw, ph);
				gl.uniform1f(locs.dprLoc, dpr);

				// --- Draw overlay (bg, grid, spines, ticks, arrows, zero lines) ---
				const overlay = overlayRef.current;
				if (overlay && overlay.packedLen > 0 && overlay.groups.length > 0) {
					gl.uniform1i(locs.screenSpaceLoc, 1);
					gl.uniform1i(locs.styleLoc, 3); // solid color
					gl.uniform1i(locs.lineStyleLoc, 0);
					gl.disableVertexAttribArray(locs.otherLoc);
					gl.vertexAttrib2f(locs.otherLoc, 0, 0);
					gl.disableVertexAttribArray(locs.tLoc);
					gl.vertexAttrib1f(locs.tLoc, 0);
					gl.disableVertexAttribArray(locs.distStartLoc);
					gl.vertexAttrib1f(locs.distStartLoc, 0);

					let overlayBuf = buffersRef.current.get("__overlay");
					if (!overlayBuf) {
						const b = gl.createBuffer();
						if (b) {
							overlayBuf = b;
							buffersRef.current.set("__overlay", overlayBuf);
						}
					}
					if (overlayBuf) {
						gl.bindBuffer(gl.ARRAY_BUFFER, overlayBuf);
						gl.bufferData(
							gl.ARRAY_BUFFER,
							overlay.packed.subarray(0, overlay.packedLen),
							gl.STREAM_DRAW,
						);
						gl.enableVertexAttribArray(locs.xLoc);
						gl.vertexAttribPointer(locs.xLoc, 1, gl.FLOAT, false, 8, 0);
						gl.enableVertexAttribArray(locs.yLoc);
						gl.vertexAttribPointer(locs.yLoc, 1, gl.FLOAT, false, 8, 4);

						let curWidth = -1;
						for (const grp of overlay.groups) {
							if (grp.count === 0) continue;
							const c = grp.rgba;
							gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], c[3]);
							if (grp.topology === "LINES") {
								if (curWidth !== grp.width) {
									gl.lineWidth(grp.width);
									curWidth = grp.width;
								}
								gl.drawArrays(gl.LINES, grp.offset, grp.count);
							} else {
								gl.drawArrays(gl.TRIANGLES, grp.offset, grp.count);
							}
						}
					}
				}

				gl.uniform1i(locs.screenSpaceLoc, 0);
				gl.enable(gl.SCISSOR_TEST);
				gl.scissor(
					padding.left * dpr,
					padding.bottom * dpr,
					chartWidth * dpr,
					chartHeight * dpr,
				);

				const t0 = performance.now();
				for (let idx = 0; idx < seriesMetadata.length; idx++) {
					const { series: s, ds, xIdx, yIdx, lineColorRgba, pointColorRgba } = seriesMetadata[idx];

					let xAxis: XAxisConfig | undefined;
					const targetXId = ds.xAxisId || "axis-1";
					for (let i = 0; i < currentXAxes.length; i++) {
						if (currentXAxes[i].id === targetXId) {
							xAxis = currentXAxes[i];
							break;
						}
					}

					let yAxis: YAxisConfig | undefined;
					for (let i = 0; i < currentYAxes.length; i++) {
						if (currentYAxes[i].id === s.yAxisId) {
							yAxis = currentYAxes[i];
							break;
						}
					}

					if (!xAxis || !yAxis) continue;

					if (s.hidden) continue;
					const colX = ds.data[xIdx];
					const colY = ds.data[yIdx];
					if (!colX || !colY) continue;

						const xData = colX.data;
						const yData = colY.data;
						const xRef = colX.refPoint;

						const xRange = xAxis.max - xAxis.min || 1;
						const yRange = yAxis.max - yAxis.min || 1;

						let isMonotonic = monoCacheRef.current.get(xData);
						if (isMonotonic === undefined) {
							isMonotonic = true;
							for (let i = 1; i < xData.length; i++) {
								if (xData[i] < xData[i - 1]) {
									isMonotonic = false;
									break;
								}
							}
							monoCacheRef.current.set(xData, isMonotonic);
						}

						let cachedSegments = segmentCacheRef.current.get(yData);
						if (!cachedSegments) {
							cachedSegments = [];
							let segStart = -1;
							for (let i = 0; i <= yData.length; i++) {
								const nan = i === yData.length || Number.isNaN(yData[i]);
								const xDrop =
									!nan && i > 0 && segStart !== -1 && xData[i] < xData[i - 1];
								const break_ = nan || xDrop;
								if (!break_ && segStart === -1) segStart = i;
								else if (break_ && segStart !== -1) {
									cachedSegments.push({ start: segStart, end: i - 1 });
									segStart = -1;
									if (xDrop && !nan) segStart = i;
								}
							}
							segmentCacheRef.current.set(yData, cachedSegments);
						}

						const xDataLen = xData.length;
						let rawStart = 0,
							rawEnd = xDataLen - 1;
						if (isMonotonic) {
							let lo = 0,
								hi = xDataLen - 1;
							while (lo <= hi) {
								const m = (lo + hi) >>> 1;
								if (xData[m] + xRef <= xAxis.min) {
									rawStart = m;
									lo = m + 1;
								} else hi = m - 1;
							}
							lo = 0;
							hi = xDataLen - 1;
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

						const xScaleVal = (chartWidth * dpr) / xRange;
						const xOffsetVal =
							padding.left * dpr - (xAxis.min - xRef) * xScaleVal;
						const yScaleVal =
							(padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
						const yOffsetVal =
							(height - padding.bottom) * dpr -
							(yAxis.min - colY.refPoint) * yScaleVal;

						// Cache GPU buffers per source Float32Array identity (xData/yData).
						// Avoids re-uploading during pan/zoom — only uniforms change.
						let xBuffer = columnBufferRef.current.get(xData);
						if (!xBuffer) {
							const b = gl.createBuffer();
							if (!b) return;
							xBuffer = b;
							gl.bindBuffer(gl.ARRAY_BUFFER, xBuffer);
							gl.bufferData(gl.ARRAY_BUFFER, xData, gl.STATIC_DRAW);
							columnBufferRef.current.set(xData, xBuffer);
						}
						let yBuffer = columnBufferRef.current.get(yData);
						if (!yBuffer) {
							const b = gl.createBuffer();
							if (!b) return;
							yBuffer = b;
							gl.bindBuffer(gl.ARRAY_BUFFER, yBuffer);
							gl.bufferData(gl.ARRAY_BUFFER, yData, gl.STATIC_DRAW);
							columnBufferRef.current.set(yData, yBuffer);
						}

						// Build draw ranges directly in original buffer indices using cachedSegments
						// clipped to [sliceStart, sliceEnd]. This skips the per-frame slice + scratch copy.
						const drawRanges: { start: number; count: number }[] = [];
						if (isMonotonic) {
							let segLo = 0,
								segHi = cachedSegments.length - 1;
							let startSegIdx = 0;
							while (segLo <= segHi) {
								const m = (segLo + segHi) >>> 1;
								if (cachedSegments[m].end >= sliceStart) {
									startSegIdx = m;
									segHi = m - 1;
								} else segLo = m + 1;
							}
							for (let i = startSegIdx; i < cachedSegments.length; i++) {
								const seg = cachedSegments[i];
								if (seg.start > sliceEnd) break;
								const s = Math.max(seg.start, sliceStart);
								const e = Math.min(seg.end, sliceEnd);
								if (e >= s) drawRanges.push({ start: s, count: e - s + 1 });
							}
						} else {
							for (const seg of cachedSegments) {
								drawRanges.push({
									start: seg.start,
									count: seg.end - seg.start + 1,
								});
							}
						}

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
								let totalLineSegs = 0;
								const STEPS: number[] = [];
								for (const r of drawRanges) {
									const n = Math.max(0, r.count - 1);
									const step = Math.max(1, Math.floor(n / 4000));
									STEPS.push(step);
									totalLineSegs += Math.ceil(n / step);
								}
								const paramKey = `${xRange}-${yRange}-${chartWidth}-${chartHeight}-${dpr}-${totalLineSegs}-${drawRanges.length}-${drawRanges[0]?.start ?? 0}`;
								let segBuffer = buffersRef.current.get(segBufferKey);
								if (!segBuffer) {
									segBuffer = gl.createBuffer();
									if (!segBuffer) return;
									buffersRef.current.set(segBufferKey, segBuffer);
								}

								if (segParamsRef.current.get(segBufferKey) !== paramKey) {
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

											const ax = xData[ai],
												ay = yData[ai];
											const bx = xData[bi],
												by = yData[bi];
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

							const bg = hexToRgba(plotBg ?? "#ffffff");
							gl.uniform4f(locs.colorLoc, bg[0], bg[1], bg[2], 1.0);
							gl.uniform1f(
								locs.sizeLoc,
								baseSize + (pStyle === 2 ? 3.0 : 2.0) * dpr,
							);
							for (const seg of drawRanges) {
								if (seg.count >= 1)
									gl.drawArrays(gl.POINTS, seg.start, seg.count);
							}

							gl.uniform4f(locs.colorLoc, c[0], c[1], c[2], 1.0);
							gl.uniform1f(locs.sizeLoc, baseSize);
							for (const seg of drawRanges) {
								if (seg.count >= 1)
									gl.drawArrays(gl.POINTS, seg.start, seg.count);
							}
						}
				}
				gl.disable(gl.SCISSOR_TEST);

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
		}, [seriesMetadata, isInteracting, plotBg]);

		useEffect(() => {
			if (!isInteracting && drawFrameRef.current) {
				drawFrameRef.current(liveXAxesRef.current, liveYAxesRef.current);
			}
		}, [isInteracting]);

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
