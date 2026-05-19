import type React from "react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

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
}

export function PopupPicker<T extends string | number>({
	options,
	current,
	onChange,
	renderTrigger,
	popoverId = "popup-picker-popover",
	minWidth = 140,
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
		setIsOpen(false);
	};

	return (
		<>
			{renderTrigger({ onClick: toggleOpen, ref: triggerRef, isOpen })}
			{isOpen &&
				createPortal(
					<div
						id={popoverId}
						className="popup-picker-popover"
						style={{ top: coords.top, left: coords.left, minWidth }}
					>
						{options.map((opt) => {
							const isActive = opt.value === current;
							return (
								<button
									key={String(opt.value)}
									type="button"
									className={`popup-picker-item${isActive ? " popup-picker-item--active" : ""}`}
									onClick={() => handleSelect(opt.value)}
									disabled={opt.disabled}
								>
									<span className="popup-picker-icon">{opt.icon}</span>
									<span className="popup-picker-label">{opt.label}</span>
								</button>
							);
						})}
					</div>,
					document.body,
				)}
		</>
	);
}

export default PopupPicker;
