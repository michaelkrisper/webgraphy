// Files dropped anywhere in the window go to the import queue. Unhandled, the
// browser would open a file dropped beside the plot in place of the app.

import { useEffect, useState } from "react";
import { isEditableTarget } from "../utils/shortcuts";

const carriesFiles = (e: DragEvent): boolean =>
	!!e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files");

/** Form controls keep their own drops; an open dialog must not get a second one stacked on it. */
const declined = (e: DragEvent): boolean =>
	isEditableTarget(e.target) ||
	document.querySelector('[aria-modal="true"]') !== null;

/**
 * Routes files dropped on the window to `onFiles`; text and other drags keep
 * their native behaviour. Returns whether a file is being dragged over a spot
 * that would accept it, for the drop highlight.
 */
export function useWindowFileDrop(onFiles: (files: FileList) => void): boolean {
	const [dragging, setDragging] = useState(false);

	useEffect(() => {
		// dragenter/dragleave fire for every element crossed on the way; the
		// depth tells leaving the window apart from moving between children.
		let depth = 0;
		const onEnter = (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			depth++;
			setDragging(!declined(e));
		};
		const onOver = (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			// Cancelling dragover is what permits a drop at all; "none" turns a
			// declined spot into a no-drop cursor instead of the browser opening
			// the file.
			e.preventDefault();
			const no = declined(e);
			if (e.dataTransfer) e.dataTransfer.dropEffect = no ? "none" : "copy";
			setDragging(!no);
		};
		const onLeave = (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			depth = Math.max(0, depth - 1);
			if (depth === 0) setDragging(false);
		};
		const onDrop = (e: DragEvent) => {
			if (!carriesFiles(e)) return;
			e.preventDefault();
			depth = 0;
			setDragging(false);
			const files = e.dataTransfer?.files;
			if (files?.length && !declined(e)) onFiles(files);
		};
		window.addEventListener("dragenter", onEnter);
		window.addEventListener("dragover", onOver);
		window.addEventListener("dragleave", onLeave);
		window.addEventListener("drop", onDrop);
		return () => {
			window.removeEventListener("dragenter", onEnter);
			window.removeEventListener("dragover", onOver);
			window.removeEventListener("dragleave", onLeave);
			window.removeEventListener("drop", onDrop);
		};
	}, [onFiles]);

	return dragging;
}
