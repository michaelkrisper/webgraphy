import { lazy } from "react";

/**
 * The import dialog only mounts while a file is pending, so it (and the CSV/JSON
 * preview helpers it drags along) stays out of the entry chunk — see
 * `size-budget.json`. Render it inside a `<Suspense fallback={null}>`.
 */
export const ImportSettingsDialogLazy = lazy(() =>
	import("./ImportSettingsDialog").then((m) => ({
		default: m.ImportSettingsDialog,
	})),
);
