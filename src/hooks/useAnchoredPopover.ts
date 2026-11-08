import { useCallback, useEffect, useRef, useState } from "react";

export interface PopoverCoords {
	top?: number;
	bottom?: number;
	left: number;
}

/**
 * Open state and placement of a popover anchored below (or, in the lower
 * half of the window, above) its trigger; a mousedown outside both closes it.
 */
export function useAnchoredPopover(popoverId: string, minWidth: number) {
	const [isOpen, setIsOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const [coords, setCoords] = useState<PopoverCoords>({ top: 0, left: 0 });

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
			// A trigger in the lower half (the collapsed menu sits bottom-right)
			// opens upwards so the list is not pushed off-screen.
			const openUp = rect.top > window.innerHeight / 2;
			setCoords(
				openUp
					? {
							bottom: window.innerHeight - (rect.top + window.scrollY) + 4,
							left: Math.max(padding, left),
						}
					: {
							top: rect.bottom + window.scrollY + 4,
							left: Math.max(padding, left),
						},
			);
		}
		setIsOpen(!isOpen);
	};

	return { isOpen, setIsOpen, close, toggleOpen, triggerRef, coords };
}
