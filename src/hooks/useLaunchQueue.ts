import { useEffect, useRef } from "react";
import { notify } from "../store/useNotificationStore";

// File Handling API (Chromium only); not in lib.dom yet.
interface LaunchParams {
	readonly files?: readonly FileSystemFileHandle[];
}
interface LaunchQueue {
	setConsumer(consumer: (params: LaunchParams) => void): void;
}

/**
 * Routes files the OS opened with the installed app (manifest `file_handlers`)
 * into `onFiles`. Launch params go only to the first consumer set, so the
 * consumer reads the callback through a ref rather than closing over it — one
 * set by an earlier (StrictMode) effect run still reaches the live import queue.
 */
export function useLaunchQueue(onFiles: (files: File[]) => void): void {
	const onFilesRef = useRef(onFiles);
	useEffect(() => {
		onFilesRef.current = onFiles;
	});

	useEffect(() => {
		const queue = (window as { launchQueue?: LaunchQueue }).launchQueue;
		if (!queue) return;
		queue.setConsumer(async ({ files }) => {
			if (!files?.length) return;
			try {
				onFilesRef.current(await Promise.all(files.map((h) => h.getFile())));
			} catch (err) {
				notify({
					kind: "error",
					message: `Could not open the launched file: ${err instanceof Error ? err.message : String(err)}`,
				});
			}
		});
	}, []);
}
