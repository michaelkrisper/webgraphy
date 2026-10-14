// src/components/Plot/Crosshair.tsx
import React, { useCallback, useEffect, useMemo, useRef } from "react";
import {
	buildSeriesMetadata,
	buildXAxisNames,
	computeSnap,
	copySnap,
	drawCanvas,
	renderTooltipHTML,
	shouldCopyTooltip,
} from "./crosshair";
import type { SnapResult } from "./crosshair";

const Crosshair = React.memo(
	({
		containerRef,
		padding,
		width,
		height,
		isPanning,
		xAxes,
		yAxes,
		datasets,
		series,
		tooltipColor,
		snapLineColor,
		tooltipDividerColor,
		tooltipSubColor,
		plotBg,
	}: import("./crosshair").CrosshairProps) => {
		const canvasRef = useRef<HTMLCanvasElement>(null);
		const tooltipRef = useRef<HTMLDivElement>(null);
		const posRef = useRef<{ x: number; y: number } | null>(null);
		const lastSnapRef = useRef<SnapResult | null>(null);

		const seriesMetadata = useMemo(
			() => buildSeriesMetadata(series, datasets, xAxes, yAxes),
			[series, datasets, xAxes, yAxes],
		);

		const xAxisNameById = useMemo(() => buildXAxisNames(datasets), [datasets]);

		const computeSnapFn = useCallback(
			(pos: { x: number; y: number }): SnapResult | null => {
				return computeSnap({
					pos,
					seriesMetadata,
					xAxisNameById,
					width,
					height,
					padding,
				});
			},
			[seriesMetadata, width, height, padding, xAxisNameById],
		);

		const drawCanvasFn = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				drawCanvas({
					canvas: canvasRef.current,
					snap,
					pos,
					isPanning,
					snapLineColor,
					padding,
					width,
					height,
					plotBg,
				});
			},
			[isPanning, snapLineColor, padding, height, width, plotBg],
		);

		const renderTooltipHTMLFn = useCallback(
			(snap: SnapResult | null, pos: { x: number; y: number } | null) => {
				renderTooltipHTML({
					tooltip: tooltipRef.current,
					snap,
					pos,
					isPanning,
					tooltipSubColor,
					tooltipDividerColor,
					tooltipColor,
				});
			},
			[isPanning, tooltipColor, tooltipDividerColor, tooltipSubColor],
		);

		const updateCrosshair = useCallback(
			(pos: { x: number; y: number } | null) => {
				posRef.current = pos;
				const snap = pos ? computeSnapFn(pos) : null;
				lastSnapRef.current = snap;
				drawCanvasFn(snap, pos);
				renderTooltipHTMLFn(snap, pos);
			},
			[computeSnapFn, drawCanvasFn, renderTooltipHTMLFn],
		);

		useEffect(() => {
			const el = containerRef.current;
			if (!el) return;
			let rafId: number | null = null;
			let pendingPos: { x: number; y: number } | null = null;
			let cachedRect: DOMRect = el.getBoundingClientRect();
			const refreshRect = () => {
				cachedRect = el.getBoundingClientRect();
			};
			const ro = new ResizeObserver(refreshRect);
			ro.observe(el);
			window.addEventListener("scroll", refreshRect, true);
			window.addEventListener("resize", refreshRect);

			const schedule = () => {
				if (rafId !== null) return;
				rafId = requestAnimationFrame(() => {
					rafId = null;
					updateCrosshair(pendingPos);
				});
			};

			const handleMove = (e: MouseEvent | TouchEvent) => {
				if (isPanning) {
					if (rafId) cancelAnimationFrame(rafId);
					rafId = null;
					pendingPos = null;
					updateCrosshair(null);
					return;
				}
				const rect = cachedRect;
				let clientX: number;
				let clientY: number;
				if ("touches" in e) {
					if (e.touches.length !== 1) {
						pendingPos = null;
						schedule();
						return;
					}
					clientX = e.touches[0].clientX;
					clientY = e.touches[0].clientY;
				} else {
					clientX = e.clientX;
					clientY = e.clientY;
				}
				const x = clientX - rect.left;
				const y = clientY - rect.top;
				if (
					x >= padding.left &&
					x <= width - padding.right &&
					y >= padding.top &&
					y <= height - padding.bottom
				) {
					pendingPos = { x, y };
				} else {
					pendingPos = null;
				}
				schedule();
			};
			const handleLeave = () => {
				pendingPos = null;
				schedule();
			};
			window.addEventListener("mousemove", handleMove);
			window.addEventListener("touchstart", handleMove);
			window.addEventListener("touchmove", handleMove);
			el.addEventListener("mouseleave", handleLeave);
			return () => {
				if (rafId) cancelAnimationFrame(rafId);
				ro.disconnect();
				window.removeEventListener("scroll", refreshRect, true);
				window.removeEventListener("resize", refreshRect);
				window.removeEventListener("mousemove", handleMove);
				window.removeEventListener("touchstart", handleMove);
				window.removeEventListener("touchmove", handleMove);
				el.removeEventListener("mouseleave", handleLeave);
			};
		}, [containerRef, padding, width, height, isPanning, updateCrosshair]);

		// Redraw when inputs that affect snap/styles change (without depending on pos).
		useEffect(() => {
			updateCrosshair(posRef.current);
		}, [updateCrosshair]);

		useEffect(() => {
			const handleKeyDown = (e: KeyboardEvent) => {
				if (!shouldCopyTooltip(e)) return;
				const snap = lastSnapRef.current;
				if (!snap) return;
				e.preventDefault();
				void copySnap(snap);
			};
			window.addEventListener("keydown", handleKeyDown);
			return () => window.removeEventListener("keydown", handleKeyDown);
		}, []);

		return (
			<>
				<canvas
					ref={canvasRef}
					width={width * (window.devicePixelRatio || 1)}
					height={height * (window.devicePixelRatio || 1)}
					style={{
						position: "absolute",
						inset: 0,
						width: "100%",
						height: "100%",
						pointerEvents: "none",
						zIndex: 15,
					}}
				/>
				<div
					ref={tooltipRef}
					className="chart-tooltip"
					style={{
						whiteSpace: "pre",
						boxShadow: "0 10px 15px -3px var(--shadow)",
						display: "none",
					}}
				/>
			</>
		);
	},
);

Crosshair.displayName = "Crosshair";

export { Crosshair };
export type { CrosshairProps } from "./crosshair";
