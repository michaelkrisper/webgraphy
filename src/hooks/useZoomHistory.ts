// Zoom history (Alt+Left / Alt+Right, SHORTCUTS.viewBack/viewForward) and
// typed axis ranges. Both run only when the viewport settles or on a key
// press, never on the per-frame path: ChartContainer reports each settled
// store write-back through `settled`.

import {
	type MutableRefObject,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { useGraphStore } from "../store/useGraphStore";
import { hasKey, isEditableTarget, SHORTCUTS } from "../utils/shortcuts";
import {
	createZoomHistory,
	type RangeTargets,
	reachedRanges,
	restoreTargets,
	seedRanges,
	snapshotFromTargets,
	type ViewportSnapshot,
} from "../utils/zoomHistory";

export function viewNavActionFor(
	e: Pick<
		KeyboardEvent,
		| "key"
		| "ctrlKey"
		| "metaKey"
		| "shiftKey"
		| "altKey"
		| "target"
		| "defaultPrevented"
	>,
): "back" | "forward" | null {
	if (e.defaultPrevented || !e.altKey || e.ctrlKey || e.metaKey || e.shiftKey)
		return null;
	if (isEditableTarget(e.target)) return null;
	if (hasKey(SHORTCUTS.viewBack, e.key)) return "back";
	if (hasKey(SHORTCUTS.viewForward, e.key)) return "forward";
	return null;
}

interface StoreLike extends ViewportSnapshot {
	batchUpdateAxes(x: RangeTargets, y: RangeTargets): void;
}

/**
 * Sets one axis to an exact range: in the store, which persists it, and in
 * the target refs, so the rAF loop does not ease it back to the old target.
 */
export function applyAxisRange(
	store: StoreLike,
	targetX: RangeTargets,
	targetY: RangeTargets,
	kind: "x" | "y",
	id: string,
	range: { min: number; max: number },
): void {
	const r = { min: range.min, max: range.max };
	if (kind === "x") {
		targetX[id] = r;
		store.batchUpdateAxes({ [id]: r }, {});
	} else {
		targetY[id] = r;
		store.batchUpdateAxes({}, { [id]: r });
	}
}

interface Options {
	targetXAxes: MutableRefObject<RangeTargets>;
	targetYs: MutableRefObject<RangeTargets>;
	/** Last-rendered ranges the wheel easing starts from. */
	displayedXAxes: MutableRefObject<RangeTargets>;
	displayedYs: MutableRefObject<RangeTargets>;
	/** Arms the eased (wheel-zoom) transition for the next frames. */
	smoothZoomRef: MutableRefObject<boolean>;
	syncViewport: () => void;
	enabled: boolean;
}

export function useZoomHistory({
	targetXAxes,
	targetYs,
	displayedXAxes,
	displayedYs,
	smoothZoomRef,
	syncViewport,
	enabled,
}: Options) {
	const [history] = useState(createZoomHistory);
	// Ranges a back/forward is heading to: their write-back is the navigation
	// landing, not a new step.
	const navDestRef = useRef<{ x: RangeTargets; y: RangeTargets } | null>(null);
	const syncRef = useRef(syncViewport);
	useEffect(() => {
		syncRef.current = syncViewport;
	}, [syncViewport]);

	/** Called with the store state before and after a settled viewport write. */
	const settled = useCallback(
		(previous: ViewportSnapshot, next: ViewportSnapshot) => {
			const dest = navDestRef.current;
			navDestRef.current = null;
			if (dest && reachedRanges(next, dest)) return;
			history.record(
				{ xAxes: previous.xAxes, yAxes: previous.yAxes },
				performance.now(),
			);
		},
		[history],
	);

	const navigate = useCallback(
		(direction: "back" | "forward") => {
			const state = useGraphStore.getState();
			const current = snapshotFromTargets(
				state.xAxes,
				state.yAxes,
				targetXAxes.current,
				targetYs.current,
			);
			const snapshot =
				direction === "back" ? history.back(current) : history.forward(current);
			if (!snapshot) return;
			// Not mid-ease: what is on screen is the stored range, so the ease
			// starts there rather than at a stale earlier record.
			if (!smoothZoomRef.current) {
				seedRanges(displayedXAxes.current, state.xAxes);
				seedRanges(displayedYs.current, state.yAxes);
			}
			const dest = restoreTargets(
				snapshot,
				state,
				targetXAxes.current,
				targetYs.current,
			);
			if (!dest.changed) return;
			navDestRef.current = dest;
			// Eased like a wheel zoom; syncViewport snaps under reduced motion.
			smoothZoomRef.current = true;
			syncRef.current();
		},
		[history, targetXAxes, targetYs, displayedXAxes, displayedYs, smoothZoomRef],
	);

	const applyRange = useCallback(
		(kind: "x" | "y", id: string, range: { min: number; max: number }) => {
			const state = useGraphStore.getState();
			navDestRef.current = null;
			applyAxisRange(
				state,
				targetXAxes.current,
				targetYs.current,
				kind,
				id,
				range,
			);
			const next = useGraphStore.getState();
			if (next.xAxes !== state.xAxes || next.yAxes !== state.yAxes) {
				history.record(
					{ xAxes: state.xAxes, yAxes: state.yAxes },
					performance.now(),
				);
			}
			syncRef.current();
		},
		[history, targetXAxes, targetYs],
	);

	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const action = viewNavActionFor(e);
			if (!action) return;
			if (document.querySelector('[aria-modal="true"]')) return;
			// Also when there is nothing to go back to: Alt+Left would otherwise
			// navigate the page away from the app.
			e.preventDefault();
			navigate(action);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled, navigate]);

	return { settled, navigate, applyRange };
}
