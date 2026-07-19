/// <reference lib="webworker" />

/**
 * Render worker: owns the WebGL2 context of the plot canvas via
 * OffscreenCanvas and runs the full `RendererCore` draw path (M4 decimation,
 * buffer uploads, instanced line drawing) off the main thread.
 *
 * Column data arrives once per Float32Array identity (`xColId`/`yColId`) and
 * is cached in `columns`; subsequent series messages reference ids only. The
 * cache is pruned to exactly the ids of the latest series message — the
 * backend mirrors this, so host and worker agree on what needs resending.
 *
 * Frame messages are coalesced: only the newest pending frame is drawn on
 * the next worker rAF tick, so a burst of pan events costs one draw.
 */

import type { OverlayState } from "../components/Plot/drawOverlay";
import {
	buildFrameScene,
	createFrameSceneCaches,
	type SceneContext,
} from "../components/Plot/frameScene";
import {
	type RenderAxis,
	RendererCore,
	type RendererSeriesInput,
	type RendererViewport,
	type RenderLabel,
} from "../components/Plot/rendererCore";
import {
	createViewportSnapshot,
	ViewportReader,
} from "../components/Plot/viewportChannel";

export interface WorkerSeriesMsg {
	id: string;
	segKey: string;
	xAxisId: string;
	yAxisId: string;
	hidden: boolean;
	xColId: number;
	yColId: number;
	/** Present only when the worker has not seen this column id yet. */
	xData?: Float32Array;
	yData?: Float32Array;
	xRef: number;
	yRef: number;
	lineColorRgba: number[];
	pointColorRgba: number[];
	lineStyle: "solid" | "dashed" | "dotted" | "none";
	pointStyle: "circle" | "square" | "cross" | "none";
}

export type RenderWorkerRequest =
	| {
			t: "init";
			canvas: OffscreenCanvas;
			viewport: RendererViewport;
			plotBg: number[];
			/** Present when crossOriginIsolated: per-frame viewport handoff. */
			viewportSab?: SharedArrayBuffer;
	  }
	| { t: "viewport"; viewport: RendererViewport }
	| { t: "plotBg"; rgb: number[] }
	| { t: "series"; list: WorkerSeriesMsg[] }
	| { t: "sceneCtx"; ctx: SceneContext; version: number }
	| { t: "highlight"; id: string | null }
	| { t: "wake" }
	| {
			t: "frame";
			xAxes: RenderAxis[];
			yAxes: RenderAxis[];
			interacting: boolean;
			highlight: string | null;
			overlay?: {
				packed: Float32Array;
				packedLen: number;
				groups: OverlayState["groups"];
			};
			labels?: RenderLabel[];
	  }
	| { t: "dispose" };

let canvas: OffscreenCanvas | null = null;
let core: RendererCore | null = null;
const columns = new Map<number, Float32Array>();

let latestFrame: { xAxes: RenderAxis[]; yAxes: RenderAxis[] } | null = null;
let drawScheduled = false;

// --- SharedArrayBuffer viewport mode ---------------------------------------
// The worker polls the shared viewport once per rAF and derives the whole
// scene (tick layouts, overlay geometry, labels) itself; the main thread's
// only per-frame work is the seqlocked write. The loop parks after ~2s
// without a new snapshot and is restarted by a "wake" message.
const IDLE_PARK_FRAMES = 120;
let viewportReader: ViewportReader | null = null;
const viewportSnap = createViewportSnapshot();
let sceneCtx: SceneContext | null = null;
let sceneCtxVersion = -1;
const sceneCaches = createFrameSceneCaches();
let currentViewport: RendererViewport | null = null;
let loopRunning = false;
let idleFrames = 0;
let sceneDirty = false;
// Reused per-frame axis arrays (ids stable per scene context).
const sabXAxes: RenderAxis[] = [];
const sabYAxes: RenderAxis[] = [];

function drawSharedFrame(): void {
	if (!core || !sceneCtx || !currentViewport) return;
	sabXAxes.length = 0;
	sabYAxes.length = 0;
	const xCount = Math.min(viewportSnap.xCount, sceneCtx.xAxesMeta.length);
	const yCount = Math.min(viewportSnap.yCount, sceneCtx.yAxesMeta.length);
	for (let i = 0; i < xCount; i++) {
		sabXAxes.push({
			id: sceneCtx.xAxesMeta[i].id,
			min: viewportSnap.ranges[i * 2],
			max: viewportSnap.ranges[i * 2 + 1],
		});
	}
	for (let i = 0; i < yCount; i++) {
		sabYAxes.push({
			id: sceneCtx.yAxesMeta[i].id,
			min: viewportSnap.ranges[(viewportSnap.xCount + i) * 2],
			max: viewportSnap.ranges[(viewportSnap.xCount + i) * 2 + 1],
		});
	}
	const scene = buildFrameScene(
		sceneCtx,
		sceneCtxVersion,
		viewportSnap,
		currentViewport.dpr,
		sceneCaches,
	);
	core.setOverlay(
		scene.overlay.packed,
		scene.overlay.packedLen,
		scene.overlay.groups,
	);
	core.setLabels(scene.labels);
	core.setInteracting(viewportSnap.interacting);
	core.drawFrame(sabXAxes, sabYAxes);
}

function sharedLoop(): void {
	if (!viewportReader || !core) {
		loopRunning = false;
		return;
	}
	const fresh = viewportReader.read(viewportSnap);
	if ((fresh || sceneDirty) && viewportSnap.version === sceneCtxVersion) {
		sceneDirty = false;
		idleFrames = 0;
		drawSharedFrame();
	} else {
		idleFrames++;
	}
	if (idleFrames > IDLE_PARK_FRAMES) {
		loopRunning = false;
		return;
	}
	requestAnimationFrame(sharedLoop);
}

function wakeSharedLoop(): void {
	if (!viewportReader || loopRunning) return;
	loopRunning = true;
	idleFrames = 0;
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(sharedLoop);
	} else {
		loopRunning = false;
	}
}
// ---------------------------------------------------------------------------

function scheduleDraw(): void {
	if (drawScheduled) return;
	drawScheduled = true;
	const run = () => {
		drawScheduled = false;
		if (core && latestFrame) {
			core.drawFrame(latestFrame.xAxes, latestFrame.yAxes);
		}
	};
	// rAF exists in workers wherever OffscreenCanvas does; guard anyway.
	if (typeof requestAnimationFrame === "function") {
		requestAnimationFrame(run);
	} else {
		setTimeout(run, 0);
	}
}

function applyViewport(viewport: RendererViewport): void {
	if (canvas) {
		const pw = Math.max(1, Math.round(viewport.width * viewport.dpr));
		const ph = Math.max(1, Math.round(viewport.height * viewport.dpr));
		if (canvas.width !== pw) canvas.width = pw;
		if (canvas.height !== ph) canvas.height = ph;
	}
	currentViewport = viewport;
	core?.setViewport(viewport);
}

function applySeries(list: WorkerSeriesMsg[]): void {
	const resolved: RendererSeriesInput[] = [];
	const keep = new Set<number>();
	for (const s of list) {
		if (s.xData) columns.set(s.xColId, s.xData);
		if (s.yData) columns.set(s.yColId, s.yData);
		keep.add(s.xColId);
		keep.add(s.yColId);
		const xData = columns.get(s.xColId);
		const yData = columns.get(s.yColId);
		if (!xData || !yData) continue;
		resolved.push({
			id: s.id,
			segKey: s.segKey,
			xAxisId: s.xAxisId,
			yAxisId: s.yAxisId,
			hidden: s.hidden,
			xData,
			yData,
			xRef: s.xRef,
			yRef: s.yRef,
			lineColorRgba: s.lineColorRgba,
			pointColorRgba: s.pointColorRgba,
			lineStyle: s.lineStyle,
			pointStyle: s.pointStyle,
		});
	}
	for (const id of columns.keys()) {
		if (!keep.has(id)) columns.delete(id);
	}
	core?.setSeries(resolved);
}

self.onmessage = (ev: MessageEvent<RenderWorkerRequest>) => {
	const msg = ev.data;
	switch (msg.t) {
		case "init": {
			canvas = msg.canvas;
			applyViewport(msg.viewport);
			core = RendererCore.create(msg.canvas);
			core?.setViewport(msg.viewport);
			core?.setPlotBg(msg.plotBg);
			if (msg.viewportSab) viewportReader = new ViewportReader(msg.viewportSab);
			break;
		}
		case "viewport": {
			applyViewport(msg.viewport);
			if (latestFrame) scheduleDraw();
			sceneDirty = true;
			wakeSharedLoop();
			break;
		}
		case "plotBg": {
			core?.setPlotBg(msg.rgb);
			if (latestFrame) scheduleDraw();
			sceneDirty = true;
			wakeSharedLoop();
			break;
		}
		case "series": {
			applySeries(msg.list);
			if (latestFrame) scheduleDraw();
			sceneDirty = true;
			wakeSharedLoop();
			break;
		}
		case "sceneCtx": {
			sceneCtx = msg.ctx;
			sceneCtxVersion = msg.version;
			sceneDirty = true;
			wakeSharedLoop();
			break;
		}
		case "highlight": {
			core?.setHighlight(msg.id);
			sceneDirty = true;
			wakeSharedLoop();
			break;
		}
		case "wake": {
			wakeSharedLoop();
			break;
		}
		case "frame": {
			if (msg.overlay) {
				core?.setOverlay(
					msg.overlay.packed,
					msg.overlay.packedLen,
					msg.overlay.groups,
				);
			}
			if (msg.labels) core?.setLabels(msg.labels);
			core?.setInteracting(msg.interacting);
			core?.setHighlight(msg.highlight);
			latestFrame = { xAxes: msg.xAxes, yAxes: msg.yAxes };
			scheduleDraw();
			break;
		}
		case "dispose": {
			core?.dispose();
			core = null;
			columns.clear();
			self.close();
			break;
		}
	}
};
