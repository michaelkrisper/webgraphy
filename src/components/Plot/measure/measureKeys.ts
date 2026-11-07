import {
	hasKey,
	isEditableTarget,
	overlayOwnsKeyboard,
	SHORTCUTS,
} from "../../../utils/shortcuts";

export type MeasureKeyAction = "clearPins" | "toggleStats";

/** Window-level keys of the measurement tools; null when the key is not ours. */
export function measureKeyAction(
	e: Pick<
		KeyboardEvent,
		"key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented"
	>,
	doc: Document = document,
): MeasureKeyAction | null {
	if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
	if (isEditableTarget(e.target)) return null;
	const action = hasKey(SHORTCUTS.clearPins, e.key)
		? "clearPins"
		: hasKey(SHORTCUTS.toggleStats, e.key)
			? "toggleStats"
			: null;
	// A dialog or popover owns the keyboard (and Escape) while it is open.
	if (!action || overlayOwnsKeyboard(doc)) return null;
	return action;
}
