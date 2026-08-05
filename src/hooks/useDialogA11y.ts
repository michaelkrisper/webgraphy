import { useEffect, useId, type RefObject } from "react";

const FOCUSABLE = [
	"a[href]",
	"button:not([disabled])",
	"input:not([disabled])",
	"select:not([disabled])",
	"textarea:not([disabled])",
	'[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Deliberately does not use `offsetParent`: it is the usual way to test
 * visibility, but jsdom performs no layout and reports null for every element,
 * which would make the trap find nothing under test.
 */
function isVisible(el: HTMLElement): boolean {
	if (el.hidden || el.closest("[hidden]")) return false;
	const style = getComputedStyle(el);
	return style.display !== "none" && style.visibility !== "hidden";
}

function focusableWithin(root: HTMLElement): HTMLElement[] {
	return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
		isVisible,
	);
}

/**
 * Makes a modal dialog operable without a mouse:
 *
 * - moves focus into the dialog when it opens, so the next Tab starts inside;
 * - keeps Tab and Shift+Tab cycling within it, so focus cannot wander into the
 *   inert page behind the backdrop;
 * - closes on Escape;
 * - returns focus to whatever was focused before, so the keyboard user is not
 *   dropped back at the top of the document.
 *
 * Returns the id to wire up as `aria-labelledby` on the dialog element.
 */
export function useDialogA11y(
	dialogRef: RefObject<HTMLElement | null>,
	onClose: () => void,
): string {
	const titleId = useId();

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		const previouslyFocused = document.activeElement as HTMLElement | null;

		const initial = focusableWithin(dialog)[0];
		if (initial) {
			initial.focus();
		} else {
			// Nothing focusable inside: make the dialog itself the focus target
			// so screen readers still land in the right place.
			dialog.tabIndex = -1;
			dialog.focus();
		}

		const onKeyDown = (e: KeyboardEvent) => {
			if (e.key === "Escape") {
				e.stopPropagation();
				onClose();
				return;
			}
			if (e.key !== "Tab") return;

			const items = focusableWithin(dialog);
			if (items.length === 0) {
				e.preventDefault();
				return;
			}
			const first = items[0];
			const last = items[items.length - 1];
			const active = document.activeElement;

			if (e.shiftKey && (active === first || !dialog.contains(active))) {
				e.preventDefault();
				last.focus();
			} else if (!e.shiftKey && active === last) {
				e.preventDefault();
				first.focus();
			}
		};

		document.addEventListener("keydown", onKeyDown);
		return () => {
			document.removeEventListener("keydown", onKeyDown);
			previouslyFocused?.focus?.();
		};
	}, [dialogRef, onClose]);

	return titleId;
}
