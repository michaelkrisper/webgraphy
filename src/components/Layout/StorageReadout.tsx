import type React from "react";
import { useEffect, useState } from "react";
import {
	onStorageChange,
	persistence,
	type StorageInfo,
} from "../../services/persistence";

const REFRESH_DEBOUNCE_MS = 1000;
const UNITS = ["B", "KB", "MB", "GB", "TB"];

function formatBytes(bytes: number): string {
	let value = bytes;
	let unit = 0;
	while (value >= 1024 && unit < UNITS.length - 1) {
		value /= 1024;
		unit++;
	}
	return `${unit === 0 ? value : value.toFixed(1)} ${UNITS[unit]}`;
}

/**
 * Browser storage usage, quota and eviction protection. Only mounted while
 * the footer panel is open; re-estimates (debounced) after dataset writes.
 */
export const StorageReadout: React.FC = () => {
	const [info, setInfo] = useState<StorageInfo | null | undefined>(undefined);

	useEffect(() => {
		let cancelled = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const refresh = () => {
			persistence.getStorageInfo().then((next) => {
				if (!cancelled) setInfo(next);
			});
		};
		refresh();
		const unsubscribe = onStorageChange(() => {
			clearTimeout(timer);
			timer = setTimeout(refresh, REFRESH_DEBOUNCE_MS);
		});
		return () => {
			cancelled = true;
			clearTimeout(timer);
			unsubscribe();
		};
	}, []);

	const enabled = persistence.isEnabled();

	return (
		<div className="sb-storage-readout">
			<strong>Browser storage</strong>
			{info === undefined ? (
				<span>Checking…</span>
			) : info === null ? (
				<span>Usage is not available in this browser.</span>
			) : (
				<>
					<span>
						{formatBytes(info.usage)} used of {formatBytes(info.quota)}
						{info.quota > 0 && ` (${((info.usage / info.quota) * 100).toFixed(1)}%)`}
					</span>
					<span>
						{info.persisted
							? "Persistent: data is protected from eviction."
							: "Not persistent: the browser may clear data when space runs low."}
					</span>
				</>
			)}
			{!enabled && <span>Saving is off for this session.</span>}
		</div>
	);
};
