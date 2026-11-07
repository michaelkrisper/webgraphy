import {
	formatShortcutKeys,
	type Shortcut,
	SHORTCUTS,
} from "../../utils/shortcuts";

const keyName = (s: Shortcut) => formatShortcutKeys(s)[0];

/** Accessible name of an axis interaction zone: which axis it is. */
export function axisZoneLabel(
	kind: "x" | "y",
	id: string,
	title: string,
): string {
	const num = id.replace(/^axis-/, "");
	const name = title ? `: ${title}` : "";
	return `${kind.toUpperCase()} axis ${num}${name}`;
}

/** Accessible description of an axis interaction zone: the keys it takes. */
export function axisZoneDescription(kind: "x" | "y"): string {
	const pan = formatShortcutKeys(
		kind === "x" ? SHORTCUTS.axisPanX : SHORTCUTS.axisPanY,
	).join("/");
	const zoom = `${keyName(SHORTCUTS.axisZoomIn)}/${keyName(SHORTCUTS.axisZoomOut)}`;
	return `${pan} pan, ${zoom} zoom, ${keyName(SHORTCUTS.axisAutoScale)} auto-scales, ${keyName(SHORTCUTS.axisRange)} or right-click sets an exact range, ${keyName(SHORTCUTS.axisRename)} renames. Drag or scroll to pan and zoom only this axis`;
}
