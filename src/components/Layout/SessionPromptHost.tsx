import { lazy, Suspense, useCallback } from "react";
import { useSessionPrompt } from "../../store/useSessionPrompt";

const ConfirmDialog = lazy(() =>
	import("./ConfirmDialog").then((m) => ({ default: m.ConfirmDialog })),
);

/** Shows the "replace workspace?" question raised while opening a session. */
export function SessionPromptHost() {
	const prompt = useSessionPrompt((s) => s.prompt);
	const cancel = useCallback(() => prompt?.resolve(false), [prompt]);
	const confirm = useCallback(() => prompt?.resolve(true), [prompt]);
	if (!prompt) return null;
	return (
		<Suspense fallback={null}>
			<ConfirmDialog
				title="Open session?"
				message={`Opening "${prompt.fileName}" (${prompt.summary}) replaces all current datasets, series and axes. You can undo this with Ctrl+Z.`}
				confirmLabel="Replace workspace"
				onConfirm={confirm}
				onCancel={cancel}
			/>
		</Suspense>
	);
}
