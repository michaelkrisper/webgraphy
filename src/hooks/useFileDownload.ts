import { useCallback, useEffect, useRef } from "react";
import { downloadFile } from "../services/export";

/**
 * Hook to manage file downloads and ensure object URLs are revoked on unmount.
 */
export const useFileDownload = () => {
	const cleanups = useRef<Array<() => void>>([]);

	useEffect(() => {
		return () => {
			cleanups.current.forEach((cleanup) => cleanup());
			cleanups.current = [];
		};
	}, []);

	const download = useCallback(
		(content: string, fileName: string, contentType: string) => {
			const cleanup = downloadFile(content, fileName, contentType);
			if (cleanup) {
				cleanups.current.push(cleanup);
			}
		},
		[],
	);

	return download;
};
