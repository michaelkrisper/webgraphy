import "@testing-library/jest-dom";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { axe } from "vitest-axe";
import { Modal } from "../Modal";
import { AXE_TIMEOUT_MS } from "../../../__tests__/axeTimeout";

/**
 * Every dialog in the app goes through this component, so its keyboard
 * behaviour is the keyboard behaviour of the whole modal layer: focus has to
 * enter it, stay inside it, and go back where it came from.
 */

function renderModal(props: Partial<Parameters<typeof Modal>[0]> = {}) {
	const onClose = vi.fn();
	const utils = render(
		<Modal onClose={onClose} title="Settings" {...props}>
			<button type="button">First</button>
			<button type="button">Second</button>
		</Modal>,
	);
	return { onClose, ...utils };
}

describe("Modal accessibility", () => {
	it(
		"has no axe violations",
		async () => {
			const { container } = renderModal();
			expect(await axe(container)).toHaveNoViolations();
		},
		AXE_TIMEOUT_MS,
	);

	it("exposes itself as a modal dialog named by its heading", () => {
		renderModal();

		const dialog = screen.getByRole("dialog");
		expect(dialog).toHaveAttribute("aria-modal", "true");
		// Named via aria-labelledby pointing at the visible <h2>, so the
		// accessible name cannot drift from what is on screen.
		expect(dialog).toHaveAccessibleName("Settings");
	});

	it("falls back to an explicit label when the title is not plain text", () => {
		renderModal({
			title: <span>Rich title</span>,
			ariaLabel: "Import settings",
		});

		expect(screen.getByRole("dialog")).toHaveAccessibleName("Import settings");
	});

	it("moves focus to the first control that is not Close", async () => {
		renderModal();

		// Close precedes the body in DOM order, but landing on it would make a
		// stray Enter dismiss the dialog that was just opened.
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "First" })).toHaveFocus(),
		);
	});

	it("prefers a control marked data-autofocus", async () => {
		render(
			<Modal onClose={vi.fn()} title="Settings">
				<button type="button">First</button>
				<button type="button" data-autofocus>
					Primary
				</button>
			</Modal>,
		);

		await waitFor(() =>
			expect(screen.getByRole("button", { name: "Primary" })).toHaveFocus(),
		);
	});

	it("closes on Escape", async () => {
		const user = userEvent.setup();
		const { onClose } = renderModal();

		await user.keyboard("{Escape}");

		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("keeps Tab inside the dialog", async () => {
		const user = userEvent.setup();
		renderModal();

		const first = screen.getByRole("button", { name: "First" });
		const second = screen.getByRole("button", { name: "Second" });
		const close = screen.getByRole("button", { name: "Close dialog" });

		await waitFor(() => expect(first).toHaveFocus());
		await user.tab();
		expect(second).toHaveFocus();
		// Past the last control, focus wraps to the first rather than escaping
		// to the page behind the backdrop.
		await user.tab();
		expect(close).toHaveFocus();
		await user.tab();
		expect(first).toHaveFocus();
	});

	it("wraps backwards with Shift+Tab", async () => {
		const user = userEvent.setup();
		renderModal();

		const first = screen.getByRole("button", { name: "First" });
		const second = screen.getByRole("button", { name: "Second" });
		const close = screen.getByRole("button", { name: "Close dialog" });

		await waitFor(() => expect(first).toHaveFocus());
		await user.tab({ shift: true });
		expect(close).toHaveFocus();
		await user.tab({ shift: true });
		expect(second).toHaveFocus();
	});

	it("returns focus to the opener when it closes", async () => {
		const opener = document.createElement("button");
		opener.textContent = "Open";
		document.body.appendChild(opener);
		opener.focus();
		expect(opener).toHaveFocus();

		const { unmount } = renderModal();
		await waitFor(() =>
			expect(screen.getByRole("button", { name: "First" })).toHaveFocus(),
		);

		unmount();

		// Without this a keyboard user is dropped back at the top of the
		// document and has to tab all the way down again.
		expect(opener).toHaveFocus();
		opener.remove();
	});

	it("focuses the dialog itself when Close is its only control", async () => {
		render(
			<Modal onClose={vi.fn()} title="Empty">
				<p>Nothing to focus here.</p>
			</Modal>,
		);

		await waitFor(() => expect(screen.getByRole("dialog")).toHaveFocus());
	});
});
