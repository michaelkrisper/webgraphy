import { act, fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { afterEach, describe, expect, it } from "vitest";
import { SHORTCUTS } from "../../../utils/shortcuts";
import { KeyboardShortcutsModal } from "../KeyboardShortcutsModal";
import { ShortcutsHelpHost } from "../ShortcutsHelpHost";
import { useShortcutsHelp } from "../shortcutsHelp";

afterEach(() => {
	act(() => useShortcutsHelp.getState().setOpen(false));
});

describe("ShortcutsHelpHost", () => {
	it("opens the shortcuts dialog on ?", async () => {
		render(<ShortcutsHelpHost />);
		expect(screen.queryByRole("dialog")).toBeNull();
		fireEvent.keyDown(window, { key: "?" });
		expect(
			await screen.findByRole("dialog", { name: "Keyboard shortcuts" }),
		).toBeInTheDocument();
	});

	it("ignores ? typed into a form control", () => {
		render(
			<>
				<ShortcutsHelpHost />
				<input aria-label="Name" />
			</>,
		);
		fireEvent.keyDown(screen.getByRole("textbox", { name: "Name" }), {
			key: "?",
		});
		expect(useShortcutsHelp.getState().open).toBe(false);
	});

	it("ignores ? while another modal dialog is open", () => {
		render(
			<>
				<ShortcutsHelpHost />
				<div role="dialog" aria-modal="true" aria-label="Other" />
			</>,
		);
		fireEvent.keyDown(window, { key: "?" });
		expect(useShortcutsHelp.getState().open).toBe(false);
	});

	it.each([
		["an axis range popover", { role: "dialog", "aria-label": "Y axis 1 range" }],
		["a picker popover", { class: "popup-picker-popover" }],
	])("ignores ? while %s is open", (_label, attrs) => {
		render(<ShortcutsHelpHost />);
		const overlay = document.createElement("div");
		for (const [k, v] of Object.entries(attrs)) overlay.setAttribute(k, v);
		document.body.appendChild(overlay);
		try {
			const e = new KeyboardEvent("keydown", { key: "?", cancelable: true });
			window.dispatchEvent(e);
			expect(e.defaultPrevented).toBe(false);
			expect(useShortcutsHelp.getState().open).toBe(false);
		} finally {
			overlay.remove();
		}
	});

	it("opens on request from elsewhere and closes on Escape", async () => {
		render(<ShortcutsHelpHost />);
		act(() => useShortcutsHelp.getState().setOpen(true));
		await screen.findByRole("dialog", { name: "Keyboard shortcuts" });
		fireEvent.keyDown(document, { key: "Escape" });
		expect(useShortcutsHelp.getState().open).toBe(false);
	});
});

describe("KeyboardShortcutsModal", () => {
	it("lists every binding from the shared shortcut table", () => {
		render(<KeyboardShortcutsModal onClose={() => {}} />);
		for (const s of Object.values(SHORTCUTS)) {
			expect(
				screen.getByText(s.description, { exact: false }),
			).toBeInTheDocument();
		}
	});

	it("shows modifier and key glyphs", () => {
		render(<KeyboardShortcutsModal onClose={() => {}} />);
		const copy = screen
			.getByText(SHORTCUTS.copyTooltip.description, { exact: false })
			.closest("li");
		expect(copy).toHaveTextContent("Ctrl + C:");
		const pan = screen
			.getByText(SHORTCUTS.panX.description, { exact: false })
			.closest("li");
		expect(pan).toHaveTextContent("← / →:");
		const stacked = screen
			.getByText(SHORTCUTS.stackedFit.description, { exact: false })
			.closest("li");
		expect(stacked).toHaveTextContent("Shift + Home:");
	});
});
