/**
 * GPU label atlas for the WebGL renderer.
 *
 * Each unique (font, text-run list) is rasterized once into a shared
 * canvas-backed RGBA texture; drawing afterwards is an instanced textured
 * quad per label. Runs are multi-colored segments (used by y-axis titles),
 * a plain label is a single run.
 *
 * Worker-safe: uses `OffscreenCanvas` when available (always true inside the
 * render worker) and falls back to a DOM canvas on the main-thread path.
 * Regions are shelf-packed and kept until the atlas overflows, which resets
 * it wholesale — live labels re-rasterize lazily on demand.
 */

export interface LabelRun {
	text: string;
	color: string;
}

export interface AtlasRegion {
	/** Normalized UV rect in the atlas texture. */
	u0: number;
	v0: number;
	uw: number;
	vh: number;
	/** Region size in device px (text + padding). */
	wPx: number;
	hPx: number;
	/** Text advance width / ascent+descent in CSS px. */
	cssWidth: number;
	cssHeight: number;
	/** Padded-top → alphabetic-baseline distance, CSS px. */
	ascent: number;
	/** Anti-aliasing bleed margin, CSS px per side. */
	pad: number;
}

const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;
const PAD = 2;
const MAX_REGIONS = 4096;

const FONT_SIZE_RE = /(\d+(?:\.\d+)?)px/;

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement;
type AnyCanvas2D =
	| OffscreenCanvasRenderingContext2D
	| CanvasRenderingContext2D;

function makeCanvas(width: number, height: number): AnyCanvas | null {
	if (typeof OffscreenCanvas !== "undefined") {
		return new OffscreenCanvas(width, height);
	}
	if (typeof document !== "undefined") {
		const c = document.createElement("canvas");
		c.width = width;
		c.height = height;
		return c;
	}
	return null;
}

export class GlLabelAtlas {
	private readonly gl: WebGL2RenderingContext;
	texture: WebGLTexture | null = null;
	private scratch: AnyCanvas | null = null;
	private scratchCtx: AnyCanvas2D | null = null;
	private regions = new Map<string, AtlasRegion | null>();
	private cursorX = 0;
	private cursorY = 0;
	private rowHeight = 0;
	private dpr = 1;
	private failed = false;

	constructor(gl: WebGL2RenderingContext) {
		this.gl = gl;
		const tex = gl.createTexture();
		if (!tex) {
			this.failed = true;
			return;
		}
		this.texture = tex;
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texImage2D(
			gl.TEXTURE_2D,
			0,
			gl.RGBA,
			ATLAS_WIDTH,
			ATLAS_HEIGHT,
			0,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			null,
		);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
	}

	/** A DPR change re-rasterizes everything (regions reset, lazily refilled). */
	setDpr(dpr: number): void {
		if (dpr === this.dpr) return;
		this.dpr = dpr;
		this.reset();
	}

	private reset(): void {
		this.regions.clear();
		this.cursorX = 0;
		this.cursorY = 0;
		this.rowHeight = 0;
	}

	private ensureScratch(): AnyCanvas2D | null {
		if (this.scratchCtx) return this.scratchCtx;
		if (this.failed) return null;
		this.scratch = makeCanvas(1, 1);
		const ctx = this.scratch?.getContext("2d") as AnyCanvas2D | null;
		if (!ctx) {
			this.failed = true;
			return null;
		}
		this.scratchCtx = ctx;
		return ctx;
	}

	/**
	 * Region for the given runs, rasterizing + uploading on first sight.
	 * Returns null when 2D rasterization is unavailable in this environment.
	 */
	ensure(runs: LabelRun[], font: string): AtlasRegion | null {
		if (this.failed || !this.texture) return null;
		let key = font;
		for (const r of runs) key += `${r.color}${r.text}`;
		const cached = this.regions.get(key);
		if (cached !== undefined) return cached;

		const ctx = this.ensureScratch();
		if (!ctx) return null;

		ctx.font = font;
		const fontSize = Number.parseFloat(FONT_SIZE_RE.exec(font)?.[1] ?? "10");
		let cssWidth = 0;
		let maxAscent = 0;
		let maxDescent = 0;
		let hasMetrics = false;
		const widths: number[] = [];
		for (const r of runs) {
			const m = ctx.measureText(r.text);
			widths.push(m.width);
			cssWidth += m.width;
			// Older TextMetrics may lack the bounding-box fields; fall back to
			// font-size heuristics below.
			if (m.actualBoundingBoxAscent !== undefined) {
				hasMetrics = true;
				maxAscent = Math.max(maxAscent, m.actualBoundingBoxAscent);
				maxDescent = Math.max(maxDescent, m.actualBoundingBoxDescent ?? 0);
			}
		}
		const ascent = hasMetrics ? maxAscent : fontSize * 0.8;
		const descent = hasMetrics ? maxDescent : fontSize * 0.25;
		const cssHeight = ascent + descent;
		const dpr = this.dpr;
		const wPx = Math.max(1, Math.ceil((cssWidth + 2 * PAD) * dpr));
		const hPx = Math.max(1, Math.ceil((cssHeight + 2 * PAD) * dpr));

		if (wPx > ATLAS_WIDTH) {
			// Pathological label; remember the failure so it isn't re-measured.
			this.regions.set(key, null);
			return null;
		}
		if (this.regions.size >= MAX_REGIONS) this.reset();
		if (this.cursorX + wPx > ATLAS_WIDTH) {
			this.cursorX = 0;
			this.cursorY += this.rowHeight;
			this.rowHeight = 0;
		}
		if (this.cursorY + hPx > ATLAS_HEIGHT) {
			// Atlas full: drop everything; live labels re-rasterize on demand.
			this.reset();
		}

		// Rasterize into the scratch canvas sized exactly to the region, so the
		// texSubImage2D upload overwrites the whole region including padding.
		const scratch = this.scratch as AnyCanvas;
		scratch.width = wPx;
		scratch.height = hPx;
		ctx.clearRect(0, 0, wPx, hPx);
		ctx.scale(dpr, dpr);
		ctx.font = font;
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		let x = PAD;
		for (let i = 0; i < runs.length; i++) {
			ctx.fillStyle = runs[i].color;
			ctx.fillText(runs[i].text, x, PAD + ascent);
			x += widths[i];
		}
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		const { gl } = this;
		gl.bindTexture(gl.TEXTURE_2D, this.texture);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
		gl.texSubImage2D(
			gl.TEXTURE_2D,
			0,
			this.cursorX,
			this.cursorY,
			gl.RGBA,
			gl.UNSIGNED_BYTE,
			scratch as TexImageSource,
		);
		gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);

		const region: AtlasRegion = {
			u0: this.cursorX / ATLAS_WIDTH,
			v0: this.cursorY / ATLAS_HEIGHT,
			uw: wPx / ATLAS_WIDTH,
			vh: hPx / ATLAS_HEIGHT,
			wPx,
			hPx,
			cssWidth,
			cssHeight,
			ascent,
			pad: PAD,
		};
		this.cursorX += wPx;
		if (hPx > this.rowHeight) this.rowHeight = hPx;
		this.regions.set(key, region);
		return region;
	}

	dispose(): void {
		if (this.texture) this.gl.deleteTexture(this.texture);
		this.texture = null;
		this.regions.clear();
	}
}
