import type React from "react";
import { useRef } from "react";
import {
	SIDEBAR_DEFAULT_WIDTH,
	SIDEBAR_MIN_WIDTH,
} from "../../hooks/useSidebarWidth";
import { hasKey, SHORTCUTS } from "../../utils/shortcuts";

const KEY_STEP = 16;

/**
 * The sidebar's left edge: drag it, or focus it and use the arrow keys, to
 * change the sidebar width; double-click or Home restores the default.
 */
export const SidebarResizer: React.FC<{
	width: number;
	maxWidth: number;
	onResize: (width: number) => void;
	onCommit: (width: number) => void;
}> = ({ width, maxWidth, onResize, onCommit }) => {
	const drag = useRef<{ startX: number; startWidth: number } | null>(null);
	const widthAt = (clientX: number) =>
		drag.current
			? drag.current.startWidth + (drag.current.startX - clientX)
			: width;

	return (
		<div
			className="sb-resizer"
			role="separator"
			aria-orientation="vertical"
			aria-label="Sidebar width"
			aria-description="Drag to resize the sidebar. When focused, Left and Right arrow keys widen and narrow it, Home restores the default width."
			aria-valuenow={width}
			aria-valuemin={SIDEBAR_MIN_WIDTH}
			aria-valuemax={maxWidth}
			tabIndex={0}
			title="Drag to resize; double-click to reset"
			onPointerDown={(e) => {
				if (e.button !== 0) return;
				e.preventDefault();
				e.currentTarget.setPointerCapture(e.pointerId);
				drag.current = { startX: e.clientX, startWidth: width };
			}}
			onPointerMove={(e) => {
				if (drag.current) onResize(widthAt(e.clientX));
			}}
			onPointerUp={(e) => {
				if (!drag.current) return;
				onCommit(widthAt(e.clientX));
				drag.current = null;
			}}
			onPointerCancel={() => {
				if (!drag.current) return;
				onCommit(drag.current.startWidth);
				drag.current = null;
			}}
			onDoubleClick={() => onCommit(SIDEBAR_DEFAULT_WIDTH)}
			onKeyDown={(e) => {
				let next: number | null = null;
				if (hasKey(SHORTCUTS.resizeSidebar, e.key))
					next = width + (e.key === "ArrowLeft" ? KEY_STEP : -KEY_STEP);
				else if (hasKey(SHORTCUTS.resetSidebar, e.key))
					next = SIDEBAR_DEFAULT_WIDTH;
				if (next === null || e.ctrlKey || e.altKey || e.metaKey) return;
				// The chart's window-level arrow/Home shortcuts must not also fire.
				e.preventDefault();
				e.stopPropagation();
				onCommit(next);
			}}
		/>
	);
};
