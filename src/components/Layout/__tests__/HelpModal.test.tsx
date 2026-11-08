import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import {
	formatShortcutKeys,
	SHORTCUTS,
	type Shortcut,
} from "../../../utils/shortcuts";
import { HelpModal } from "../HelpModal";

/** The text the shared `Keys` rendering gives a binding, e.g. "Ctrl + Z". */
const keysText = (s: Shortcut) =>
	`${s.ctrl ? "Ctrl + " : ""}${s.shift ? "Shift + " : ""}${s.alt ? "Alt + " : ""}${formatShortcutKeys(s).join(" / ")}`;

describe("HelpModal", () => {
	it("renders the help content correctly", () => {
		const onClose = vi.fn();
		render(<HelpModal onClose={onClose} />);

		// Check modal title
		expect(screen.getByText("Help & Interactions")).toBeInTheDocument();

		for (const section of ["Chart", "Axes", "Data", "Series", "View & export"]) {
			expect(screen.getByText(section)).toBeInTheDocument();
		}
		// The keyboard part is rendered from the shared shortcut table.
		expect(screen.getByText("Keyboard: Chart")).toBeInTheDocument();
		expect(screen.getByText(/Pan all X axes/)).toBeInTheDocument();
		expect(screen.getByText(/Show keyboard shortcuts/)).toBeInTheDocument();
	});

	it("describes the current UI, not removed or misnamed features", () => {
		render(<HelpModal onClose={vi.fn()} />);
		const text = document.body.textContent ?? "";

		expect(text).toContain("Fit All");
		expect(text).toContain("Stacked Fit");
		expect(text).toContain("IndexedDB");
		expect(text).toContain("CSV");
		expect(text).toContain(".webgraphy");
		expect(text).toMatch(/Double-click its title/);
		expect(text).not.toMatch(/LocalStorage/);
		expect(text).not.toMatch(/numeric\/time/);
		expect(text).not.toMatch(/cycle/i);
		expect(text).not.toMatch(/Click on title/);
	});

	it("names keys from the shared shortcut table, not by hand", () => {
		render(<HelpModal onClose={vi.fn()} />);
		const item = (label: string) => screen.getByText(label).closest("li");

		expect(item("Zoom history:")).toHaveTextContent(
			`${keysText(SHORTCUTS.viewBack)} / ${keysText(SHORTCUTS.viewForward)} steps back`,
		);
		expect(item("Click:")).toHaveTextContent(
			`${keysText(SHORTCUTS.clearPins)} clears them. ${keysText(SHORTCUTS.toggleStats)} shows statistics`,
		);
		expect(item("Exact range:")).toHaveTextContent(
			`press ${keysText(SHORTCUTS.axisRange)} on the focused axis`,
		);
		expect(item("Rename an X axis:")).toHaveTextContent(
			`press ${keysText(SHORTCUTS.axisRename)} on the focused axis`,
		);
		expect(item("Import:")).toHaveTextContent(
			`(${keysText(SHORTCUTS.pasteData)}).`,
		);
		expect(item("Undo:")).toHaveTextContent(
			`(${keysText(SHORTCUTS.undo)}, or Undo in the toast)`,
		);
	});

	it("calls onClose when the close button is clicked", () => {
		const onClose = vi.fn();
		render(<HelpModal onClose={onClose} />);

		const closeButton = screen.getByLabelText("Close Help");
		fireEvent.click(closeButton);

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
