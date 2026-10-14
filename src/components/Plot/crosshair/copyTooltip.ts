import { notify } from "../../../store/useNotificationStore";
import { hasKey, isEditableTarget, SHORTCUTS } from "../../../utils/shortcuts";
import type { SnapResult } from "./types";

/**
 * Ctrl+C copies the tooltip only when nothing else claims the keystroke: a
 * focused text control, an open dialog, or a text selection anywhere on the
 * page all keep the browser's own copy.
 */
export function shouldCopyTooltip(
	e: Pick<
		KeyboardEvent,
		"key" | "ctrlKey" | "metaKey" | "altKey" | "target" | "defaultPrevented"
	>,
	doc: Document = document,
): boolean {
	if (e.defaultPrevented || !(e.ctrlKey || e.metaKey) || e.altKey) return false;
	if (!hasKey(SHORTCUTS.copyTooltip, e.key)) return false;
	if (isEditableTarget(e.target)) return false;
	if ((e.target as HTMLElement | null)?.isContentEditable) return false;
	if (doc.querySelector('[aria-modal="true"]')) return false;
	const sel = doc.getSelection();
	return !sel || sel.toString() === "";
}

export function snapToText(snap: SnapResult): string {
	return snap.entries
		.map((g) => {
			const itemsText = g.items
				.map(
					(i) =>
						`${i.label}: ${i.valueLabel ?? i.value.toLocaleString(undefined, { maximumSignificantDigits: 7 })}`,
				)
				.join("\n");
			return `${g.xAxisName}: ${g.xLabel}\n${itemsText}`;
		})
		.join("\n\n");
}

export async function copySnap(snap: SnapResult): Promise<boolean> {
	try {
		// Missing outside secure contexts; the throw lands in the catch.
		await navigator.clipboard.writeText(snapToText(snap));
		notify({ kind: "success", message: "Tooltip values copied" });
		return true;
	} catch {
		notify({ kind: "error", message: "Could not copy to the clipboard" });
		return false;
	}
}
