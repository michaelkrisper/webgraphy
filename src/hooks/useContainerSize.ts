// Tracks an element's width/height. Reads the initial size from
// getBoundingClientRect on mount, then keeps it in sync via a ResizeObserver.
// Both effects live here so callers don't have to wire them up by hand.

import { useEffect, useState } from "react";

export function useContainerSize(
	ref: React.RefObject<HTMLElement | null>,
	initialWidth = 0,
	initialHeight = 0,
): { width: number; height: number } {
	const [width, setWidth] = useState(initialWidth);
	const [height, setHeight] = useState(initialHeight);

	useEffect(() => {
		const el = ref.current;
		if (!el) return;
		const observer = new ResizeObserver((entries) => {
			if (entries.length > 0) {
				const e = entries[entries.length - 1];
				setWidth(e.contentRect.width);
				setHeight(e.contentRect.height);
			}
		});
		observer.observe(el);
		return () => observer.disconnect();
	}, [ref]);

	useEffect(() => {
		const el = ref.current;
		if (el) {
			const rect = el.getBoundingClientRect();
			setWidth(rect.width);
			setHeight(rect.height);
		}
	}, [ref]);

	return { width, height };
}
