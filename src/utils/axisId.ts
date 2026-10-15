/** Identifier of the implicit default x-axis (used when a dataset has no explicit xAxisId). */
export const DEFAULT_X_AXIS_ID = "axis-1";

/**
 * Resolve an axis by id. Axes are a fixed set of 9 slots with ids
 * `axis-1`..`axis-9` kept in canonical order, so the id maps directly to its
 * array index (`axis-N` -> slot N-1) without a lookup map. Falls back to a
 * scan for non-canonical ids or out-of-order arrays, matching `.find`
 * semantics (the matching axis, or undefined).
 */
export function getAxisById<T extends { id: string }>(
	axes: T[],
	id: string,
): T | undefined {
	const direct = axes[Number(id.slice(5)) - 1];
	if (direct?.id === id) return direct;
	return axes.find((a) => a.id === id);
}
