import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "../ConfirmDialog";

function setup() {
	const onConfirm = vi.fn();
	const onCancel = vi.fn();
	render(
		<ConfirmDialog
			title="Load demo data?"
			message="It is added alongside."
			confirmLabel="Add alongside"
			onConfirm={onConfirm}
			onCancel={onCancel}
		/>,
	);
	return { onConfirm, onCancel };
}

describe("ConfirmDialog", () => {
	it("is a labelled, described alertdialog", () => {
		setup();
		const dialog = screen.getByRole("alertdialog", { name: "Load demo data?" });
		expect(dialog).toHaveAttribute("aria-modal", "true");
		expect(dialog).toHaveAccessibleDescription("It is added alongside.");
	});

	it("focuses Cancel first, so a stray Enter does nothing", () => {
		setup();
		expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
	});

	it("confirms and cancels", () => {
		const { onConfirm, onCancel } = setup();
		fireEvent.click(screen.getByRole("button", { name: "Add alongside" }));
		expect(onConfirm).toHaveBeenCalledTimes(1);
		fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
		expect(onCancel).toHaveBeenCalledTimes(1);
	});

	it("cancels on Escape", () => {
		const { onCancel } = setup();
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onCancel).toHaveBeenCalledTimes(1);
	});
});
