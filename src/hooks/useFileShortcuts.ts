// Ctrl+S saves the session, Ctrl+O opens a data or session file
// (SHORTCUTS.saveSession / openFile), Cmd on macOS.

import { useEffect, useRef } from "react";
import {
	hasKey,
	isEditableTarget,
	overlayOwnsKeyboard,
	SHORTCUTS,
} from "../utils/shortcuts";

export type FileAction = "saveSession" | "openFile";

export function fileActionFor(
	e: Pick<
		KeyboardEvent,
		"key" | "ctrlKey" | "metaKey" | "shiftKey" | "altKey" | "defaultPrevented"
	>,
): FileAction | null {
	if (e.defaultPrevented || !(e.ctrlKey || e.metaKey)) return null;
	if (e.shiftKey || e.altKey) return null;
	if (hasKey(SHORTCUTS.saveSession, e.key)) return "saveSession";
	if (hasKey(SHORTCUTS.openFile, e.key)) return "openFile";
	return null;
}

/**
 * Window-level Ctrl+S / Ctrl+O. The browser's "Save page" and "Open file"
 * dialogs never help in the app, so both keys are always claimed; the action
 * itself stands down in form fields and while a dialog or popover is open.
 * One action runs at a time: a held or repeated key would otherwise open a
 * second picker, which no longer has the user activation.
 */
export function useFileShortcuts(
	onSave: () => Promise<void> | void,
	onOpen: () => Promise<void> | void,
): void {
	const handlers = useRef({ saveSession: onSave, openFile: onOpen });
	useEffect(() => {
		handlers.current = { saveSession: onSave, openFile: onOpen };
	}, [onSave, onOpen]);

	useEffect(() => {
		let busy = false;
		const run = async (action: FileAction) => {
			busy = true;
			try {
				await handlers.current[action]();
			} finally {
				busy = false;
			}
		};
		const onKeyDown = (e: KeyboardEvent) => {
			const action = fileActionFor(e);
			if (!action) return;
			e.preventDefault();
			if (busy || e.repeat || isEditableTarget(e.target)) return;
			if (overlayOwnsKeyboard()) return;
			void run(action);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);
}
