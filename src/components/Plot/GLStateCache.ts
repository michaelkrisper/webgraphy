/**
 * Cached WebGL state for the renderer's draw loop.
 *
 * Each setter is a no-op when the new value matches the cached value, so the
 * driver-side `gl.uniform*` / `gl.lineWidth` / `gl.vertexAttrib*` calls only
 * happen on actual changes. The cache persists across frames and is reset by
 * `reset()` whenever the program is (re-)linked.
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

export class GLStateCache {
	readonly gl: WebGLRenderingContext;
	readonly locs: WebGLLocations;

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

	constructor(gl: WebGLRenderingContext, locs: WebGLLocations) {
		this.gl = gl;
		this.locs = locs;
	}

	reset(): void {
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
		this.gl.uniform4f(this.locs.colorLoc, r, g, b, a);
		this.colorR = r;
		this.colorG = g;
		this.colorB = b;
		this.colorA = a;
		this.colorSet = true;
	}

	setStyle(v: number): void {
		if (this.style === v) return;
		this.gl.uniform1i(this.locs.styleLoc, v);
		this.style = v;
	}

	setLineStyle(v: number): void {
		if (this.lineStyle === v) return;
		this.gl.uniform1i(this.locs.lineStyleLoc, v);
		this.lineStyle = v;
	}

	setScreenSpace(v: number): void {
		if (this.screenSpace === v) return;
		this.gl.uniform1i(this.locs.screenSpaceLoc, v);
		this.screenSpace = v;
	}

	setPointSize(v: number): void {
		if (this.pointSize === v) return;
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
		this.gl.uniform2f(this.locs.xScaleOffLoc, a, b);
		this.xScaleA = a;
		this.xScaleB = b;
		this.xScaleSet = true;
	}

	setYScaleOff(a: number, b: number): void {
		if (this.yScaleSet && this.yScaleA === a && this.yScaleB === b) return;
		this.gl.uniform2f(this.locs.yScaleOffLoc, a, b);
		this.yScaleA = a;
		this.yScaleB = b;
		this.yScaleSet = true;
	}

	enableAttrib(loc: number): void {
		if (this.attribEnabled.get(loc) !== true) {
			this.gl.enableVertexAttribArray(loc);
			this.attribEnabled.set(loc, true);
			this.attribConst.delete(loc);
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
