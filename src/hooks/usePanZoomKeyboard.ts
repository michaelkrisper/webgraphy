// Global keyboard listener for the chart pan/zoom hook. Tracks the live
// Ctrl/Shift modifier state (so cursors and SVG overlays can react), keeps a
// shared `pressedKeys` set in sync, and kicks syncViewport whenever an
// arrow or +/- key is pressed (the per-frame loop reads from `pressedKeys`
// to apply continuous keyboard pan/zoom).

import { useEffect } from "react";
import { hasKey, isEditableTarget, SHORTCUTS } from "../utils/shortcuts";

const NAV_SHORTCUTS = [
	SHORTCUTS.panX,
	SHORTCUTS.panY,
	SHORTCUTS.zoomIn,
	SHORTCUTS.zoomOut,
];

interface Options {
	pressedKeys: React.MutableRefObject<Set<string>>;
	syncViewport: () => void;
	setIsCtrlPressed: (pressed: boolean) => void;
	setIsShiftPressed: (pressed: boolean) => void;
}

export function usePanZoomKeyboard({
	pressedKeys,
	syncViewport,
	setIsCtrlPressed,
	setIsShiftPressed,
}: Options): void {
	useEffect(() => {
		const handleKey = (e: KeyboardEvent) => {
			if (e.key === "Control") setIsCtrlPressed(e.type === "keydown");
			if (e.key === "Shift") setIsShiftPressed(e.type === "keydown");
			if (e.type === "keyup") {
				pressedKeys.current.delete(e.key);
				return;
			}
			if (isEditableTarget(e.target)) return;
			const isZoomKey =
				hasKey(SHORTCUTS.zoomIn, e.key) || hasKey(SHORTCUTS.zoomOut, e.key);
			// Ctrl +/- would otherwise zoom the whole page (SHORTCUTS.zoomXOnly).
			if (e.ctrlKey && isZoomKey) e.preventDefault();
			pressedKeys.current.add(e.key);
			if (NAV_SHORTCUTS.some((s) => hasKey(s, e.key))) {
				syncViewport();
			}
		};
		window.addEventListener("keydown", handleKey);
		window.addEventListener("keyup", handleKey);
		return () => {
			window.removeEventListener("keydown", handleKey);
			window.removeEventListener("keyup", handleKey);
		};
	}, [pressedKeys, syncViewport, setIsCtrlPressed, setIsShiftPressed]);
}
