/**
 * Framework-free WebGL2 renderer core.
 *
 * Owns the GL context, both shader programs, and every per-frame cache
 * (column buffers, M4 decimation entries, segment/monotonicity analysis,
 * dashed-line instance buffers, adaptive pixel budget). It has no DOM or
 * React dependency, so the identical class runs on the main thread (fallback
 * path) and inside the render worker behind an `OffscreenCanvas` — the
 * hosting side is responsible for canvas sizing and for feeding it plain
 * data (rgba arrays, slim axis objects, resolved column arrays).
 *
 * Two programs:
 * - "main": point markers (gl.POINTS + SDF sprites) and screen-space overlay
 *   geometry (background quad, 1px grid/spines via native LINES, arrow
 *   triangles).
 * - "line": instanced triangle-capsule series lines (see drawSeries.ts).
 */

import { DEFAULT_X_AXIS_ID, getAxisById } from "../../utils/axisCalculations";
import {
	type DecimCache,
	drawOverlay,
	drawSeriesLines,
	drawSeriesPoints,
	type OverlayState,
	type SegParams,
	type SeriesDrawBundle,
} from "./drawSeries";
import {
	GLStateCache,
	type LineProgramLocations,
	type WebGLLocations,
} from "./GLStateCache";
import {
	computeDataSlice,
	computeDrawRanges,
	getOrComputeMonotonicity,
	getOrComputeSegments,
} from "./seriesPrep";

const MAIN_VERTEX_SHADER = `#version 300 es
      // === MAIN VERTEX SHADER (points + screen-space overlay) ===
      in float a_x;
      in float a_y;
      in vec2 a_other;
      in float a_t;
      in float a_dist_start;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec4 u_padding;
      uniform vec2 u_resolution;
      uniform float u_point_size;
      uniform float u_dpr;
      uniform bool u_is_screen_space;
      out highp float v_t;
      out highp float v_len;
      out highp float v_dist_start;

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

const MAIN_FRAGMENT_SHADER = `#version 300 es
      // === MAIN FRAGMENT SHADER ===
      precision highp float;
      in highp float v_t;
      in highp float v_len;
      in highp float v_dist_start;
      uniform vec4 u_color;
      uniform int u_style;
      uniform int u_line_style;
      uniform float u_dpr;
      uniform float u_point_size;
      out vec4 fragColor;

      void drawCircle() {
        vec2 p = (gl_PointCoord - 0.5) * u_point_size;
        float r = length(p);
        float halfSize = 0.5 * u_point_size;
        float dOut = r - halfSize;
        float a = 1.0 - smoothstep(-0.5, 0.5, dOut);
        if (a <= 0.0) discard;
        float alpha = u_color.a * a;
        fragColor = vec4(u_color.rgb * alpha, alpha);
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
        fragColor = vec4(u_color.rgb * alpha, alpha);
      }

      void drawCross() {
        vec2 p = gl_PointCoord - 0.5;
        // Stroke half-width: at least 1px in point-coord space, scaled with size
        float t = max(0.15, 1.5 / max(u_point_size, 2.0));
        if (abs(p.x - p.y) > t && abs(p.x + p.y) > t) discard;
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawLineSegment() {
        if (u_line_style > 0) {
          float dashLen = (u_line_style == 1) ? 8.0 : 2.0;
          float gapLen = (u_line_style == 1) ? 6.0 : 4.0;
          float total = (dashLen + gapLen) * u_dpr;
          float dist = mod(v_dist_start + mod(v_t * v_len, total), total);
          if (dist > dashLen * u_dpr) discard;
        }
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
      }

      void drawSolid() {
        fragColor = vec4(u_color.rgb * u_color.a, u_color.a);
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

const LINE_VERTEX_SHADER = `#version 300 es
      // === LINE VERTEX SHADER (instanced triangle capsules) ===
      // Per instance: one segment (p0 -> p1) in data space, expanded to a
      // screen-space quad that covers the capsule of half-width
      // u_width_px/2 plus a 1px antialiasing apron. The six vertices of the
      // two triangles are derived from gl_VertexID; no per-vertex buffer.
      precision highp float;
      in float a_x0;
      in float a_y0;
      in float a_x1;
      in float a_y1;
      in float a_dist0;
      uniform vec2 u_x_scale_offset; // (scale, offset)
      uniform vec2 u_y_scale_offset; // (scale, offset)
      uniform vec2 u_resolution;
      uniform float u_width_px;
      out vec2 v_pos;
      flat out vec2 v_p0;
      flat out vec2 v_p1;
      flat out float v_dist0;

      void main() {
        vec2 p0 = vec2(a_x0 * u_x_scale_offset.x + u_x_scale_offset.y,
                       a_y0 * u_y_scale_offset.x + u_y_scale_offset.y);
        vec2 p1 = vec2(a_x1 * u_x_scale_offset.x + u_x_scale_offset.y,
                       a_y1 * u_y_scale_offset.x + u_y_scale_offset.y);
        vec2 seg = p1 - p0;
        float len = length(seg);
        // Zero-length segments (duplicate samples) still render a round dot.
        vec2 dir = len > 1e-4 ? seg / len : vec2(1.0, 0.0);
        vec2 nrm = vec2(-dir.y, dir.x);
        float ext = u_width_px * 0.5 + 1.0;

        // Corner table for triangles (c0,c1,c2) and (c2,c1,c3) where
        // c = (end, side): c0=(0,-1) c1=(0,+1) c2=(1,-1) c3=(1,+1).
        int vid = gl_VertexID;
        float t = (vid == 2 || vid == 3 || vid == 5) ? 1.0 : 0.0;
        float side = (vid == 1 || vid == 4 || vid == 5) ? 1.0 : -1.0;

        vec2 pos = mix(p0, p1, t) + dir * ((t * 2.0 - 1.0) * ext) + nrm * (side * ext);
        v_pos = pos;
        v_p0 = p0;
        v_p1 = p1;
        v_dist0 = a_dist0;
        gl_Position = vec4(pos.x / u_resolution.x * 2.0 - 1.0,
                           1.0 - pos.y / u_resolution.y * 2.0, 0.0, 1.0);
      }
`;

const LINE_FRAGMENT_SHADER = `#version 300 es
      // === LINE FRAGMENT SHADER ===
      // Capsule SDF: distance from the fragment to the segment [p0,p1] in
      // device px. One pixel of smoothstep at the rim antialiases the edge;
      // round caps at both ends double as round joins between consecutive
      // segments of a polyline.
      precision highp float;
      in vec2 v_pos;
      flat in vec2 v_p0;
      flat in vec2 v_p1;
      flat in float v_dist0;
      uniform vec4 u_color;
      uniform float u_width_px;
      uniform vec2 u_dash; // (dashLen, gapLen) device px; dashLen <= 0 = solid
      out vec4 fragColor;

      void main() {
        vec2 seg = v_p1 - v_p0;
        float len2 = dot(seg, seg);
        float h = len2 > 0.0 ? clamp(dot(v_pos - v_p0, seg) / len2, 0.0, 1.0) : 0.0;
        float d = distance(v_pos, v_p0 + seg * h);
        float halfW = max(u_width_px * 0.5, 0.5);
        float alpha = 1.0 - smoothstep(halfW - 0.5, halfW + 0.5, d);
        if (u_dash.x > 0.0) {
          float along = v_dist0 + h * sqrt(len2);
          float m = mod(along, u_dash.x + u_dash.y);
          alpha *= 1.0 - smoothstep(u_dash.x - 0.5, u_dash.x + 0.5, m);
        }
        if (alpha <= 0.003) discard;
        float a = u_color.a * alpha;
        fragColor = vec4(u_color.rgb * a, a);
      }
`;

/** Slim axis shape the renderer needs per frame (id + visible range). */
export interface RenderAxis {
	id: string;
	min: number;
	max: number;
}

export interface RendererViewport {
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	dpr: number;
}

/**
 * One drawable series with columns and styling fully resolved by the host
 * (colors as rgba arrays, preview overrides applied). Structured-clone-safe
 * except for the Float32Arrays, which the worker backend keys and caches.
 */
export interface RendererSeriesInput {
	id: string;
	segKey: string;
	xAxisId: string;
	yAxisId: string;
	hidden: boolean;
	xData: Float32Array;
	yData: Float32Array;
	xRef: number;
	yRef: number;
	lineColorRgba: number[];
	pointColorRgba: number[];
	lineStyle: "solid" | "dashed" | "dotted" | "none";
	pointStyle: "circle" | "square" | "cross" | "none";
}

interface CompiledProgram {
	program: WebGLProgram;
	vs: WebGLShader;
	fs: WebGLShader;
}

function compileProgram(
	gl: WebGL2RenderingContext,
	vsSource: string,
	fsSource: string,
	label: string,
): CompiledProgram | null {
	const vs = gl.createShader(gl.VERTEX_SHADER);
	if (!vs) return null;
	gl.shaderSource(vs, vsSource);
	gl.compileShader(vs);
	if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
		console.error(`${label} VS Error:`, gl.getShaderInfoLog(vs));
		return null;
	}

	const fs = gl.createShader(gl.FRAGMENT_SHADER);
	if (!fs) return null;
	gl.shaderSource(fs, fsSource);
	gl.compileShader(fs);
	if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
		console.error(`${label} FS Error:`, gl.getShaderInfoLog(fs));
		return null;
	}

	const program = gl.createProgram();
	if (!program) return null;
	gl.attachShader(program, vs);
	gl.attachShader(program, fs);
	gl.linkProgram(program);
	if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
		console.error(`${label} Link Error:`, gl.getProgramInfoLog(program));
		return null;
	}
	return { program, vs, fs };
}

function getOrInitBuffer(
	gl: WebGL2RenderingContext,
	data: Float32Array,
	columnBufferCache: WeakMap<Float32Array, WebGLBuffer>,
): WebGLBuffer | null {
	let buffer = columnBufferCache.get(data);
	if (!buffer) {
		const b = gl.createBuffer();
		if (!b) return null;
		buffer = b;
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		columnBufferCache.set(data, buffer);
	}
	return buffer;
}

export class RendererCore {
	private readonly gl: WebGL2RenderingContext;
	private readonly st: GLStateCache;
	private main: CompiledProgram;
	private line: CompiledProgram;

	private viewport: RendererViewport = {
		width: 0,
		height: 0,
		padding: { top: 0, right: 0, bottom: 0, left: 0 },
		dpr: 1,
	};
	private plotBgRgba: number[] = [1, 1, 1];
	private seriesList: RendererSeriesInput[] = [];
	private highlightedSeriesId: string | null = null;
	private interacting = false;

	private overlay: OverlayState = {
		packed: new Float32Array(0),
		packedLen: 0,
		groups: [],
	};

	private buffers = new Map<string, WebGLBuffer>();
	private segParams = new Map<string, SegParams>();
	private segmentCache = new WeakMap<
		Float32Array,
		{ start: number; end: number }[]
	>();
	private monoCache = new WeakMap<Float32Array, boolean>();
	// GPU buffers keyed by source Float32Array identity (raw column data).
	// Pan/zoom reuses these without re-uploading.
	private columnBuffers = new WeakMap<Float32Array, WebGLBuffer>();
	private decimCache: DecimCache = new WeakMap();
	private decimScratch = { x: new Float32Array(0), y: new Float32Array(0) };
	private pointDecimCache: DecimCache = new WeakMap();
	private pointDecimScratch = {
		x: new Float32Array(0),
		y: new Float32Array(0),
	};
	private drawRangesScratch: { start: number; count: number }[] = [];

	private constructor(
		gl: WebGL2RenderingContext,
		main: CompiledProgram,
		line: CompiledProgram,
	) {
		this.gl = gl;
		this.main = main;
		this.line = line;

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

		const locs: WebGLLocations = {
			xScaleOffLoc: gl.getUniformLocation(main.program, "u_x_scale_offset"),
			yScaleOffLoc: gl.getUniformLocation(main.program, "u_y_scale_offset"),
			padLoc: gl.getUniformLocation(main.program, "u_padding"),
			resLoc: gl.getUniformLocation(main.program, "u_resolution"),
			colorLoc: gl.getUniformLocation(main.program, "u_color"),
			styleLoc: gl.getUniformLocation(main.program, "u_style"),
			lineStyleLoc: gl.getUniformLocation(main.program, "u_line_style"),
			dprLoc: gl.getUniformLocation(main.program, "u_dpr"),
			sizeLoc: gl.getUniformLocation(main.program, "u_point_size"),
			screenSpaceLoc: gl.getUniformLocation(main.program, "u_is_screen_space"),
			xLoc: gl.getAttribLocation(main.program, "a_x"),
			yLoc: gl.getAttribLocation(main.program, "a_y"),
			otherLoc: gl.getAttribLocation(main.program, "a_other"),
			tLoc: gl.getAttribLocation(main.program, "a_t"),
			distStartLoc: gl.getAttribLocation(main.program, "a_dist_start"),
		};
		const lineLocs: LineProgramLocations = {
			x0Loc: gl.getAttribLocation(line.program, "a_x0"),
			y0Loc: gl.getAttribLocation(line.program, "a_y0"),
			x1Loc: gl.getAttribLocation(line.program, "a_x1"),
			y1Loc: gl.getAttribLocation(line.program, "a_y1"),
			dist0Loc: gl.getAttribLocation(line.program, "a_dist0"),
			xScaleOffLoc: gl.getUniformLocation(line.program, "u_x_scale_offset"),
			yScaleOffLoc: gl.getUniformLocation(line.program, "u_y_scale_offset"),
			resLoc: gl.getUniformLocation(line.program, "u_resolution"),
			colorLoc: gl.getUniformLocation(line.program, "u_color"),
			widthLoc: gl.getUniformLocation(line.program, "u_width_px"),
			dashLoc: gl.getUniformLocation(line.program, "u_dash"),
		};
		this.st = new GLStateCache(gl, locs);
		this.st.setPrograms(main.program, line.program, lineLocs);
	}

	/** Create a core on any canvas (DOM or Offscreen); null when WebGL2 or
	 * shader compilation is unavailable. */
	static create(canvas: HTMLCanvasElement | OffscreenCanvas): RendererCore | null {
		const gl = canvas.getContext("webgl2", {
			preserveDrawingBuffer: true,
			antialias: true,
			alpha: false,
		}) as WebGL2RenderingContext | null;
		if (!gl) return null;
		const main = compileProgram(
			gl,
			MAIN_VERTEX_SHADER,
			MAIN_FRAGMENT_SHADER,
			"main",
		);
		const line = compileProgram(
			gl,
			LINE_VERTEX_SHADER,
			LINE_FRAGMENT_SHADER,
			"line",
		);
		if (!main || !line) return null;
		return new RendererCore(gl, main, line);
	}

	setViewport(viewport: RendererViewport): void {
		this.viewport = viewport;
	}

	setPlotBg(rgb: number[]): void {
		this.plotBgRgba = rgb;
	}

	setSeries(list: RendererSeriesInput[]): void {
		this.seriesList = list;
	}

	setOverlay(
		packed: Float32Array,
		packedLen: number,
		groups: OverlayState["groups"],
	): void {
		this.overlay.packed = packed;
		this.overlay.packedLen = packedLen;
		this.overlay.groups = groups;
	}

	setInteracting(interacting: boolean): void {
		this.interacting = interacting;
	}

	setHighlight(id: string | null): void {
		this.highlightedSeriesId = id;
	}

	drawFrame(xAxes: RenderAxis[], yAxes: RenderAxis[]): void {
		const { gl, st } = this;
		const { width, height, padding, dpr } = this.viewport;

		const chartWidth = width - padding.left - padding.right;
		const chartHeight = height - padding.top - padding.bottom;
		if (chartWidth <= 0 || chartHeight <= 0) return;

		const pw = Math.round(width * dpr);
		const ph = Math.round(height * dpr);

		gl.viewport(0, 0, pw, ph);
		const bg = this.plotBgRgba;
		gl.clearColor(bg[0], bg[1], bg[2], 1);
		gl.clear(gl.COLOR_BUFFER_BIT);

		st.useMain();
		gl.uniform4f(
			st.locs.padLoc,
			padding.top * dpr,
			padding.right * dpr,
			padding.bottom * dpr,
			padding.left * dpr,
		);
		gl.uniform2f(st.locs.resLoc, pw, ph);
		gl.uniform1f(st.locs.dprLoc, dpr);
		st.lpSetResolution(pw, ph);

		let overlayBuf = this.buffers.get("__overlay");
		if (!overlayBuf) {
			const b = gl.createBuffer();
			if (b) {
				overlayBuf = b;
				this.buffers.set("__overlay", overlayBuf);
			}
		}
		if (overlayBuf) {
			drawOverlay(st, this.overlay, overlayBuf);
		}

		st.setScreenSpace(0);
		gl.enable(gl.SCISSOR_TEST);
		gl.scissor(
			padding.left * dpr,
			padding.bottom * dpr,
			chartWidth * dpr,
			chartHeight * dpr,
		);

		const plotBgRgba = this.plotBgRgba;

		for (let idx = 0; idx < this.seriesList.length; idx++) {
			const s = this.seriesList[idx];
			if (s.hidden) continue;

			const xAxis = getAxisById(xAxes, s.xAxisId || DEFAULT_X_AXIS_ID);
			const yAxis = getAxisById(yAxes, s.yAxisId);
			if (!xAxis || !yAxis) continue;

			const xData = s.xData;
			const yData = s.yData;
			const xRef = s.xRef;
			const yRef = s.yRef;

			const xRange = xAxis.max - xAxis.min || 1;
			const yRange = yAxis.max - yAxis.min || 1;

			const isMonotonic = getOrComputeMonotonicity(xData, this.monoCache);
			const cachedSegments = getOrComputeSegments(
				xData,
				yData,
				this.segmentCache,
			);
			const { sliceStart, sliceEnd } = computeDataSlice(
				xData,
				xAxis.min,
				xAxis.max,
				xRef,
				isMonotonic,
			);

			const xScaleVal = (chartWidth * dpr) / xRange;
			const xOffsetVal = padding.left * dpr - (xAxis.min - xRef) * xScaleVal;
			const yScaleVal =
				(padding.top * dpr - (height - padding.bottom) * dpr) / yRange;
			const yOffsetVal =
				(height - padding.bottom) * dpr - (yAxis.min - yRef) * yScaleVal;

			const xBuffer = getOrInitBuffer(gl, xData, this.columnBuffers);
			const yBuffer = getOrInitBuffer(gl, yData, this.columnBuffers);
			if (!xBuffer || !yBuffer) return;

			const drawRanges = this.drawRangesScratch;
			computeDrawRanges(
				cachedSegments,
				isMonotonic,
				sliceStart,
				sliceEnd,
				drawRanges,
			);

			st.setXScaleOff(xScaleVal, xOffsetVal);
			st.setYScaleOff(yScaleVal, yOffsetVal);

			const bundle: SeriesDrawBundle = {
				xData,
				yData,
				xRef,
				yRef,
				xAxisMin: xAxis.min,
				xAxisMax: xAxis.max,
				xRange,
				yRange,
				chartWidth,
				chartHeight,
				padding,
				height,
				dpr,
				xScale: xScaleVal,
				xOff: xOffsetVal,
				yScale: yScaleVal,
				yOff: yOffsetVal,
				lineColorRgba: s.lineColorRgba,
				pointColorRgba: s.pointColorRgba,
				plotBgRgba,
				isHighlighted: this.highlightedSeriesId === s.id,
				isMonotonic,
				cachedSegments,
				drawRanges,
				xBuffer,
				yBuffer,
				sliceStart,
				sliceEnd,
				lineStyle: s.lineStyle,
				pointStyle: s.pointStyle,
			};

			drawSeriesLines(
				st,
				bundle,
				this.decimCache,
				this.decimScratch,
				this.buffers,
				this.segParams,
				s.segKey,
				this.interacting,
			);
			drawSeriesPoints(
				st,
				bundle,
				this.pointDecimCache,
				this.pointDecimScratch,
				this.interacting,
			);
		}
		gl.disable(gl.SCISSOR_TEST);
	}

	dispose(): void {
		const { gl } = this;
		gl.deleteProgram(this.main.program);
		gl.deleteShader(this.main.vs);
		gl.deleteShader(this.main.fs);
		gl.deleteProgram(this.line.program);
		gl.deleteShader(this.line.vs);
		gl.deleteShader(this.line.fs);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
