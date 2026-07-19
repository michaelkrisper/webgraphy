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
import { cssToRgbaWithAlpha } from "../../utils/colors";
import {
	type DecimCache,
	drawOverlay,
	drawSeriesLines,
	drawSeriesPoints,
	type OverlayState,
	type SegParams,
	type SeriesDrawBundle,
} from "./drawSeries";
import { GlLabelAtlas, type LabelRun } from "./labelAtlas";
import {
	MAIN_VERTEX_SHADER,
	MAIN_FRAGMENT_SHADER,
	LINE_VERTEX_SHADER,
	LINE_FRAGMENT_SHADER,
	LABEL_VERTEX_SHADER,
	LABEL_FRAGMENT_SHADER,
} from "./rendererShaders";

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



export interface RenderLabelSegment {
	text: string;
	color: string;
}

/** One axis label for the renderer's atlas-based label pass, CSS px anchor. */
export interface RenderLabel {
	text: string;
	color: string;
	font: string;
	x: number;
	y: number;
	align: "left" | "center" | "right";
	baseline: "alphabetic" | "middle";
	/** Quarter-turn rotation around the anchor: -1 = -90°, 1 = +90°. */
	rot?: number;
	/** Multi-color composite (y titles); replaces text/color when present. */
	segments?: RenderLabelSegment[];
	/** Secondary-label chrome: background quad behind the text. */
	bg?: string;
	/** Secondary-label chrome: 2px separator stroke at this x. */
	tick?: { x: number; color: string };
}

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

interface LabelProgramLocations {
	anchorLoc: number;
	offLoc: number;
	sizeLoc: number;
	uvrectLoc: number;
	rotLoc: number;
	resLoc: WebGLUniformLocation | null;
}

/** Floats per label instance: anchor(2) off(2) size(2) uvrect(4) rot(1). */
const LABEL_INST_FLOATS = 11;
const LABEL_INST_STRIDE = LABEL_INST_FLOATS * 4;

export class RendererCore {
	private readonly gl: WebGL2RenderingContext;
	private readonly st: GLStateCache;
	private main: CompiledProgram;
	private line: CompiledProgram;
	private label: CompiledProgram;
	private labelLocs: LabelProgramLocations;
	private labelAtlas: GlLabelAtlas | null = null;
	private labels: RenderLabel[] = [];
	private labelInstScratch = new Float32Array(0);
	// Reused single-run list so plain labels don't allocate per frame.
	private singleRun: LabelRun[] = [{ text: "", color: "" }];
	private labelChrome: OverlayState = {
		packed: new Float32Array(256),
		packedLen: 0,
		groups: [],
	};

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
		label: CompiledProgram,
	) {
		this.gl = gl;
		this.main = main;
		this.line = line;
		this.label = label;

		gl.enable(gl.BLEND);
		gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

		this.labelLocs = {
			anchorLoc: gl.getAttribLocation(label.program, "a_anchor"),
			offLoc: gl.getAttribLocation(label.program, "a_off"),
			sizeLoc: gl.getAttribLocation(label.program, "a_size"),
			uvrectLoc: gl.getAttribLocation(label.program, "a_uvrect"),
			rotLoc: gl.getAttribLocation(label.program, "a_rot"),
			resLoc: gl.getUniformLocation(label.program, "u_resolution"),
		};
		// The atlas sampler is bound to texture unit 0 once and never changes.
		gl.useProgram(label.program);
		gl.uniform1i(gl.getUniformLocation(label.program, "u_atlas"), 0);
		gl.useProgram(null);

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
		this.st.setLabelProgram(label.program);
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
		const label = compileProgram(
			gl,
			LABEL_VERTEX_SHADER,
			LABEL_FRAGMENT_SHADER,
			"label",
		);
		if (!main || !line || !label) return null;
		return new RendererCore(gl, main, line, label);
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

	setLabels(labels: RenderLabel[]): void {
		this.labels = labels;
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

		this.drawLabels(pw, ph, dpr);
	}

	/**
	 * Atlas-based label pass: chrome quads first (secondary-label backgrounds
	 * and separators, solid geometry via the main program), then one instanced
	 * textured-quad draw for all label texts.
	 */
	private drawLabels(pw: number, ph: number, dpr: number): void {
		const labels = this.labels;
		if (labels.length === 0) return;
		const { gl, st } = this;

		this.labelAtlas ??= new GlLabelAtlas(gl);
		const atlas = this.labelAtlas;
		atlas.setDpr(dpr);

		if (this.labelInstScratch.length < labels.length * LABEL_INST_FLOATS) {
			this.labelInstScratch = new Float32Array(
				labels.length * LABEL_INST_FLOATS * 2,
			);
		}
		const inst = this.labelInstScratch;
		let n = 0;
		const chromeByColor = new Map<string, number[]>();
		const pushRect = (
			color: string,
			x: number,
			y: number,
			w: number,
			h: number,
		) => {
			let verts = chromeByColor.get(color);
			if (!verts) {
				verts = [];
				chromeByColor.set(color, verts);
			}
			const x0 = x * dpr;
			const y0 = y * dpr;
			const x1 = (x + w) * dpr;
			const y1 = (y + h) * dpr;
			verts.push(x0, y0, x1, y0, x0, y1, x0, y1, x1, y0, x1, y1);
		};

		for (const l of labels) {
			let runs: LabelRun[];
			if (l.segments) {
				runs = l.segments;
			} else {
				this.singleRun[0].text = l.text;
				this.singleRun[0].color = l.color;
				runs = this.singleRun;
			}
			const region = atlas.ensure(runs, l.font);
			if (!region) continue;

			// Chrome sized from the measured text, mirroring the old 2D canvas
			// secondary-label drawing (bg rect 14px tall, 2px separator).
			if (l.bg) pushRect(l.bg, l.x - 2, l.y - 12, region.cssWidth + 4, 14);
			if (l.tick) pushRect(l.tick.color, l.tick.x - 1, l.y - 12, 2, 14);

			let offX = -region.pad;
			if (l.align === "center") offX -= region.cssWidth / 2;
			else if (l.align === "right") offX -= region.cssWidth;
			const offY =
				l.baseline === "middle"
					? -region.cssHeight / 2 - region.pad
					: -region.ascent - region.pad;

			const o = n * LABEL_INST_FLOATS;
			inst[o] = l.x * dpr;
			inst[o + 1] = l.y * dpr;
			inst[o + 2] = offX * dpr;
			inst[o + 3] = offY * dpr;
			inst[o + 4] = region.wPx;
			inst[o + 5] = region.hPx;
			inst[o + 6] = region.u0;
			inst[o + 7] = region.v0;
			inst[o + 8] = region.uw;
			inst[o + 9] = region.vh;
			inst[o + 10] = l.rot ?? 0;
			n++;
		}
		if (n === 0) return;

		if (chromeByColor.size > 0) {
			const chrome = this.labelChrome;
			let total = 0;
			for (const verts of chromeByColor.values()) total += verts.length;
			if (chrome.packed.length < total)
				chrome.packed = new Float32Array(total * 2);
			chrome.groups.length = 0;
			let p = 0;
			for (const [color, verts] of chromeByColor) {
				chrome.groups.push({
					topology: "TRIANGLES",
					rgba: cssToRgbaWithAlpha(color, 1),
					width: 1,
					offset: p / 2,
					count: verts.length / 2,
				});
				chrome.packed.set(verts, p);
				p += verts.length;
			}
			chrome.packedLen = p;
			let chromeBuf = this.buffers.get("__labelChrome");
			if (!chromeBuf) {
				const b = gl.createBuffer();
				if (b) {
					chromeBuf = b;
					this.buffers.set("__labelChrome", chromeBuf);
				}
			}
			if (chromeBuf) drawOverlay(st, chrome, chromeBuf);
		}

		let instBuf = this.buffers.get("__labels");
		if (!instBuf) {
			const b = gl.createBuffer();
			if (!b) return;
			instBuf = b;
			this.buffers.set("__labels", instBuf);
		}

		st.useLabel();
		gl.uniform2f(this.labelLocs.resLoc, pw, ph);
		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, atlas.texture);

		gl.bindBuffer(gl.ARRAY_BUFFER, instBuf);
		gl.bufferData(
			gl.ARRAY_BUFFER,
			inst.subarray(0, n * LABEL_INST_FLOATS),
			gl.STREAM_DRAW,
		);
		const ll = this.labelLocs;
		st.enableAttrib(ll.anchorLoc, 1);
		gl.vertexAttribPointer(ll.anchorLoc, 2, gl.FLOAT, false, LABEL_INST_STRIDE, 0);
		st.enableAttrib(ll.offLoc, 1);
		gl.vertexAttribPointer(ll.offLoc, 2, gl.FLOAT, false, LABEL_INST_STRIDE, 8);
		st.enableAttrib(ll.sizeLoc, 1);
		gl.vertexAttribPointer(ll.sizeLoc, 2, gl.FLOAT, false, LABEL_INST_STRIDE, 16);
		st.enableAttrib(ll.uvrectLoc, 1);
		gl.vertexAttribPointer(ll.uvrectLoc, 4, gl.FLOAT, false, LABEL_INST_STRIDE, 24);
		st.enableAttrib(ll.rotLoc, 1);
		gl.vertexAttribPointer(ll.rotLoc, 1, gl.FLOAT, false, LABEL_INST_STRIDE, 40);

		gl.drawArraysInstanced(gl.TRIANGLES, 0, 6, n);
	}

	dispose(): void {
		const { gl } = this;
		this.labelAtlas?.dispose();
		gl.deleteProgram(this.main.program);
		gl.deleteShader(this.main.vs);
		gl.deleteShader(this.main.fs);
		gl.deleteProgram(this.line.program);
		gl.deleteShader(this.line.vs);
		gl.deleteShader(this.line.fs);
		gl.deleteProgram(this.label.program);
		gl.deleteShader(this.label.vs);
		gl.deleteShader(this.label.fs);
		gl.getExtension("WEBGL_lose_context")?.loseContext();
	}
}
