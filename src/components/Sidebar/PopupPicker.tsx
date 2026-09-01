import type React from "react";
import {
	type ReactNode,
	useCallback,
	useEffect,
	useRef,
	useState,
} from "react";
import { createPortal } from "react-dom";
import { useDialogA11y } from "../../hooks/useDialogA11y";

export interface PopupPickerOption<T> {
	value: T;
	icon: ReactNode;
	label: string;
	disabled?: boolean;
}

interface PopupPickerProps<T> {
	options: PopupPickerOption<T>[];
	current: T;
	onChange: (value: T) => void;
	renderTrigger: (props: {
		onClick: (e: React.MouseEvent) => void;
		ref: React.RefObject<HTMLButtonElement | null>;
		isOpen: boolean;
	}) => ReactNode;
	popoverId?: string;
	minWidth?: number;
	/** Fired when an option is hovered (value) and when the hover leaves (null). */
	onHoverOption?: (value: T | null) => void;
}

export function PopupPicker<T extends string | number>({
	options,
	current,
	onChange,
	renderTrigger,
	popoverId = "popup-picker-popover",
	minWidth = 140,
	onHoverOption,
}: PopupPickerProps<T>) {
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [coords, setCoords] = useState({ top: 0, left: 0 });

	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const popover = document.getElementById(popoverId);
			if (popover?.contains(event.target as Node)) return;
			if (triggerRef.current?.contains(event.target as Node)) return;
			setIsOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen, popoverId]);

	const close = useCallback(() => setIsOpen(false), []);

	const toggleOpen = () => {
		if (!isOpen && triggerRef.current) {
			const rect = triggerRef.current.getBoundingClientRect();
			const padding = 10;
			let left = rect.left + window.scrollX;
			if (left + minWidth > window.innerWidth - padding) {
				left = rect.right + window.scrollX - minWidth;
			}
			setCoords({
				top: rect.bottom + window.scrollY + 4,
				left: Math.max(padding, left),
			});
		}
		setIsOpen(!isOpen);
	};

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
			{renderTrigger({ onClick: toggleOpen, ref: triggerRef, isOpen })}
			{isOpen && (
				<PopupPickerPopover
					id={popoverId}
					style={{ top: coords.top, left: coords.left, minWidth }}
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
							>
								<span className="popup-picker-icon">{opt.icon}</span>
								<span className="popup-picker-label">{opt.label}</span>
							</button>
						);
					})}
				</PopupPickerPopover>
			)}
		</>
	);
}

/**
 * The popover is a portal at the end of `document.body`, so tabbing out of the
 * trigger walked past it into the rest of the sidebar: the options existed but
 * could not be reached, and nothing dismissed them but a click. Mounting it
 * through the dialog focus helper moves focus onto the first option, keeps Tab
 * inside the list, closes on Escape and hands focus back to the trigger.
 */
function PopupPickerPopover({
	id,
	style,
	onClose,
	children,
}: {
	id: string;
	style: React.CSSProperties;
	onClose: () => void;
	children: ReactNode;
}) {
	const ref = useRef<HTMLDivElement>(null);
	useDialogA11y(ref, onClose);

	return createPortal(
		<div ref={ref} id={id} className="popup-picker-popover" style={style}>
			{children}
		</div>,
		document.body,
	);
}
