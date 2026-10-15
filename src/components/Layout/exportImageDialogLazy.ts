import { lazy } from "react";

/** Only mounted while open, so it stays out of the entry chunk. Render it inside a `<Suspense fallback={null}>`. */
export const ExportImageDialogLazy = lazy(() =>
	import("./ExportImageDialog").then((m) => ({
		default: m.ExportImageDialog,
	})),
);
