/**
 * Render backends: the bridge between the React host component and the
 * `RendererCore`.
 *
 * - `WorkerBackend` transfers the canvas via `transferControlToOffscreen()`
 *   and drives a `RendererCore` inside `workers/render.worker.ts` — frames,
 *   decimation, and GL work leave the main thread entirely. Column data is
 *   sent once per Float32Array identity (keyed, cached worker-side) and
 *   pruned symmetrically on both sides when series disappear.
 * - `DirectBackend` runs the same core synchronously on the main thread —
 *   the fallback when `OffscreenCanvas` is unavailable (and the path unit
 *   tests exercise under jsdom, where `getContext("webgl2")` is null).
 *
 * `acquireRenderBackend`/`releaseRenderBackend` make backend ownership safe
 * under React StrictMode's mount → cleanup → mount cycle: a canvas can only
 * be transferred to an OffscreenCanvas once, so release defers disposal by a
 * tick and re-acquire on the same canvas cancels it and reuses the backend.
 */

import type {
	RenderWorkerRequest,
	WorkerSeriesMsg,
} from "../../workers/render.worker";
import { getAxisById } from "../../utils/axisCalculations";
import { logger } from "../../utils/logger";
import type { OverlayState } from "./drawOverlay";
import type { SceneContext } from "./frameScene";
import {
	type RenderAxis,
	RendererCore,
	type RendererSeriesInput,
	type RendererViewport,
	type RenderLabel,
} from "./rendererCore";
import { VIEWPORT_SAB_BYTES, ViewportWriter } from "./viewportChannel";

export interface RenderBackend {
	setViewport(viewport: RendererViewport): void;
	setPlotBg(rgb: number[]): void;
	setSeries(list: RendererSeriesInput[]): void;
	setOverlay(ov: OverlayState): void;
	setLabels(labels: RenderLabel[]): void;
	/**
	 * True when the backend derives overlay/labels itself from the shared
	 * viewport — the host then skips its per-frame scene building and only
	 * needs to keep the scene context up to date.
	 */
	sceneShared(): boolean;
	setSceneContext(ctx: SceneContext): void;
	redraw(
		xAxes: RenderAxis[],
		yAxes: RenderAxis[],
		interacting: boolean,
		highlight: string | null,
	): void;
	dispose(): void;
}

function sizeCanvas(
	canvas: HTMLCanvasElement | OffscreenCanvas,
	viewport: RendererViewport,
): void {
	const pw = Math.max(1, Math.round(viewport.width * viewport.dpr));
	const ph = Math.max(1, Math.round(viewport.height * viewport.dpr));
	if (canvas.width !== pw) canvas.width = pw;
	if (canvas.height !== ph) canvas.height = ph;
}

class DirectBackend implements RenderBackend {
	private readonly canvas: HTMLCanvasElement;
	private readonly core: RendererCore | null;

	constructor(
		canvas: HTMLCanvasElement,
		viewport: RendererViewport,
		plotBg: number[],
	) {
		this.canvas = canvas;
		this.core = RendererCore.create(canvas);
		this.core?.setViewport(viewport);
		this.core?.setPlotBg(plotBg);
	}

	setViewport(viewport: RendererViewport): void {
		sizeCanvas(this.canvas, viewport);
		this.core?.setViewport(viewport);
	}

	setPlotBg(rgb: number[]): void {
		this.core?.setPlotBg(rgb);
	}

	setSeries(list: RendererSeriesInput[]): void {
		this.core?.setSeries(list);
	}

	setOverlay(ov: OverlayState): void {
		// Same-thread: the core reads straight from the host-owned scratch.
		this.core?.setOverlay(ov.packed, ov.packedLen, ov.groups);
	}

	setLabels(labels: RenderLabel[]): void {
		this.core?.setLabels(labels);
	}

	sceneShared(): boolean {
		return false;
	}

	setSceneContext(): void {}

	redraw(
		xAxes: RenderAxis[],
		yAxes: RenderAxis[],
		interacting: boolean,
		highlight: string | null,
	): void {
		if (!this.core) return;
		this.core.setInteracting(interacting);
		this.core.setHighlight(highlight);
		this.core.drawFrame(xAxes, yAxes);
	}

	dispose(): void {
		this.core?.dispose();
	}
}

// Stable numeric ids per column array identity, shared across backends so a
// re-created backend (theme change) still keys the same data consistently.
const columnIds = new WeakMap<Float32Array, number>();
let nextColumnId = 1;

function getColumnId(data: Float32Array): number {
	let id = columnIds.get(data);
	if (id === undefined) {
		id = nextColumnId++;
		columnIds.set(data, id);
	}
	return id;
}

function slimAxes(axes: RenderAxis[]): RenderAxis[] {
	const out: RenderAxis[] = new Array(axes.length);
	for (let i = 0; i < axes.length; i++) {
		const a = axes[i];
		out[i] = { id: a.id, min: a.min, max: a.max };
	}
	return out;
}

class WorkerBackend implements RenderBackend {
	private readonly worker: Worker;
	/** Column ids the worker currently holds — resend only what it lacks. */
	private workerCols = new Set<number>();
	private pendingOverlay: {
		packed: Float32Array;
		packedLen: number;
		groups: OverlayState["groups"];
	} | null = null;
	private pendingLabels: RenderLabel[] | null = null;
	// Shared-viewport mode (crossOriginIsolated only): per-frame axis ranges
	// go through a seqlocked SharedArrayBuffer instead of postMessage, and the
	// worker builds overlay/labels itself from the scene context.
	private writer: ViewportWriter | null = null;
	private sceneVersion = 0;
	private xOrder: string[] = [];
	private yOrder: string[] = [];
	private lastWriteAt = 0;
	private lastHighlight: string | null = null;
	private rangeScratchX: { min: number; max: number }[] = [];
	private rangeScratchY: { min: number; max: number }[] = [];

	constructor(
		canvas: HTMLCanvasElement,
		viewport: RendererViewport,
		plotBg: number[],
		createWorker: () => Worker,
	) {
		const offscreen = canvas.transferControlToOffscreen();
		this.worker = createWorker();
		this.worker.onerror = (ev) => {
			logger.error("Render worker error:", ev.message ?? ev);
		};
		let viewportSab: SharedArrayBuffer | undefined;
		if (
			typeof SharedArrayBuffer !== "undefined" &&
			typeof crossOriginIsolated !== "undefined" &&
			crossOriginIsolated
		) {
			viewportSab = new SharedArrayBuffer(VIEWPORT_SAB_BYTES);
			this.writer = new ViewportWriter(viewportSab);
		}
		this.post(
			{ t: "init", canvas: offscreen, viewport, plotBg, viewportSab },
			[offscreen],
		);
	}

	private post(msg: RenderWorkerRequest, transfer?: Transferable[]): void {
		if (transfer) this.worker.postMessage(msg, transfer);
		else this.worker.postMessage(msg);
	}

	setViewport(viewport: RendererViewport): void {
		this.post({ t: "viewport", viewport });
	}

	setPlotBg(rgb: number[]): void {
		this.post({ t: "plotBg", rgb });
	}

	setSeries(list: RendererSeriesInput[]): void {
		const msgList: WorkerSeriesMsg[] = [];
		const keep = new Set<number>();
		for (const s of list) {
			const xColId = getColumnId(s.xData);
			const yColId = getColumnId(s.yData);
			const sendX = !this.workerCols.has(xColId) && !keep.has(xColId);
			const sendY = !this.workerCols.has(yColId) && !keep.has(yColId);
			keep.add(xColId);
			keep.add(yColId);
			msgList.push({
				id: s.id,
				segKey: s.segKey,
				xAxisId: s.xAxisId,
				yAxisId: s.yAxisId,
				hidden: s.hidden,
				xColId,
				yColId,
				xData: sendX ? s.xData : undefined,
				yData: sendY ? s.yData : undefined,
				xRef: s.xRef,
				yRef: s.yRef,
				lineColorRgba: s.lineColorRgba,
				pointColorRgba: s.pointColorRgba,
				lineStyle: s.lineStyle,
				pointStyle: s.pointStyle,
			});
		}
		// The worker prunes to exactly this set, so mirror it here.
		this.workerCols = keep;
		this.post({ t: "series", list: msgList });
	}

	setOverlay(ov: OverlayState): void {
		// Snapshot: the host mutates its scratch in place next frame, and the
		// packed buffer is transferred (zero-copy) with the frame message.
		this.pendingOverlay = {
			packed: ov.packed.slice(0, ov.packedLen),
			packedLen: ov.packedLen,
			groups: ov.groups.slice(),
		};
	}

	setLabels(labels: RenderLabel[]): void {
		this.pendingLabels = labels;
	}

	sceneShared(): boolean {
		return this.writer !== null;
	}

	setSceneContext(ctx: SceneContext): void {
		if (!this.writer) return;
		this.sceneVersion++;
		this.xOrder = ctx.xAxesMeta.map((m) => m.id);
		this.yOrder = ctx.yAxesMeta.map((m) => m.id);
		this.post({ t: "sceneCtx", ctx, version: this.sceneVersion });
	}

	/** Collect ranges for the ids in `order`, reusing the scratch entries. */
	private collectRanges(
		axes: RenderAxis[],
		order: string[],
		scratch: { min: number; max: number }[],
	): { min: number; max: number }[] {
		scratch.length = order.length;
		for (let i = 0; i < order.length; i++) {
			const axis = getAxisById(axes, order[i]);
			let entry = scratch[i];
			if (!entry) {
				entry = { min: 0, max: 1 };
				scratch[i] = entry;
			}
			entry.min = axis ? axis.min : 0;
			entry.max = axis ? axis.max : 1;
		}
		return scratch;
	}

	redraw(
		xAxes: RenderAxis[],
		yAxes: RenderAxis[],
		interacting: boolean,
		highlight: string | null,
	): void {
		if (this.writer) {
			if (highlight !== this.lastHighlight) {
				this.lastHighlight = highlight;
				this.post({ t: "highlight", id: highlight });
			}
			this.writer.write(
				this.sceneVersion,
				interacting,
				this.collectRanges(xAxes, this.xOrder, this.rangeScratchX),
				this.collectRanges(yAxes, this.yOrder, this.rangeScratchY),
			);
			// The worker's render loop parks itself when idle; nudge it back to
			// life when writes resume after a pause.
			const now = Date.now();
			if (now - this.lastWriteAt > 1000) this.post({ t: "wake" });
			this.lastWriteAt = now;
			return;
		}
		const overlay = this.pendingOverlay;
		this.pendingOverlay = null;
		const labels = this.pendingLabels;
		this.pendingLabels = null;
		this.post(
			{
				t: "frame",
				xAxes: slimAxes(xAxes),
				yAxes: slimAxes(yAxes),
				interacting,
				highlight,
				overlay: overlay ?? undefined,
				labels: labels ?? undefined,
			},
			overlay ? [overlay.packed.buffer] : undefined,
		);
	}

	dispose(): void {
		this.worker.terminate();
	}
}

function createBackend(
	canvas: HTMLCanvasElement,
	viewport: RendererViewport,
	plotBg: number[],
): RenderBackend {
	sizeCanvas(canvas, viewport);
	if (
		typeof canvas.transferControlToOffscreen === "function" &&
		typeof Worker === "function"
	) {
		try {
			return new WorkerBackend(canvas, viewport, plotBg, () => {
				return new Worker(
					new URL("../../workers/render.worker.ts", import.meta.url),
					{ type: "module" },
				);
			});
		} catch (err) {
			logger.error(
				"OffscreenCanvas render worker unavailable, falling back to main-thread rendering:",
				err,
			);
		}
	}
	return new DirectBackend(canvas, viewport, plotBg);
}

const backendByCanvas = new WeakMap<HTMLCanvasElement, RenderBackend>();
const disposeTimers = new WeakMap<
	HTMLCanvasElement,
	ReturnType<typeof setTimeout>
>();

/**
 * Get (or create) the backend bound to this canvas element. Cancels any
 * disposal scheduled by a StrictMode cleanup for the same canvas.
 */
export function acquireRenderBackend(
	canvas: HTMLCanvasElement,
	viewport: RendererViewport,
	plotBg: number[],
): RenderBackend {
	const pending = disposeTimers.get(canvas);
	if (pending !== undefined) {
		clearTimeout(pending);
		disposeTimers.delete(canvas);
	}
	let backend = backendByCanvas.get(canvas);
	if (!backend) {
		backend = createBackend(canvas, viewport, plotBg);
		backendByCanvas.set(canvas, backend);
	}
	return backend;
}

/**
 * Schedule disposal of the canvas' backend. Deferred one tick so a StrictMode
 * remount (or fast unmount/mount with the same element) reuses the live
 * backend instead of tearing down a transferred canvas it can never rebuild.
 */
export function releaseRenderBackend(canvas: HTMLCanvasElement): void {
	const backend = backendByCanvas.get(canvas);
	if (!backend) return;
	disposeTimers.set(
		canvas,
		setTimeout(() => {
			backendByCanvas.delete(canvas);
			disposeTimers.delete(canvas);
			backend.dispose();
		}, 0),
	);
}
