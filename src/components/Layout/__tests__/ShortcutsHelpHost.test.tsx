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
	});
});
