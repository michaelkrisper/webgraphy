// Global undo/redo shortcuts:
//   Ctrl+Z (Cmd+Z)                    undo
//   Ctrl+Shift+Z / Ctrl+Y (Cmd+...)   redo
// Ignored while focus is in a form field, so text inputs keep native undo.
// Unlike the chart keys it stays live while a dialog or popover is open
// (no overlayOwnsKeyboard() gate): the colour and style pickers apply their
// edits at once, and Ctrl+Z takes one back without closing the picker. No
// overlay binds Ctrl+Z or Ctrl+Y itself.

import { useEffect } from "react";
import { useGraphStore } from "../store/useGraphStore";
import { isEditableTarget } from "../utils/shortcuts";

export function undoRedoActionFor(
	e: Pick<
		KeyboardEvent,
		"key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "target"
	>,
): "undo" | "redo" | null {
	if (!(e.ctrlKey || e.metaKey) || e.altKey) return null;
	if (isEditableTarget(e.target)) return null;
	const key = e.key.toLowerCase();
	if (key === "z") return e.shiftKey ? "redo" : "undo";
	if (key === "y" && !e.shiftKey) return "redo";
	return null;
}

export function useUndoRedoShortcuts(): void {
	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			const action = undoRedoActionFor(e);
			if (!action) return;
			e.preventDefault();
			useGraphStore.getState()[action]();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}
