// Tracks the device-pixel ratio and, where the browser reports it, the exact
// device-pixel size of an element's content box — what a canvas backing
// store has to match to stay crisp. round(cssSize * dpr) can be a pixel off
// at fractional scaling, and window.devicePixelRatio changes (window moved to
// another monitor, browser zoom) fire no resize event at all.
//
// ResizeObserver's `device-pixel-content-box` covers both: it reports exact
// sizes and fires when only the DPR changed. Where it is unsupported
// (Safari), a `(resolution: <dpr>dppx)` media query catches DPR changes and
// the pixel size is left to the CSS * dpr fallback.

import { useEffect, useState } from "react";

export interface DevicePixelSize {
	dpr: number;
	/** Exact device-pixel content-box size; undefined when not reported. */
	pixelWidth?: number;
	pixelHeight?: number;
}

function currentDpr(): number {
	return window.devicePixelRatio || 1;
}

/**
 * Exact backing-store size for a CSS box, or undefined when the measured
 * device-pixel size does not belong to it — the two come from separate
 * observers and can be a render apart, and a stale exact size would stretch
 * the frame far more than the rounding it is meant to fix.
 */
export function exactPixelSize(
	cssSize: number,
	dpr: number,
	pixelSize: number | undefined,
): number | undefined {
	if (pixelSize === undefined) return undefined;
	return Math.abs(pixelSize - cssSize * dpr) < 1.5 ? pixelSize : undefined;
}

export function useDevicePixelSize(
	ref: React.RefObject<HTMLElement | null>,
): DevicePixelSize {
	const [size, setSize] = useState<DevicePixelSize>(() => ({
		dpr: currentDpr(),
	}));

	useEffect(() => {
		const el = ref.current;
		let exact: DevicePixelSize | null = null;

		const publish = () => {
			const dpr = currentDpr();
			// An exact size measured at another DPR is stale until the
			// observer reports again.
			const pw = exact?.dpr === dpr ? exact.pixelWidth : undefined;
			const ph = exact?.dpr === dpr ? exact.pixelHeight : undefined;
			setSize((prev) =>
				prev.dpr === dpr && prev.pixelWidth === pw && prev.pixelHeight === ph
					? prev
					: { dpr, pixelWidth: pw, pixelHeight: ph },
			);
		};

		let observer: ResizeObserver | null = null;
		if (el && typeof ResizeObserver === "function") {
			observer = new ResizeObserver((entries) => {
				const box = entries[entries.length - 1]?.devicePixelContentBoxSize?.[0];
				if (!box) return;
				exact = {
					dpr: currentDpr(),
					pixelWidth: box.inlineSize,
					pixelHeight: box.blockSize,
				};
				publish();
			});
			try {
				observer.observe(el, { box: "device-pixel-content-box" });
			} catch {
				// Unsupported box value throws a TypeError.
				observer.disconnect();
				observer = null;
			}
		}

		// A resolution query only matches one DPR, so re-arm on every change.
		let mql: MediaQueryList | null = null;
		const onDprChange = () => {
			arm();
			publish();
		};
		const arm = () => {
			mql?.removeEventListener("change", onDprChange);
			mql = null;
			if (typeof window.matchMedia !== "function") return;
			mql = window.matchMedia(`(resolution: ${currentDpr()}dppx)`);
			mql.addEventListener("change", onDprChange);
		};
		arm();
		publish();

		return () => {
			observer?.disconnect();
			mql?.removeEventListener("change", onDprChange);
		};
	}, [ref]);

	return size;
}
