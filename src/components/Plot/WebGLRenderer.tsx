import React, {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useMemo,
	useRef,
} from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../services/persistence";
import { useGraphStore } from "../../store/useGraphStore";
import { hexToRgba } from "../../utils/colors";
import { getColumnIndex } from "../../utils/columns";
import { exactPixelSize } from "../../hooks/useDevicePixelSize";
import { buildOverlay, type OverlayInput } from "./buildOverlay";
import { describeChart } from "./chartDescription";
import type { OverlayState } from "./drawOverlay";
import type { SceneContext } from "./frameScene";
import {
	acquireRenderBackend,
	releaseRenderBackend,
	type RenderBackend,
} from "./renderBackend";
import type {
	RendererSeriesInput,
	RendererViewport,
	RenderLabel,
} from "./rendererCore";

export type { OverlayInput } from "./buildOverlay";

interface Props {
	datasets: Dataset[];
	series: SeriesConfig[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	width: number;
	height: number;
	/** Defaults to window.devicePixelRatio. */
	dpr?: number;
	/** Exact device-pixel canvas size, when the host measured it. */
	pixelWidth?: number;
	pixelHeight?: number;
	padding: { top: number; right: number; bottom: number; left: number };
	isInteracting?: boolean;
	highlightedSeriesId?: string | null;
	plotBg: string;
}

export interface WebGLRendererHandle {
	redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => void;
	setOverlay: (overlay: OverlayInput) => void;
	setLabels: (labels: RenderLabel[]) => void;
	/** See RenderBackend.sceneShared — false until the backend exists. */
	sceneShared: () => boolean;
	setSceneContext: (ctx: SceneContext) => void;
}

function viewportOf(
	p: Pick<
		Props,
		"width" | "height" | "padding" | "dpr" | "pixelWidth" | "pixelHeight"
	>,
): RendererViewport {
	const dpr = p.dpr ?? (window.devicePixelRatio || 1);
	return {
		width: p.width,
		height: p.height,
		padding: p.padding,
		dpr,
		pixelWidth: exactPixelSize(p.width, dpr, p.pixelWidth),
		pixelHeight: exactPixelSize(p.height, dpr, p.pixelHeight),
	};
}

/**
 * React host for the plot renderer. All GL work lives in `RendererCore`,
 * which runs inside an OffscreenCanvas render worker when the browser
 * supports it (falling back to the main thread otherwise) — this component
 * only resolves store/props into plain renderer inputs (columns, rgba
 * colors, styles) and forwards imperative redraw/overlay calls from
 * ChartContainer's rAF loop to the active backend.
 */
export const WebGLRenderer = React.memo(
	forwardRef<WebGLRendererHandle, Props>((props, ref) => {
		const {
			datasets,
			series,
			xAxes,
			yAxes,
			width,
			height,
			dpr,
			pixelWidth,
			pixelHeight,
			padding,
			isInteracting = false,
			highlightedSeriesId,
			plotBg,
		} = props;
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const backendRef = useRef<RenderBackend | null>(null);
		const overlayScratchRef = useRef<OverlayState>({
			packed: new Float32Array(2048),
			packedLen: 0,
			groups: [],
		});
		const liveXAxesRef = useRef<XAxisConfig[]>(xAxes);
		const liveYAxesRef = useRef<YAxisConfig[]>(yAxes);
		const isInteractingRef = useRef(isInteracting);

		const propsRef = useRef(props);
		useEffect(() => {
			propsRef.current = props;
		}, [props]);

		const previewColor = useGraphStore((state) => state.previewColor);
		const previewStyle = useGraphStore((state) => state.previewStyle);

		const redrawNow = (interacting: boolean) => {
			backendRef.current?.redraw(
				liveXAxesRef.current,
				liveYAxesRef.current,
				interacting,
				propsRef.current.highlightedSeriesId ?? null,
			);
		};
		// Latest-callback ref so the stable imperative handle and effects always
		// call the current closure (same pattern as ChartContainer's syncViewportRef).
		const redrawNowRef = useRef(redrawNow);
		redrawNowRef.current = redrawNow;

		useImperativeHandle(
			ref,
			() => ({
				redraw: (xAxes: XAxisConfig[], yAxes: YAxisConfig[]) => {
					liveXAxesRef.current = xAxes;
					liveYAxesRef.current = yAxes;
					redrawNowRef.current(isInteractingRef.current);
				},
				setOverlay: (overlay: OverlayInput) => {
					const vp = viewportOf(propsRef.current);
					buildOverlay(
						overlay,
						vp.width,
						vp.height,
						vp.padding,
						vp.dpr,
						overlayScratchRef.current,
					);
					backendRef.current?.setOverlay(overlayScratchRef.current);
				},
				setLabels: (labels: RenderLabel[]) => {
					backendRef.current?.setLabels(labels);
				},
				sceneShared: () => backendRef.current?.sceneShared() ?? false,
				setSceneContext: (ctx: SceneContext) => {
					backendRef.current?.setSceneContext(ctx);
				},
			}),
			[],
		);

		useEffect(() => {
			const canvas = canvasRef.current;
			if (!canvas) return;
			backendRef.current = acquireRenderBackend(
				canvas,
				viewportOf(propsRef.current),
				hexToRgba(propsRef.current.plotBg ?? "#ffffff"),
			);
			return () => {
				backendRef.current = null;
				releaseRenderBackend(canvas);
			};
		}, []);

		/** Resolve series + datasets + preview overrides into renderer inputs. */
		const rendererSeries = useMemo(() => {
			const datasetsById: Record<string, Dataset> = {};
			for (let i = 0; i < datasets.length; i++) {
				datasetsById[datasets[i].id] = datasets[i];
			}

			const result: RendererSeriesInput[] = [];
			for (let i = 0; i < series.length; i++) {
				const s = series[i];
				const ds = datasetsById[s.sourceId];
				if (!ds) continue;

				const xIdx = getColumnIndex(ds, ds.xAxisColumn);
				const yIdx = getColumnIndex(ds, s.yColumn);
				if (xIdx === -1 || yIdx === -1) continue;

				const colX = ds.data[xIdx];
				const colY = ds.data[yIdx];
				if (!colX || !colY) continue;

				const isPreviewed = previewColor?.seriesId === s.id;
				const stylePreview = previewStyle?.seriesId === s.id ? previewStyle : null;

				result.push({
					id: s.id,
					segKey: `seg-${ds.id}-${xIdx}-${yIdx}-dyn`,
					xAxisId: ds.xAxisId ?? "",
					yAxisId: s.yAxisId,
					hidden: !!s.hidden,
					xData: colX.data,
					yData: colY.data,
					xRef: colX.refPoint,
					yRef: colY.refPoint,
					lineColorRgba: hexToRgba(isPreviewed ? previewColor.color : s.lineColor),
					pointColorRgba: hexToRgba(isPreviewed ? previewColor.color : s.pointColor),
					lineStyle: stylePreview?.lineStyle ?? s.lineStyle,
					pointStyle: stylePreview?.pointStyle ?? s.pointStyle,
				});
			}
			return result;
		}, [datasets, series, previewColor, previewStyle]);

		useEffect(() => {
			liveXAxesRef.current = xAxes;
			liveYAxesRef.current = yAxes;
		}, [xAxes, yAxes]);

		// A DPR change alone re-sizes the backing store and, through the
		// viewport's dpr, re-rasterises the label atlas on the next frame.
		useEffect(() => {
			backendRef.current?.setViewport(
				viewportOf({ width, height, padding, dpr, pixelWidth, pixelHeight }),
			);
		}, [width, height, padding, dpr, pixelWidth, pixelHeight]);

		useEffect(() => {
			backendRef.current?.setPlotBg(hexToRgba(plotBg ?? "#ffffff"));
			if (!isInteractingRef.current) redrawNowRef.current(false);
		}, [plotBg]);

		useEffect(() => {
			const backend = backendRef.current;
			if (!backend) return;
			backend.setSeries(rendererSeries);
			if (!isInteractingRef.current) redrawNowRef.current(false);
		}, [rendererSeries]);

		useEffect(() => {
			isInteractingRef.current = isInteracting;
			if (!isInteracting) {
				// Interaction settled: redraw once at full pixel budget.
				redrawNowRef.current(false);
			}
		}, [isInteracting]);

		useEffect(() => {
			if (!isInteractingRef.current) redrawNowRef.current(false);
		}, [highlightedSeriesId]);

		// A canvas exposes nothing to assistive technology, so the plot carries a
		// generated description of what it is currently showing. Rebuilt only
		// when the series or axis identities change — never on the per-frame
		// path, which mutates axis ranges through refs without re-rendering.
		const ariaLabel = useMemo(
			() => describeChart({ series, datasets, xAxes, yAxes }),
			[series, datasets, xAxes, yAxes],
		);

		// No width/height attributes here: once the canvas is transferred to the
		// render worker, only the worker may size its drawing buffer. CSS keeps
		// the element filling its layer; backends resize via setViewport.
		//
		// tabIndex makes the plot a tab stop: pan/zoom listens on the window, so
		// the keys always worked, but without a stop here a keyboard user tabbed
		// straight past the chart — never hearing the description and with no
		// focus ring to say the arrow keys now move the viewport.
		return (
			<canvas
				ref={canvasRef}
				role="img"
				tabIndex={0}
				aria-label={ariaLabel}
				style={{ display: "block", width: "100%", height: "100%" }}
			/>
		);
	}),
);
