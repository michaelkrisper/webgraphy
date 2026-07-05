/**
 * Cached text-label atlas for the 2D axes canvas.
 *
 * Tick labels are redrawn every rAF frame during pan/zoom; `fillText` rasters
 * and shapes the text on every call, which made it the dominant main-thread
 * cost. Each unique (font, color, text) is instead rendered once into a
 * shared atlas canvas and blitted with `drawImage` afterwards.
 *
 * A single large atlas matters: Chrome keeps small canvases CPU-backed, so
 * per-label canvases would re-upload a texture on every blit — measurably
 * slower than fillText. The atlas stays GPU-backed and blits are GPU copies.
 * Entries are packed in shelves and kept until the atlas runs out of space,
 * which resets it wholesale (labels re-render lazily on demand).
 *
 * Sprites are rendered at the current devicePixelRatio and blitted 1:1 under
 * the caller's dpr-scaled context, so labels stay crisp. When the atlas
 * canvas has no 2D context (jsdom, exotic environments) `draw` falls back to
 * plain `fillText`.
 */

interface AtlasEntry {
	/** Source rect in the atlas, device px. */
	sx: number;
	sy: number;
	sw: number;
	sh: number;
	/** Text advance width in CSS px. */
	cssWidth: number;
	/** Ascent + descent in CSS px. */
	cssHeight: number;
	/** Distance from the padded top edge to the alphabetic baseline, CSS px. */
	ascent: number;
}

/** Anti-aliasing bleed margin around the text, CSS px per side. */
const SPRITE_PAD = 2;
const ATLAS_WIDTH = 2048;
const ATLAS_HEIGHT = 1024;

const FONT_SIZE_RE = /(\d+(?:\.\d+)?)px/;

export class LabelSpriteCache {
	private entries = new Map<string, AtlasEntry>();
	private atlas: HTMLCanvasElement | null = null;
	private atlasCtx: CanvasRenderingContext2D | null = null;
	/** True once 2D contexts proved unavailable — take the fillText path. */
	private failed = false;
	private cursorX = 0;
	private cursorY = 0;
	private rowHeight = 0;
	private dpr = 1;
	private readonly atlasWidth: number;
	private readonly atlasHeight: number;

	constructor(atlasWidth = ATLAS_WIDTH, atlasHeight = ATLAS_HEIGHT) {
		this.atlasWidth = atlasWidth;
		this.atlasHeight = atlasHeight;
	}

	/** Call once at the start of a frame. A DPR change invalidates the atlas. */
	beginFrame(dpr: number): void {
		if (dpr !== this.dpr) {
			this.dpr = dpr;
			this.reset();
		}
	}

	private reset(): void {
		this.entries.clear();
		this.cursorX = 0;
		this.cursorY = 0;
		this.rowHeight = 0;
		if (this.atlas && this.atlasCtx) {
			this.atlasCtx.setTransform(1, 0, 0, 1, 0, 0);
			this.atlasCtx.clearRect(0, 0, this.atlas.width, this.atlas.height);
		}
	}

	private getEntry(
		text: string,
		font: string,
		color: string,
	): AtlasEntry | null {
		if (this.failed) return null;
		const key = `${font}|${color}|${text}`;
		const cached = this.entries.get(key);
		if (cached) return cached;

		if (!this.atlas) {
			this.atlas = document.createElement("canvas");
			this.atlas.width = this.atlasWidth;
			this.atlas.height = this.atlasHeight;
			this.atlasCtx = this.atlas.getContext("2d");
			if (!this.atlasCtx) {
				this.failed = true;
				return null;
			}
		}
		const ctx = this.atlasCtx;
		if (!ctx) return null;

		ctx.font = font;
		const m = ctx.measureText(text);
		// jsdom's TextMetrics has only `width`; approximate from the font size.
		const fontSize = Number.parseFloat(FONT_SIZE_RE.exec(font)?.[1] ?? "10");
		const ascent = m.actualBoundingBoxAscent ?? fontSize * 0.8;
		const descent = m.actualBoundingBoxDescent ?? fontSize * 0.25;
		const cssWidth = m.width;
		const cssHeight = ascent + descent;
		const sw = Math.max(1, Math.ceil((cssWidth + 2 * SPRITE_PAD) * this.dpr));
		const sh = Math.max(1, Math.ceil((cssHeight + 2 * SPRITE_PAD) * this.dpr));

		if (sw > this.atlasWidth) return null; // pathological label; draw directly
		if (this.cursorX + sw > this.atlasWidth) {
			this.cursorX = 0;
			this.cursorY += this.rowHeight;
			this.rowHeight = 0;
		}
		if (this.cursorY + sh > this.atlasHeight) {
			// Atlas full: drop everything; live labels re-render on demand.
			this.reset();
		}

		const sx = this.cursorX;
		const sy = this.cursorY;
		ctx.setTransform(this.dpr, 0, 0, this.dpr, sx, sy);
		ctx.font = font;
		ctx.fillStyle = color;
		ctx.textAlign = "left";
		ctx.textBaseline = "alphabetic";
		ctx.fillText(text, SPRITE_PAD, SPRITE_PAD + ascent);
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		this.cursorX += sw;
		if (sh > this.rowHeight) this.rowHeight = sh;

		const entry: AtlasEntry = { sx, sy, sw, sh, cssWidth, cssHeight, ascent };
		this.entries.set(key, entry);
		return entry;
	}

	/** Text advance width in CSS px, measured via the atlas entry (cached). */
	measure(
		ctx: CanvasRenderingContext2D,
		text: string,
		font: string,
		color: string,
	): number {
		const entry = this.getEntry(text, font, color);
		if (entry) return entry.cssWidth;
		ctx.font = font;
		return ctx.measureText(text).width;
	}

	/**
	 * Blit the label so its anchor semantics match
	 * `fillText(text, x, y)` under the given textAlign/textBaseline.
	 */
	draw(
		ctx: CanvasRenderingContext2D,
		text: string,
		font: string,
		color: string,
		x: number,
		y: number,
		align: "left" | "center" | "right",
		baseline: "alphabetic" | "middle",
	): void {
		const entry = this.getEntry(text, font, color);
		if (!entry || !this.atlas) {
			ctx.font = font;
			ctx.fillStyle = color;
			ctx.textAlign = align;
			ctx.textBaseline = baseline;
			ctx.fillText(text, x, y);
			return;
		}
		let left = x - SPRITE_PAD;
		if (align === "center") left -= entry.cssWidth / 2;
		else if (align === "right") left -= entry.cssWidth;
		const top =
			baseline === "middle"
				? y - entry.cssHeight / 2 - SPRITE_PAD
				: y - entry.ascent - SPRITE_PAD;
		// Destination size sw/dpr keeps a 1:1 device-pixel mapping under the
		// caller's dpr-scaled transform — no resampling.
		ctx.drawImage(
			this.atlas,
			entry.sx,
			entry.sy,
			entry.sw,
			entry.sh,
			left,
			top,
			entry.sw / this.dpr,
			entry.sh / this.dpr,
		);
	}
}
