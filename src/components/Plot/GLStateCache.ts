/**
 * Cached WebGL state for the renderer's draw loop.
 *
 * Each setter is a no-op when the new value matches the cached value, so the
 * driver-side `gl.uniform*` / `gl.lineWidth` / `gl.vertexAttrib*` calls only
 * happen on actual changes. The cache persists across frames and is reset by
 * `reset()` whenever the programs are (re-)linked.
 *
 * Two programs share one cache instance: the "main" program (points and
 * overlay primitives) and the "line" program (instanced triangle lines).
 * Attribute enable/divisor state is global GL state (default VAO) and is
 * therefore tracked once; uniform values are per program, so each program's
 * uniforms get their own cache fields. Every uniform setter first ensures its
 * own program is bound (cached, so redundant `useProgram` calls are free),
 * which makes interleaved line/point drawing per series safe.
 */

export interface WebGLLocations {
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
	screenSpaceLoc: WebGLUniformLocation | null;
}

export interface LineProgramLocations {
	x0Loc: number;
	y0Loc: number;
	x1Loc: number;
	y1Loc: number;
	dist0Loc: number;
	xScaleOffLoc: WebGLUniformLocation | null;
	yScaleOffLoc: WebGLUniformLocation | null;
	resLoc: WebGLUniformLocation | null;
	colorLoc: WebGLUniformLocation | null;
	widthLoc: WebGLUniformLocation | null;
	dashLoc: WebGLUniformLocation | null;
}

export class GLStateCache {
	readonly gl: WebGL2RenderingContext;
	readonly locs: WebGLLocations;
	lineLocs: LineProgramLocations | null = null;

	private mainProgram: WebGLProgram | null = null;
	private lineProgram: WebGLProgram | null = null;
	private activeProgram: WebGLProgram | null = null;

	private colorSet = false;
	private colorR = 0;
	private colorG = 0;
	private colorB = 0;
	private colorA = 0;
	private style = -2;
	private lineStyle = -2;
	private screenSpace = -1;
	private pointSize = -1;
	private lineWidth = -1;
	private xScaleSet = false;
	private xScaleA = 0;
	private xScaleB = 0;
	private yScaleSet = false;
	private yScaleA = 0;
	private yScaleB = 0;
	private attribEnabled = new Map<number, boolean>();
	private attribConst = new Map<number, string>();
	private attribDivisor = new Map<number, number>();

	// Line-program uniform caches.
	private lpColorSet = false;
	private lpColorR = 0;
	private lpColorG = 0;
	private lpColorB = 0;
	private lpColorA = 0;
	private lpXScaleSet = false;
	private lpXScaleA = 0;
	private lpXScaleB = 0;
	private lpYScaleSet = false;
	private lpYScaleA = 0;
	private lpYScaleB = 0;
	private lpResW = -1;
	private lpResH = -1;
	private lpWidth = -1;
	private lpDashA = -1;
	private lpDashB = -1;

	constructor(gl: WebGL2RenderingContext, locs: WebGLLocations) {
		this.gl = gl;
		this.locs = locs;
	}

	setPrograms(
		main: WebGLProgram,
		line: WebGLProgram,
		lineLocs: LineProgramLocations,
	): void {
		this.mainProgram = main;
		this.lineProgram = line;
		this.lineLocs = lineLocs;
		this.activeProgram = null;
	}

	useMain(): void {
		if (this.mainProgram && this.activeProgram !== this.mainProgram) {
			this.gl.useProgram(this.mainProgram);
			this.activeProgram = this.mainProgram;
		}
	}

	useLine(): void {
		if (this.lineProgram && this.activeProgram !== this.lineProgram) {
			this.gl.useProgram(this.lineProgram);
			this.activeProgram = this.lineProgram;
		}
	}

	reset(): void {
		this.activeProgram = null;
		this.colorSet = false;
		this.style = -2;
		this.lineStyle = -2;
		this.screenSpace = -1;
		this.pointSize = -1;
		this.lineWidth = -1;
		this.xScaleSet = false;
		this.yScaleSet = false;
		this.attribEnabled.clear();
		this.attribConst.clear();
		this.attribDivisor.clear();
		this.lpColorSet = false;
		this.lpXScaleSet = false;
		this.lpYScaleSet = false;
		this.lpResW = -1;
		this.lpResH = -1;
		this.lpWidth = -1;
		this.lpDashA = -1;
		this.lpDashB = -1;
	}

	setColor(r: number, g: number, b: number, a: number): void {
		if (
			this.colorSet &&
			this.colorR === r &&
			this.colorG === g &&
			this.colorB === b &&
			this.colorA === a
		) {
			return;
		}
		this.useMain();
		this.gl.uniform4f(this.locs.colorLoc, r, g, b, a);
		this.colorR = r;
		this.colorG = g;
		this.colorB = b;
		this.colorA = a;
		this.colorSet = true;
	}

	setStyle(v: number): void {
		if (this.style === v) return;
		this.useMain();
		this.gl.uniform1i(this.locs.styleLoc, v);
		this.style = v;
	}

	setLineStyle(v: number): void {
		if (this.lineStyle === v) return;
		this.useMain();
		this.gl.uniform1i(this.locs.lineStyleLoc, v);
		this.lineStyle = v;
	}

	setScreenSpace(v: number): void {
		if (this.screenSpace === v) return;
		this.useMain();
		this.gl.uniform1i(this.locs.screenSpaceLoc, v);
		this.screenSpace = v;
	}

	setPointSize(v: number): void {
		if (this.pointSize === v) return;
		this.useMain();
		this.gl.uniform1f(this.locs.sizeLoc, v);
		this.pointSize = v;
	}

	setLineWidth(v: number): void {
		if (this.lineWidth === v) return;
		this.gl.lineWidth(v);
		this.lineWidth = v;
	}

	setXScaleOff(a: number, b: number): void {
		if (this.xScaleSet && this.xScaleA === a && this.xScaleB === b) return;
		this.useMain();
		this.gl.uniform2f(this.locs.xScaleOffLoc, a, b);
		this.xScaleA = a;
		this.xScaleB = b;
		this.xScaleSet = true;
	}

	setYScaleOff(a: number, b: number): void {
		if (this.yScaleSet && this.yScaleA === a && this.yScaleB === b) return;
		this.useMain();
		this.gl.uniform2f(this.locs.yScaleOffLoc, a, b);
		this.yScaleA = a;
		this.yScaleB = b;
		this.yScaleSet = true;
	}

	lpSetColor(r: number, g: number, b: number, a: number): void {
		if (
			this.lpColorSet &&
			this.lpColorR === r &&
			this.lpColorG === g &&
			this.lpColorB === b &&
			this.lpColorA === a
		) {
			return;
		}
		this.useLine();
		this.gl.uniform4f(this.lineLocs?.colorLoc ?? null, r, g, b, a);
		this.lpColorR = r;
		this.lpColorG = g;
		this.lpColorB = b;
		this.lpColorA = a;
		this.lpColorSet = true;
	}

	lpSetXScaleOff(a: number, b: number): void {
		if (this.lpXScaleSet && this.lpXScaleA === a && this.lpXScaleB === b)
			return;
		this.useLine();
		this.gl.uniform2f(this.lineLocs?.xScaleOffLoc ?? null, a, b);
		this.lpXScaleA = a;
		this.lpXScaleB = b;
		this.lpXScaleSet = true;
	}

	lpSetYScaleOff(a: number, b: number): void {
		if (this.lpYScaleSet && this.lpYScaleA === a && this.lpYScaleB === b)
			return;
		this.useLine();
		this.gl.uniform2f(this.lineLocs?.yScaleOffLoc ?? null, a, b);
		this.lpYScaleA = a;
		this.lpYScaleB = b;
		this.lpYScaleSet = true;
	}

	lpSetResolution(w: number, h: number): void {
		if (this.lpResW === w && this.lpResH === h) return;
		this.useLine();
		this.gl.uniform2f(this.lineLocs?.resLoc ?? null, w, h);
		this.lpResW = w;
		this.lpResH = h;
	}

	lpSetWidth(v: number): void {
		if (this.lpWidth === v) return;
		this.useLine();
		this.gl.uniform1f(this.lineLocs?.widthLoc ?? null, v);
		this.lpWidth = v;
	}

	/** Dash pattern in device px: (dashLen, gapLen); dashLen <= 0 draws solid. */
	lpSetDash(dashLen: number, gapLen: number): void {
		if (this.lpDashA === dashLen && this.lpDashB === gapLen) return;
		this.useLine();
		this.gl.uniform2f(this.lineLocs?.dashLoc ?? null, dashLen, gapLen);
		this.lpDashA = dashLen;
		this.lpDashB = gapLen;
	}

	/**
	 * Enable a vertex attribute array and pin its divisor (0 = per vertex,
	 * 1 = per instance). Divisor state outlives program switches, so every
	 * enable site declares the divisor it expects.
	 */
	enableAttrib(loc: number, divisor = 0): void {
		if (this.attribEnabled.get(loc) !== true) {
			this.gl.enableVertexAttribArray(loc);
			this.attribEnabled.set(loc, true);
			this.attribConst.delete(loc);
		}
		if (this.attribDivisor.get(loc) !== divisor) {
			this.gl.vertexAttribDivisor(loc, divisor);
			this.attribDivisor.set(loc, divisor);
		}
	}

	disableAttribConst1(loc: number, v: number): void {
		const key = `1:${v}`;
		if (this.attribEnabled.get(loc) !== false) {
			this.gl.disableVertexAttribArray(loc);
			this.attribEnabled.set(loc, false);
		}
		if (this.attribConst.get(loc) !== key) {
			this.gl.vertexAttrib1f(loc, v);
			this.attribConst.set(loc, key);
		}
	}

	disableAttribConst2(loc: number, x: number, y: number): void {
		const key = `2:${x},${y}`;
		if (this.attribEnabled.get(loc) !== false) {
			this.gl.disableVertexAttribArray(loc);
			this.attribEnabled.set(loc, false);
		}
		if (this.attribConst.get(loc) !== key) {
			this.gl.vertexAttrib2f(loc, x, y);
			this.attribConst.set(loc, key);
		}
	}
}
