// Ctrl+V with spreadsheet cells on the clipboard opens the import dialog for
// them. Listening to the `paste` event (which Ctrl+V fires) rather than
// reading `navigator.clipboard` avoids the browser's permission prompt.

import { useEffect } from "react";
import { notify } from "../store/useNotificationStore";
import { isTabularText, pastedDataFile } from "../utils/importFile";
import { isEditableTarget } from "../utils/shortcuts";

export function handlePaste(
	e: Pick<ClipboardEvent, "target" | "clipboardData" | "preventDefault">,
	importFiles: (files: File[]) => void,
	now = new Date(),
): void {
	// Form fields keep their native paste.
	if (isEditableTarget(e.target)) return;
	const text = e.clipboardData?.getData("text/plain") ?? "";
	if (!text.trim()) return;
	e.preventDefault();
	if (!isTabularText(text)) {
		notify({
			kind: "info",
			message:
				"Clipboard text is not a table — copy at least two rows of cells from a spreadsheet to import them.",
		});
		return;
	}
	importFiles([pastedDataFile(text, now)]);
}

export function usePasteImport(importFiles: (files: File[]) => void): void {
	useEffect(() => {
		const onPaste = (e: ClipboardEvent) => handlePaste(e, importFiles);
		window.addEventListener("paste", onPaste);
		return () => window.removeEventListener("paste", onPaste);
	}, [importFiles]);
}
