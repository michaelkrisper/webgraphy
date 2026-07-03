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

import type { OverlayState } from "../components/Plot/drawSeries";
import {
	type RenderAxis,
	RendererCore,
	type RendererSeriesInput,
	type RendererViewport,
} from "../components/Plot/rendererCore";

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
	  }
	| { t: "viewport"; viewport: RendererViewport }
	| { t: "plotBg"; rgb: number[] }
	| { t: "series"; list: WorkerSeriesMsg[] }
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
	  }
	| { t: "dispose" };

let canvas: OffscreenCanvas | null = null;
let core: RendererCore | null = null;
const columns = new Map<number, Float32Array>();

let latestFrame: { xAxes: RenderAxis[]; yAxes: RenderAxis[] } | null = null;
let drawScheduled = false;

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
			break;
		}
		case "viewport": {
			applyViewport(msg.viewport);
			if (latestFrame) scheduleDraw();
			break;
		}
		case "plotBg": {
			core?.setPlotBg(msg.rgb);
			if (latestFrame) scheduleDraw();
			break;
		}
		case "series": {
			applySeries(msg.list);
			if (latestFrame) scheduleDraw();
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
