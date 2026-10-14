// Home = Fit All, Shift+Home = Stacked Fit (SHORTCUTS.fitAll/stackedFit).

import { useEffect, useRef } from "react";
import { hasKey, isEditableTarget, SHORTCUTS } from "../utils/shortcuts";

export function fitActionFor(
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
): "fitAll" | "stackedFit" | null {
	if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return null;
	if (isEditableTarget(e.target)) return null;
	const action = e.shiftKey ? "stackedFit" : "fitAll";
	return hasKey(SHORTCUTS[action], e.key) ? action : null;
}

export function useFitShortcuts(
	onFitAll: () => void,
	onStackedFit: () => void,
	enabled: boolean,
): void {
	const handlers = useRef({ fitAll: onFitAll, stackedFit: onStackedFit });
	useEffect(() => {
		handlers.current = { fitAll: onFitAll, stackedFit: onStackedFit };
	}, [onFitAll, onStackedFit]);

	useEffect(() => {
		if (!enabled) return;
		const onKeyDown = (e: KeyboardEvent) => {
			const action = fitActionFor(e);
			if (!action) return;
			// A dialog owns the keyboard while it is open.
			if (document.querySelector('[aria-modal="true"]')) return;
			e.preventDefault();
			handlers.current[action]();
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, [enabled]);
}
