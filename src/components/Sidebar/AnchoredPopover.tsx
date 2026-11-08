import type React from "react";
import { type ReactNode, useRef } from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "../../hooks/useDialogA11y";

/**
 * The popover is a portal at the end of `document.body`, so tabbing out of the
 * trigger walked past it into the rest of the sidebar: the options existed but
 * could not be reached, and nothing dismissed them but a click. Mounting it
 * through the dialog focus helper moves focus onto the first option, keeps Tab
 * inside the list, closes on Escape and hands focus back to the trigger.
 */
export function AnchoredPopover({
	id,
	label,
	style,
	className = "popup-picker-popover",
	onClose,
	children,
}: {
	id: string;
	label: string;
	style: React.CSSProperties;
	className?: string;
	onClose: () => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useDialogA11y(ref, onClose);

	return createPortal(
		<div
			ref={ref}
			id={id}
			role="dialog"
			aria-label={label}
			className={className}
			style={style}
		>
			{children}
		</div>,
		document.body,
	);
}
