import { AXIS_EPSILON } from "../../utils/axisCalculations";

export type AxisRangeUpdate = Record<string, { min: number; max: number }>;

interface AxisRange {
	id: string;
	min: number;
	max: number;
}

interface StoreLike {
	xAxes: readonly AxisRange[];
	yAxes: readonly AxisRange[];
	batchUpdateAxes(xUpdates: AxisRangeUpdate, yUpdates: AxisRangeUpdate): void;
}

/**
 * Reconcile axis-range updates produced during interactive panning/zooming
 * with the persisted store state. Filters out updates that match the current
 * store values within AXIS_EPSILON and only triggers a batched commit if any
 * axis actually moved. Extracted from ChartContainer so the filtering can be
 * unit-tested without spinning up the store.
 */
export function syncStoreUpdates(
	state: StoreLike,
	xUpdates: AxisRangeUpdate,
	yUpdates: AxisRangeUpdate,
): void {
	const filteredXUpdates: AxisRangeUpdate = {};
	const filteredYUpdates: AxisRangeUpdate = {};
	let hasX = false;
	let hasY = false;

	const xAxisMap = new Map(state.xAxes.map((a) => [a.id, a]));
	for (const [id, upd] of Object.entries(xUpdates)) {
		const axis = xAxisMap.get(id);
		if (
			!axis ||
			Math.abs(axis.min - upd.min) > AXIS_EPSILON ||
			Math.abs(axis.max - upd.max) > AXIS_EPSILON
		) {
			filteredXUpdates[id] = upd;
			hasX = true;
		}
	}

	const yAxisMap = new Map(state.yAxes.map((a) => [a.id, a]));
	for (const [id, upd] of Object.entries(yUpdates)) {
		const axis = yAxisMap.get(id);
		if (
			!axis ||
			Math.abs(axis.min - upd.min) > AXIS_EPSILON ||
			Math.abs(axis.max - upd.max) > AXIS_EPSILON
		) {
			filteredYUpdates[id] = upd;
			hasY = true;
		}
	}

	if (hasX || hasY) {
		state.batchUpdateAxes(filteredXUpdates, filteredYUpdates);
	}
}
