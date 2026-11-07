// Returns `value` once it has stopped changing for `delayMs`, so a costly
// derivation (the import preview re-parsing the file) runs once per pause in
// typing rather than on every keystroke. The first value is returned as is.

import { useEffect, useState } from "react";

export function useDebouncedValue<T>(value: T, delayMs: number): T {
	const [debounced, setDebounced] = useState(value);

	useEffect(() => {
		const timer = setTimeout(() => setDebounced(value), delayMs);
		return () => clearTimeout(timer);
	}, [value, delayMs]);

	return debounced;
}
