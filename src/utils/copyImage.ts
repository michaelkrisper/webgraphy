import { notify } from "../store/useNotificationStore";

const errorText = (err: unknown) =>
	err instanceof Error ? err.message : String(err);

const nameOf = (err: unknown) => (err as { name?: unknown } | null)?.name;

/** Copying images needs `ClipboardItem` (secure contexts only). */
export function canCopyImages(): boolean {
	return (
		typeof ClipboardItem !== "undefined" &&
		typeof navigator.clipboard?.write === "function" &&
		(ClipboardItem.supports?.("image/png") ?? true)
	);
}

function renderFailed(err: unknown): string {
	return nameOf(err) === "CanvasSizeError"
		? errorText(err)
		: `Could not copy the chart: ${errorText(err)}`;
}

function writeFailed(err: unknown): string {
	return nameOf(err) === "NotAllowedError"
		? "The browser denied access to the clipboard. Allow it for this site, or export the chart as PNG instead."
		: `Could not copy the chart: ${errorText(err)}`;
}

/**
 * Puts the PNG `render` resolves to on the clipboard and reports the outcome
 * in a toast. Call it straight from the click handler: `write()` runs before
 * anything is awaited and gets the render as a pending promise, so Safari and
 * Chrome keep the click's user activation however long the drawing takes.
 */
export async function copyImageToClipboard(
	render: () => Promise<Blob>,
): Promise<boolean> {
	if (!canCopyImages()) {
		notify({
			kind: "error",
			message:
				"This browser cannot copy images to the clipboard here. Export the chart as PNG instead.",
		});
		return false;
	}
	// How a rejected item surfaces through write() differs per browser, so a
	// drawing failure is told apart from a refused clipboard here.
	const failure: { error?: unknown } = {};
	const png = render().catch((error: unknown) => {
		failure.error = error;
		throw error;
	});
	// write() may reject first and never read the item.
	png.catch(() => {});
	try {
		await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
	} catch (err) {
		notify({
			kind: "error",
			message: "error" in failure ? renderFailed(failure.error) : writeFailed(err),
		});
		return false;
	}
	notify({ kind: "success", message: "Chart copied to the clipboard" });
	return true;
}
