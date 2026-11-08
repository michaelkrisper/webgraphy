import { useCallback, useEffect, useState } from "react";

export const SIDEBAR_WIDTH_KEY = "webgraphy-sidebar-width";
export const SIDEBAR_DEFAULT_WIDTH = 400;
export const SIDEBAR_MIN_WIDTH = 320;
const SIDEBAR_MAX_WIDTH = 720;
/** The plot keeps at least this much of the window. */
const MIN_PLOT_WIDTH = 400;

export function clampSidebarWidth(
	width: number,
	viewport = typeof window === "undefined" ? Infinity : window.innerWidth,
): number {
	const max = Math.max(
		SIDEBAR_MIN_WIDTH,
		Math.min(SIDEBAR_MAX_WIDTH, viewport - MIN_PLOT_WIDTH),
	);
	return Math.round(Math.min(max, Math.max(SIDEBAR_MIN_WIDTH, width)));
}

function readStoredWidth(): number {
	try {
		const n = Number(localStorage.getItem(SIDEBAR_WIDTH_KEY));
		return n > 0 ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_WIDTH;
	} catch {
		return SIDEBAR_DEFAULT_WIDTH;
	}
}

/**
 * Sidebar width in CSS px, persisted in localStorage. `setWidth` clamps and
 * shows the change; `commit` also stores it, so a drag writes once at the end.
 */
export function useSidebarWidth() {
	const [width, setRaw] = useState(readStoredWidth);
	const setWidth = useCallback((w: number) => setRaw(clampSidebarWidth(w)), []);
	const commit = useCallback((w: number) => {
		const next = clampSidebarWidth(w);
		setRaw(next);
		try {
			if (next === SIDEBAR_DEFAULT_WIDTH)
				localStorage.removeItem(SIDEBAR_WIDTH_KEY);
			else localStorage.setItem(SIDEBAR_WIDTH_KEY, String(next));
		} catch {
			// Storage unavailable: the width still applies for this session.
		}
	}, []);
	// A smaller window must still leave the plot its minimum width.
	useEffect(() => {
		const onResize = () => setRaw((w) => clampSidebarWidth(w));
		window.addEventListener("resize", onResize);
		return () => window.removeEventListener("resize", onResize);
	}, []);
	return {
		width,
		maxWidth: clampSidebarWidth(Number.MAX_SAFE_INTEGER),
		setWidth,
		commit,
	};
}
