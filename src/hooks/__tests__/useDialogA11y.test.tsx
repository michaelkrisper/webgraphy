import { fireEvent, render, screen } from "@testing-library/react";
import { type ReactNode, useRef, useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useDialogA11y } from "../useDialogA11y";

function Dialog({
	onClose,
	children,
}: {
	onClose: () => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	const titleId = useDialogA11y(ref, onClose);
	return (
		<div ref={ref} role="dialog" aria-labelledby={titleId}>
			<h2 id={titleId}>Title</h2>
			{children}
		</div>
	);
}

/** Renders an opener button and toggles the dialog open/closed. */
function Harness({
	children,
	onClose = () => {},
}: {
	children: ReactNode;
	onClose?: () => void;
}) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<button type="button" onClick={() => setOpen(true)}>
				open
			</button>
			{open && (
				<Dialog
					onClose={() => {
						onClose();
						setOpen(false);
					}}
				>
					{children}
				</Dialog>
			)}
		</>
	);
}

function openWith(children: ReactNode, onClose?: () => void) {
	render(<Harness onClose={onClose}>{children}</Harness>);
	const opener = screen.getByRole("button", { name: "open" });
	opener.focus();
	fireEvent.click(opener);
	return opener;
}

const tab = (shiftKey = false) =>
	fireEvent.keyDown(document, { key: "Tab", shiftKey });

describe("useDialogA11y", () => {
	it("labels the dialog by its title", () => {
		openWith(<button type="button">ok</button>);
		expect(screen.getByRole("dialog", { name: "Title" })).not.toBeNull();
	});

	it("focuses the first control that is not the close button", () => {
		openWith(
			<>
				<button type="button" data-dialog-close>
					close
				</button>
				<input aria-label="name" />
			</>,
		);
		expect(document.activeElement).toBe(screen.getByLabelText("name"));
	});

	it("prefers a data-autofocus control", () => {
		openWith(
			<>
				<input aria-label="first" />
				<input aria-label="wanted" data-autofocus />
			</>,
		);
		expect(document.activeElement).toBe(screen.getByLabelText("wanted"));
	});

	it("skips disabled and hidden controls when choosing the initial focus", () => {
		openWith(
			<>
				<button type="button" disabled>
					disabled
				</button>
				<div hidden>
					<button type="button">hidden</button>
				</div>
				<button type="button" style={{ display: "none" }}>
					none
				</button>
				<button type="button" style={{ visibility: "hidden" }}>
					invisible
				</button>
				<button type="button">visible</button>
			</>,
		);
		expect(document.activeElement).toBe(screen.getByText("visible"));
	});

	it("focuses the dialog itself when only the close button is focusable", () => {
		openWith(
			<button type="button" data-dialog-close>
				close
			</button>,
		);
		const dialog = screen.getByRole("dialog");
		expect(document.activeElement).toBe(dialog);
		expect(dialog.tabIndex).toBe(-1);
	});

	it("wraps Tab from the last control to the first and Shift+Tab back", () => {
		openWith(
			<>
				<button type="button">one</button>
				<button type="button">two</button>
			</>,
		);
		const one = screen.getByText("one");
		const two = screen.getByText("two");
		expect(document.activeElement).toBe(one);

		tab(true);
		expect(document.activeElement).toBe(two);
		tab();
		expect(document.activeElement).toBe(one);
	});

	it("leaves Tab alone between inner controls", () => {
		openWith(
			<>
				<button type="button">one</button>
				<button type="button">two</button>
				<button type="button">three</button>
			</>,
		);
		const ev = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		document.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(false);
	});

	it("pulls focus back in on Shift+Tab when it escaped the dialog", () => {
		const opener = openWith(
			<>
				<button type="button">one</button>
				<button type="button">two</button>
			</>,
		);
		opener.focus();
		tab(true);
		expect(document.activeElement).toBe(screen.getByText("two"));
	});

	it("swallows Tab when nothing inside is focusable", () => {
		openWith(<p>text only</p>);
		const ev = new KeyboardEvent("keydown", {
			key: "Tab",
			bubbles: true,
			cancelable: true,
		});
		document.dispatchEvent(ev);
		expect(ev.defaultPrevented).toBe(true);
		expect(document.activeElement).toBe(screen.getByRole("dialog"));
	});

	it("closes on Escape and returns focus to the opener", () => {
		const onClose = vi.fn();
		const opener = openWith(<button type="button">ok</button>, onClose);
		expect(document.activeElement).not.toBe(opener);

		fireEvent.keyDown(document, { key: "Escape" });

		expect(onClose).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.activeElement).toBe(opener);
	});

	it("ignores other keys", () => {
		const onClose = vi.fn();
		openWith(<button type="button">ok</button>, onClose);
		fireEvent.keyDown(document, { key: "Enter" });
		expect(onClose).not.toHaveBeenCalled();
		expect(document.activeElement).toBe(screen.getByText("ok"));
	});

	it("stops listening after unmount", () => {
		const onClose = vi.fn();
		openWith(<button type="button">ok</button>, onClose);
		fireEvent.keyDown(document, { key: "Escape" });
		fireEvent.keyDown(document, { key: "Escape" });
		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
