import {
	latestHistoryId,
	undoIfLatest,
	useGraphStore,
	withHistory,
} from "./useGraphStore";
import { notify } from "./useNotificationStore";

/**
 * Runs a delete and, if it recorded a history entry, shows "Deleted 'name'"
 * with an Undo button bound to that entry. The toast keeps only the entry id,
 * so it never pins the deleted data in memory.
 */
export function deleteWithUndo(name: string, remove: () => void): void {
	const before = latestHistoryId();
	remove();
	notifyUndoable(`Deleted '${name}'`, before);
}

/**
 * Shows `message` with an Undo button bound to the history entry recorded
 * since `before` (a {@link latestHistoryId} taken earlier); no toast when
 * nothing was recorded.
 */
export function notifyUndoable(
	message: string,
	before: number | undefined,
): void {
	const id = latestHistoryId();
	if (id === undefined || id === before) return;
	notify({
		kind: "info",
		message,
		action: { label: "Undo", onAction: () => undoIfLatest(id) },
	});
}

/** Removes several series as one undoable step behind a single toast. */
export function removeSeriesWithUndo(
	name: string,
	ids: readonly string[],
): void {
	deleteWithUndo(name, () =>
		withHistory(`delete series '${name}'`, () => {
			const { removeSeries } = useGraphStore.getState();
			for (const id of ids) removeSeries(id);
		}),
	);
}
