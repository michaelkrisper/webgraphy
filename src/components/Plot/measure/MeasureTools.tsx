// Measurement tools on the plot: click-placed cursors A/B with a delta
// readout, and the visible-range statistics panel (S). Both panels are
// lazy-loaded; this host only owns the pin state, the input handling and the
// pin overlay canvas, which ChartContainer's rAF loop redraws imperatively.

import React, {
	forwardRef,
	lazy,
	Suspense,
	useEffect,
	useImperativeHandle,
	useLayoutEffect,
	useMemo,
	useRef,
	useState,
} from "react";
import type {
	Dataset,
	SeriesConfig,
	XAxisConfig,
	YAxisConfig,
} from "../../../services/persistence";
import {
	buildSeriesMetadata,
	buildXAxisNames,
} from "../crosshair/seriesMetadata";
import { drawPins } from "./drawPins";
import { measureKeyAction } from "./measureKeys";
import {
	addPin,
	NO_PINS,
	type PinId,
	type PinPair,
	pinAtScreen,
	removePin,
} from "./pins";

const MeasureReadout = lazy(() =>
	import("./MeasurePanels").then((m) => ({ default: m.MeasureReadout })),
);
const StatsPanel = lazy(() =>
	import("./MeasurePanels").then((m) => ({ default: m.StatsPanel })),
);

/** A press that moves further than this is a pan, not a click. */
const CLICK_SLOP_PX = 4;
/** Panels start below the pin tags so they never cover a tag's ×. */
const PIN_TAG_CLEARANCE = 26;

export interface MeasureToolsHandle {
	/** Called per viewport frame with the live (not yet committed) axes. */
	redraw: (liveX: readonly XAxisConfig[], liveY: readonly YAxisConfig[]) => void;
}

interface Props {
	containerRef: React.RefObject<HTMLElement | null>;
	width: number;
	height: number;
	padding: { top: number; right: number; bottom: number; left: number };
	series: SeriesConfig[];
	datasets: Dataset[];
	xAxes: XAxisConfig[];
	yAxes: YAxisConfig[];
	lineColor: string;
	plotBg: string;
}

export const MeasureTools = React.memo(
	forwardRef<MeasureToolsHandle, Props>((props, ref) => {
		const {
			containerRef,
			width,
			height,
			padding,
			series,
			datasets,
			xAxes,
			yAxes,
			lineColor,
			plotBg,
		} = props;
		const [pins, setPins] = useState<PinPair>(NO_PINS);
		const [statsOpen, setStatsOpen] = useState(false);
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const tagRefs = useRef<Record<PinId, HTMLDivElement | null>>({
			a: null,
			b: null,
		});
		const liveX = useRef<Record<string, XAxisConfig>>({});
		const liveY = useRef<Record<string, YAxisConfig>>({});
		const seenAxes = useRef<{ x: XAxisConfig[]; y: YAxisConfig[] } | null>(null);

		const metadata = useMemo(
			() => buildSeriesMetadata(series, datasets, xAxes, yAxes),
			[series, datasets, xAxes, yAxes],
		);
		const xAxisNames = useMemo(() => buildXAxisNames(datasets), [datasets]);

		// Points of series that were since hidden or deleted drop out.
		const shownPins = useMemo((): PinPair => {
			const live = new Set(metadata.map((m) => m.series.id));
			const keep = (pin: PinPair["a"]) =>
				pin && {
					...pin,
					points: pin.points.filter((p) => live.has(p.seriesId)),
				};
			return { a: keep(pins.a), b: keep(pins.b) };
		}, [pins, metadata]);

		const draw = () => {
			const xs = drawPins({
				canvas: canvasRef.current,
				pins: shownPins,
				xRange: (id) => liveX.current[id],
				yRange: (id) => liveY.current[id],
				width,
				height,
				padding,
				lineColor,
				plotBg,
			});
			for (const id of ["a", "b"] as const) {
				const tag = tagRefs.current[id];
				if (!tag) continue;
				const sx = xs[id];
				tag.style.display = sx === null ? "none" : "";
				if (sx !== null) tag.style.left = `${sx}px`;
			}
		};
		const drawRef = useRef(draw);
		const latest = useRef({
			metadata,
			xAxisNames,
			width,
			height,
			padding,
			pins,
			statsOpen,
		});

		// Committed store ranges (load, undo, sidebar edits) replace the live
		// ones; between commits the rAF loop keeps them current via redraw().
		useLayoutEffect(() => {
			if (seenAxes.current?.x !== xAxes || seenAxes.current?.y !== yAxes) {
				seenAxes.current = { x: xAxes, y: yAxes };
				for (const a of xAxes) liveX.current[a.id] = a;
				for (const a of yAxes) liveY.current[a.id] = a;
			}
			latest.current = {
				metadata,
				xAxisNames,
				width,
				height,
				padding,
				pins,
				statsOpen,
			};
			drawRef.current = draw;
			draw();
		});

		useImperativeHandle(
			ref,
			() => ({
				redraw: (lx, ly) => {
					for (const a of lx) liveX.current[a.id] = a;
					for (const a of ly) liveY.current[a.id] = a;
					drawRef.current();
				},
			}),
			[],
		);

		useEffect(() => {
			const el = containerRef.current;
			if (!el) return;
			let down: { x: number; y: number } | null = null;
			// Pins as they were before the first click of a double-click, which
			// fits the axes instead of pinning.
			let beforeClick: PinPair | null = null;

			const onMouseDown = (e: MouseEvent) => {
				const t = e.target as Element | null;
				const onPlot = t === el || !!t?.closest?.(".chart-webgl-layer");
				down =
					onPlot &&
					e.button === 0 &&
					!(e.ctrlKey || e.metaKey || e.altKey || e.shiftKey)
						? { x: e.clientX, y: e.clientY }
						: null;
			};
			const onClick = (e: MouseEvent) => {
				const start = down;
				const undo = beforeClick;
				down = null;
				beforeClick = null;
				if (
					!start ||
					Math.hypot(e.clientX - start.x, e.clientY - start.y) > CLICK_SLOP_PX
				) {
					return;
				}
				if (e.detail >= 2) {
					if (undo) setPins(undo);
					return;
				}
				const { metadata, xAxisNames, width, height, padding } = latest.current;
				const rect = el.getBoundingClientRect();
				const pos = { x: e.clientX - rect.left, y: e.clientY - rect.top };
				if (
					pos.x < padding.left ||
					pos.x > width - padding.right ||
					pos.y < padding.top ||
					pos.y > height - padding.bottom
				) {
					return;
				}
				const pin = pinAtScreen(
					pos,
					metadata,
					liveX.current,
					liveY.current,
					xAxisNames,
					width,
					height,
					padding,
				);
				if (!pin) return;
				beforeClick = latest.current.pins;
				setPins(addPin(beforeClick, pin));
			};
			const onKeyDown = (e: KeyboardEvent) => {
				const action = measureKeyAction(e);
				if (action === "toggleStats") {
					e.preventDefault();
					setStatsOpen((o) => !o);
				} else if (action === "clearPins") {
					const { pins, statsOpen } = latest.current;
					if (pins.a || pins.b) setPins(NO_PINS);
					else if (statsOpen) setStatsOpen(false);
					else return;
					e.preventDefault();
				}
			};
			el.addEventListener("mousedown", onMouseDown);
			el.addEventListener("click", onClick);
			window.addEventListener("keydown", onKeyDown);
			return () => {
				el.removeEventListener("mousedown", onMouseDown);
				el.removeEventListener("click", onClick);
				window.removeEventListener("keydown", onKeyDown);
			};
		}, [containerRef]);

		const dpr = window.devicePixelRatio || 1;
		const stop = (e: React.SyntheticEvent) => e.stopPropagation();
		const panelsOpen = !!shownPins.a || statsOpen;

		return (
			<>
				<canvas
					ref={canvasRef}
					className="measure-canvas"
					width={width * dpr}
					height={height * dpr}
				/>
				{(["a", "b"] as const).map(
					(id) =>
						shownPins[id] && (
							<div
								key={id}
								ref={(n) => {
									tagRefs.current[id] = n;
								}}
								className="pin-tag"
								style={{ top: padding.top }}
								onMouseDown={stop}
								onDoubleClick={stop}
							>
								<span aria-hidden="true">{id.toUpperCase()}</span>
								<button
									type="button"
									className="pin-tag-close"
									aria-label={`Remove cursor ${id.toUpperCase()}`}
									onClick={() => setPins((prev) => removePin(prev, id))}
								>
									×
								</button>
							</div>
						),
				)}
				{panelsOpen && (
					<div
						className="measure-panels"
						style={{ left: padding.left + 8, top: padding.top + PIN_TAG_CLEARANCE }}
						onMouseDown={stop}
						onDoubleClick={stop}
						onWheel={stop}
					>
						<Suspense fallback={null}>
							{shownPins.a && (
								<MeasureReadout
									a={shownPins.a}
									b={shownPins.b}
									xAxes={xAxes}
									yAxes={yAxes}
									xAxisNames={xAxisNames}
									onClose={() => setPins(NO_PINS)}
								/>
							)}
							{statsOpen && (
								<StatsPanel
									series={series}
									datasets={datasets}
									xAxes={xAxes}
									yAxes={yAxes}
									onClose={() => setStatsOpen(false)}
								/>
							)}
						</Suspense>
					</div>
				)}
			</>
		);
	}),
);

MeasureTools.displayName = "MeasureTools";
