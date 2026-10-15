import { lazy, Suspense, useCallback, useEffect } from "react";
import { hasKey, isEditableTarget, SHORTCUTS } from "../../utils/shortcuts";
import { useShortcutsHelp } from "./shortcutsHelp";

// Rarely opened; kept out of the entry chunk (see size-budget.json).
const KeyboardShortcutsModal = lazy(() =>
	import("./KeyboardShortcutsModal").then((m) => ({
		default: m.KeyboardShortcutsModal,
	})),
);

export function ShortcutsHelpHost() {
	const open = useShortcutsHelp((s) => s.open);
	const close = useCallback(
		() => useShortcutsHelp.getState().setOpen(false),
		[],
	);

	useEffect(() => {
		const onKeyDown = (e: KeyboardEvent) => {
			if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey) return;
			if (!hasKey(SHORTCUTS.showShortcuts, e.key)) return;
			if (isEditableTarget(e.target)) return;
			// Another dialog already owns focus; stacking a second trap on it
			// would leave two handlers fighting over Tab.
			if (document.querySelector('[aria-modal="true"]')) return;
			e.preventDefault();
			useShortcutsHelp.getState().setOpen(true);
		};
		window.addEventListener("keydown", onKeyDown);
		return () => window.removeEventListener("keydown", onKeyDown);
	}, []);

	return (
		<Suspense fallback={null}>
			{open && <KeyboardShortcutsModal onClose={close} />}
		</Suspense>
	);
}
