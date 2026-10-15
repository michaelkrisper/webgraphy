import { watchContextLoss } from "./contextLoss";
import type { OverlayState } from "./drawOverlay";
import type { RenderBackend } from "./renderBackend";
import {
	type RenderAxis,
	RendererCore,
	type RendererSeriesInput,
	type RendererViewport,
	type RenderLabel,
	sizeCanvasToViewport,
} from "./rendererCore";

/**
 * Runs a `RendererCore` synchronously on the main thread: the fallback when
 * `OffscreenCanvas` is unavailable (and the path unit tests exercise under
 * jsdom, where `getContext("webgl2")` is null). Loaded lazily by
 * renderBackend.ts.
 */
export class DirectBackend implements RenderBackend {
	private readonly canvas: HTMLCanvasElement;
	private core: RendererCore | null;
	// While the context is lost the core keeps collecting inputs (so it can
	// be restored with them) but must not draw.
	private contextLost = false;
	private lastAxes: { x: RenderAxis[]; y: RenderAxis[] } | null = null;
	private readonly unwatchContext: () => void;

	constructor(
		canvas: HTMLCanvasElement,
		viewport: RendererViewport,
		plotBg: number[],
	) {
		this.canvas = canvas;
		this.core = RendererCore.create(canvas);
		this.core?.setViewport(viewport);
		this.core?.setPlotBg(plotBg);
		this.unwatchContext = watchContextLoss(canvas, {
			lost: () => {
				this.contextLost = true;
			},
			restored: () => this.restoreContext(),
		});
	}

	private restoreContext(): void {
		this.contextLost = false;
		if (!this.core) return;
		this.core = RendererCore.restore(this.canvas, this.core);
		if (this.core && this.lastAxes) {
			this.core.drawFrame(this.lastAxes.x, this.lastAxes.y);
		}
	}

	setViewport(viewport: RendererViewport): void {
		sizeCanvasToViewport(this.canvas, viewport);
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
		this.lastAxes = { x: xAxes, y: yAxes };
		if (this.contextLost) return;
		this.core.drawFrame(xAxes, yAxes);
	}

	dispose(): void {
		this.unwatchContext();
		this.core?.dispose();
	}
}
