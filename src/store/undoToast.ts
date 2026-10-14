import { latestHistoryId, undoIfLatest } from "./useGraphStore";
import { notify } from "./useNotificationStore";

/**
 * Runs a delete and, if it recorded a history entry, shows "Deleted 'name'"
 * with an Undo button bound to that entry. The toast keeps only the entry id,
 * so it never pins the deleted data in memory.
 */
export function deleteWithUndo(name: string, remove: () => void): void {
	const before = latestHistoryId();
	remove();
	const id = latestHistoryId();
	if (id === undefined || id === before) return;
	notify({
		kind: "info",
		message: `Deleted '${name}'`,
		action: { label: "Undo", onAction: () => undoIfLatest(id) },
	});
}
