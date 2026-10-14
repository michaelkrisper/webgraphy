import { create } from "zustand";

/** Oldest entries fall off beyond this, releasing the state they pinned. */
export const HISTORY_LIMIT = 100;
/** Repeated edits of the same field within this gap merge into one entry. */
export const COALESCE_WINDOW_MS = 1000;

export interface HistoryEntry<S> {
	id: number;
	label: string;
	/** The state to restore: before the action on the undo stack, after it on the redo stack. */
	snapshot: S;
	coalesceKey?: string;
	at: number;
}

export interface HistoryState<S> {
	past: HistoryEntry<S>[];
	future: HistoryEntry<S>[];
}

/**
 * Snapshot-based undo/redo stacks. Snapshots are stored by reference, so they
 * must be immutable state slices; nothing is ever copied. The stacks live in a
 * small Zustand store of their own so UI can subscribe to the labels without
 * touching the graph store.
 */
export function createHistory<S>(
	limit = HISTORY_LIMIT,
	coalesceMs = COALESCE_WINDOW_MS,
) {
	const store = create<HistoryState<S>>(() => ({ past: [], future: [] }));
	let nextId = 0;
	// Only the entry pushed last may absorb further edits: after an undo/redo
	// the top of the stack is an unrelated, older entry.
	let coalescibleId: number | null = null;

	const push = (
		label: string,
		snapshot: S,
		coalesceKey?: string,
		now = Date.now(),
	): number => {
		const { past } = store.getState();
		const top = past[past.length - 1];
		if (
			coalesceKey !== undefined &&
			top &&
			top.id === coalescibleId &&
			top.coalesceKey === coalesceKey &&
			now - top.at <= coalesceMs
		) {
			// Keep the oldest snapshot, slide the window.
			store.setState({
				past: [...past.slice(0, -1), { ...top, at: now }],
				future: [],
			});
			return top.id;
		}
		const entry: HistoryEntry<S> = {
			id: ++nextId,
			label,
			snapshot,
			coalesceKey,
			at: now,
		};
		const kept =
			past.length >= limit ? past.slice(past.length - limit + 1) : past;
		store.setState({ past: [...kept, entry], future: [] });
		coalescibleId = entry.id;
		return entry.id;
	};

	/** Pops the newest undo entry, parking `current` on the redo stack under the same id. */
	const undo = (current: S): HistoryEntry<S> | undefined => {
		const { past, future } = store.getState();
		const entry = past[past.length - 1];
		if (!entry) return undefined;
		coalescibleId = null;
		store.setState({
			past: past.slice(0, -1),
			future: [...future, { ...entry, snapshot: current }],
		});
		return entry;
	};

	const redo = (current: S): HistoryEntry<S> | undefined => {
		const { past, future } = store.getState();
		const entry = future[future.length - 1];
		if (!entry) return undefined;
		coalescibleId = null;
		store.setState({
			past: [...past, { ...entry, snapshot: current }],
			future: future.slice(0, -1),
		});
		return entry;
	};

	const clear = () => {
		coalescibleId = null;
		store.setState({ past: [], future: [] });
	};

	return { store, push, undo, redo, clear };
}
