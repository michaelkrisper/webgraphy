// Global keyboard listener for the chart pan/zoom hook. Tracks the live
// Ctrl/Shift modifier state (so cursors and SVG overlays can react), keeps a
// shared `pressedKeys` set in sync, and kicks syncViewport whenever an
// arrow or +/- key is pressed (the per-frame loop reads from `pressedKeys`
// to apply continuous keyboard pan/zoom).

import { useEffect } from "react";

const PAN_KEYS = new Set([
	"ArrowLeft",
	"ArrowRight",
	"ArrowUp",
	"ArrowDown",
]);
const ZOOM_KEYS = new Set(["+", "-"]);
const ZOOM_PREVENT_DEFAULT_KEYS = new Set(["+", "-", "=", "_"]);

function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement
	);
}

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
			if (e.ctrlKey && ZOOM_PREVENT_DEFAULT_KEYS.has(e.key)) e.preventDefault();
			pressedKeys.current.add(e.key);
			if (PAN_KEYS.has(e.key) || ZOOM_KEYS.has(e.key)) {
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
