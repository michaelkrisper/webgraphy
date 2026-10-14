import { lazy, Suspense } from "react";
import { useSessionPrompt } from "../../store/useSessionPrompt";

const SessionConfirmDialog = lazy(() =>
	import("./SessionConfirmDialog").then((m) => ({
		default: m.SessionConfirmDialog,
	})),
);

/** Shows the "replace workspace?" question raised while opening a session. */
export function SessionPromptHost() {
	const prompt = useSessionPrompt((s) => s.prompt);
	if (!prompt) return null;
	return (
		<Suspense fallback={null}>
			<SessionConfirmDialog prompt={prompt} />
		</Suspense>
	);
}
