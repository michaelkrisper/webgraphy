import type React from "react";
import { type ReactNode, useEffect } from "react";
import { useAnchoredPopover } from "../../hooks/useAnchoredPopover";
import { AnchoredPopover } from "./AnchoredPopover";

export interface PopupPickerOption<T> {
	value: T;
	icon: ReactNode;
	label: string;
	disabled?: boolean;
	/** Tooltip, e.g. why the option is disabled. */
	title?: string;
	/** What choosing it does, for assistive technology; defaults to `title`. */
	description?: string;
	/** Rendered after the label. */
	trailing?: ReactNode;
}

export interface PopupTriggerProps {
	"aria-haspopup": "dialog";
	"aria-expanded": boolean;
}

interface PopupPickerProps<T> {
	/** Accessible name of the popover, e.g. "Line style". */
	label: string;
	options: PopupPickerOption<T>[];
	current: T;
	onChange: (value: T) => void;
	renderTrigger: (props: {
		onClick: (e: React.MouseEvent) => void;
		ref: React.RefObject<HTMLButtonElement | null>;
		isOpen: boolean;
		/** Spread onto the trigger: announces the popover and whether it is open. */
		popupProps: PopupTriggerProps;
	}) => ReactNode;
	popoverId?: string;
	minWidth?: number;
	/** Fired when an option is hovered (value) and when the hover leaves (null). */
	onHoverOption?: (value: T | null) => void;
}

export function PopupPicker<T extends string | number>({
	label,
	options,
	current,
	onChange,
	renderTrigger,
	popoverId = "popup-picker-popover",
	minWidth = 140,
	onHoverOption,
}: PopupPickerProps<T>) {
	const { isOpen, setIsOpen, close, toggleOpen, triggerRef, coords } =
		useAnchoredPopover(popoverId, minWidth);

	// Menus of plain actions (export, "more") have no current value; their
	// items must not read as toggle buttons.
	const selectable = options.some((o) => o.value === current);

	const handleSelect = (value: T) => {
		onChange(value);
		onHoverOption?.(null);
		setIsOpen(false);
	};

	// Clear any active hover preview when the popover closes for any reason.
	useEffect(() => {
		if (!isOpen) onHoverOption?.(null);
	}, [isOpen, onHoverOption]);

	return (
		<>
			{renderTrigger({
				onClick: toggleOpen,
				ref: triggerRef,
				isOpen,
				popupProps: { "aria-haspopup": "dialog", "aria-expanded": isOpen },
			})}
			{isOpen && (
				<AnchoredPopover
					id={popoverId}
					label={label}
					style={{ ...coords, minWidth }}
					onClose={close}
				>
					{options.map((opt) => {
						const isActive = opt.value === current;
						return (
							<button
								key={String(opt.value)}
								type="button"
								className={`popup-picker-item${isActive ? " popup-picker-item--active" : ""}`}
								onClick={() => handleSelect(opt.value)}
								onMouseEnter={() => onHoverOption?.(opt.value)}
								onMouseLeave={() => onHoverOption?.(null)}
								disabled={opt.disabled}
								title={opt.title}
								aria-pressed={selectable ? isActive : undefined}
								aria-description={opt.description ?? opt.title}
							>
								<span className="popup-picker-icon">{opt.icon}</span>
								<span className="popup-picker-label">{opt.label}</span>
								{opt.trailing}
							</button>
						);
					})}
				</AnchoredPopover>
			)}
		</>
	);
}
