import {
	formatShortcutKeys,
	type Shortcut,
	SHORTCUTS,
} from "../../utils/shortcuts";

const keyName = (s: Shortcut) => formatShortcutKeys(s)[0];

/** Accessible name of an axis interaction zone, including the keys it takes. */
export function axisZoneLabel(
	kind: "x" | "y",
	id: string,
	title: string,
): string {
	const num = id.replace(/^axis-/, "");
	const name = title ? `: ${title}` : "";
	let keys = `arrows pan, +/- zoom, ${keyName(SHORTCUTS.axisAutoScale)} autoscale`;
	if (kind === "x") keys += `, ${keyName(SHORTCUTS.axisRename)} rename`;
	return `${kind.toUpperCase()} axis ${num}${name} — ${keys}`;
}
