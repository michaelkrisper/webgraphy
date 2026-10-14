import { create } from "zustand";

export interface SessionPrompt {
	fileName: string;
	/** What the session contains, e.g. "3 datasets, 5 series". */
	summary: string;
	resolve: (replace: boolean) => void;
}

/**
 * The pending "replace the workspace?" question. Lives in the entry chunk so
 * the always-mounted host can show the (lazy) dialog for the lazily loaded
 * session code.
 */
export const useSessionPrompt = create<{ prompt: SessionPrompt | null }>(
	() => ({ prompt: null }),
);

/** Asks the user; resolves `false` on cancel or when a newer prompt replaces this one. */
export function confirmReplaceWorkspace(
	fileName: string,
	summary: string,
): Promise<boolean> {
	useSessionPrompt.getState().prompt?.resolve(false);
	return new Promise((resolve) => {
		const prompt: SessionPrompt = {
			fileName,
			summary,
			resolve: (replace) => {
				if (useSessionPrompt.getState().prompt === prompt)
					useSessionPrompt.setState({ prompt: null });
				resolve(replace);
			},
		};
		useSessionPrompt.setState({ prompt });
	});
}
