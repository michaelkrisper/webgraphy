import { describe, expect, it } from "vitest";
import {
	anyKeyPressed,
	formatShortcutKeys,
	hasKey,
	isEditableTarget,
	SHORTCUT_GROUPS,
	SHORTCUTS,
	type ShortcutId,
	shortcutHint,
} from "../shortcuts";

describe("SHORTCUTS", () => {
	it("lists every binding in exactly one help group", () => {
		const listed = SHORTCUT_GROUPS.flatMap((g) => g.ids);
		expect([...listed].sort()).toEqual(
			(Object.keys(SHORTCUTS) as ShortcutId[]).sort(),
		);
	});

	it("gives every binding at least one key and a description", () => {
		for (const s of Object.values(SHORTCUTS)) {
			expect(s.keys.length).toBeGreaterThan(0);
			expect(s.description).not.toBe("");
		}
	});
});

describe("hasKey / anyKeyPressed", () => {
	it("matches exact KeyboardEvent.key values", () => {
		expect(hasKey(SHORTCUTS.zoomIn, "=")).toBe(true);
		expect(hasKey(SHORTCUTS.zoomIn, "-")).toBe(false);
		expect(hasKey(SHORTCUTS.showShortcuts, "?")).toBe(true);
	});

	it("reports whether any of a shortcut's keys is held", () => {
		expect(anyKeyPressed(SHORTCUTS.panX, new Set(["ArrowRight"]))).toBe(true);
		expect(anyKeyPressed(SHORTCUTS.panX, new Set(["ArrowUp"]))).toBe(false);
	});
});

describe("formatShortcutKeys", () => {
	it("shows arrows as glyphs and merges letter case variants", () => {
		expect(formatShortcutKeys(SHORTCUTS.panX)).toEqual(["←", "→"]);
		expect(formatShortcutKeys(SHORTCUTS.copyTooltip)).toEqual(["C"]);
		expect(formatShortcutKeys(SHORTCUTS.closeDialog)).toEqual(["Esc"]);
		expect(formatShortcutKeys(SHORTCUTS.axisRename)).toEqual(["Enter"]);
	});
});

describe("shortcutHint", () => {
	it("prefixes modifiers to the first key", () => {
		expect(shortcutHint(SHORTCUTS.fitAll)).toBe("Home");
		expect(shortcutHint(SHORTCUTS.stackedFit)).toBe("Shift+Home");
		expect(shortcutHint(SHORTCUTS.undo)).toBe("Ctrl+Z");
		expect(shortcutHint(SHORTCUTS.viewBack)).toBe("Alt+←");
	});
});

describe("isEditableTarget", () => {
	it("is true for form controls and false otherwise", () => {
		expect(isEditableTarget(document.createElement("input"))).toBe(true);
		expect(isEditableTarget(document.createElement("textarea"))).toBe(true);
		expect(isEditableTarget(document.createElement("select"))).toBe(true);
		expect(isEditableTarget(document.createElement("div"))).toBe(false);
		expect(isEditableTarget(null)).toBe(false);
	});
});
