// Single source of truth for the keyboard bindings. The handlers match keys
// against these entries and the shortcuts dialog renders them, so the list
// a user reads cannot drift from what the code actually does.

export interface Shortcut {
	/** `KeyboardEvent.key` values that trigger the action. */
	readonly keys: readonly string[];
	/** Only together with Ctrl. */
	readonly ctrl?: boolean;
	/** Only together with Shift. */
	readonly shift?: boolean;
	readonly description: string;
}

export const SHORTCUTS = {
	panX: {
		keys: ["ArrowLeft", "ArrowRight"],
		description: "Pan all X axes",
	},
	panY: {
		keys: ["ArrowUp", "ArrowDown"],
		description: "Pan all Y axes",
	},
	zoomIn: {
		keys: ["+", "="],
		description: "Zoom in (X and Y)",
	},
	zoomOut: {
		keys: ["-", "_"],
		description: "Zoom out (X and Y)",
	},
	zoomXOnly: {
		keys: ["+", "-"],
		ctrl: true,
		description: "Zoom the X axes only",
	},
	fitAll: {
		keys: ["Home"],
		description: "Fit all axes to the data",
	},
	stackedFit: {
		keys: ["Home"],
		shift: true,
		description: "Stacked fit: each Y axis in its own slice",
	},
	copyTooltip: {
		keys: ["c", "C"],
		ctrl: true,
		description: "Copy the crosshair tooltip data",
	},
	undo: {
		keys: ["z", "Z"],
		ctrl: true,
		description: "Undo",
	},
	redo: {
		keys: ["y", "Y"],
		ctrl: true,
		description: "Redo (also Ctrl+Shift+Z)",
	},
	showShortcuts: {
		keys: ["?"],
		description: "Show keyboard shortcuts",
	},
	axisPanX: {
		keys: ["ArrowLeft", "ArrowRight"],
		description: "Pan the focused X axis",
	},
	axisPanY: {
		keys: ["ArrowUp", "ArrowDown"],
		description: "Pan the focused Y axis",
	},
	axisZoomIn: {
		keys: ["+", "="],
		description: "Zoom in on the focused axis",
	},
	axisZoomOut: {
		keys: ["-", "_"],
		description: "Zoom out of the focused axis",
	},
	axisAutoScale: {
		keys: ["a", "A"],
		description: "Auto-scale the focused axis",
	},
	axisRename: {
		keys: ["Enter"],
		description: "Rename the focused X axis",
	},
	closeDialog: {
		keys: ["Escape"],
		description: "Close the dialog",
	},
} as const satisfies Record<string, Shortcut>;

export type ShortcutId = keyof typeof SHORTCUTS;

export const SHORTCUT_GROUPS: readonly {
	title: string;
	ids: readonly ShortcutId[];
}[] = [
	{
		title: "Chart",
		ids: [
			"panX",
			"panY",
			"zoomIn",
			"zoomOut",
			"zoomXOnly",
			"fitAll",
			"stackedFit",
			"copyTooltip",
			"showShortcuts",
		],
	},
	{
		title: "Focused axis (Tab to an axis)",
		ids: [
			"axisPanX",
			"axisPanY",
			"axisZoomIn",
			"axisZoomOut",
			"axisAutoScale",
			"axisRename",
		],
	},
	{ title: "Edit", ids: ["undo", "redo"] },
	{ title: "Dialogs", ids: ["closeDialog"] },
];

export function hasKey(shortcut: Shortcut, key: string): boolean {
	return shortcut.keys.includes(key);
}

/** Allocation-free: also runs on the per-frame keyboard pan/zoom path. */
export function anyKeyPressed(
	shortcut: Shortcut,
	pressed: Set<string>,
): boolean {
	const keys = shortcut.keys;
	for (let i = 0; i < keys.length; i++) {
		if (pressed.has(keys[i])) return true;
	}
	return false;
}

const KEY_LABELS: Record<string, string> = {
	ArrowLeft: "←",
	ArrowRight: "→",
	ArrowUp: "↑",
	ArrowDown: "↓",
	Escape: "Esc",
};

/** Display form: arrows as glyphs, letters upper-cased, case variants merged. */
export function formatShortcutKeys(shortcut: Shortcut): string[] {
	const out: string[] = [];
	for (const k of shortcut.keys) {
		const label = KEY_LABELS[k] ?? (k.length === 1 ? k.toUpperCase() : k);
		if (!out.includes(label)) out.push(label);
	}
	return out;
}

/** Tooltip form of the first binding, e.g. "Shift+Home". */
export function shortcutHint(shortcut: Shortcut): string {
	const mods = `${shortcut.ctrl ? "Ctrl+" : ""}${shortcut.shift ? "Shift+" : ""}`;
	return mods + formatShortcutKeys(shortcut)[0];
}

/**
 * Keys typed into a form control belong to that control. Shared by every
 * window-level shortcut listener.
 */
export function isEditableTarget(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLInputElement ||
		target instanceof HTMLSelectElement ||
		target instanceof HTMLTextAreaElement
	);
}
