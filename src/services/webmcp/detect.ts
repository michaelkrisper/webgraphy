// WebMCP (https://webmachinelearning.github.io/webmcp/) feature check. This
// is all deferredStartup carries: the tools load only when the browser
// exposes the API.

export interface ToolResult {
	content: { type: "text"; text: string }[];
	isError?: boolean;
}

export interface ModelContextTool {
	name: string;
	title?: string;
	description: string;
	inputSchema: object;
	annotations?: { readOnlyHint?: boolean; untrustedContentHint?: boolean };
	execute(input: unknown): Promise<ToolResult>;
}

export interface ModelContext {
	registerTool(
		tool: ModelContextTool,
		options?: { signal?: AbortSignal },
	): Promise<void> | void;
}

type WithModelContext = { modelContext?: Partial<ModelContext> };

export function getModelContext(): ModelContext | null {
	const fromDocument = (document as WithModelContext).modelContext;
	// Chrome's origin trial shipped it on navigator first (deprecated in 150);
	// read that only when document lacks it, so it never warns needlessly.
	const mc = fromDocument ?? (navigator as WithModelContext).modelContext;
	return typeof mc?.registerTool === "function" ? (mc as ModelContext) : null;
}

/**
 * GitHub Pages cannot send the Origin-Trial header, so the token comes in as
 * a meta tag, which must exist before the API is probed.
 */
export function injectOriginTrialToken(token: string): void {
	const meta = document.createElement("meta");
	meta.httpEquiv = "origin-trial";
	meta.content = token;
	document.head.append(meta);
}

export function startWebMcp(
	token: string | undefined = import.meta.env.VITE_WEBMCP_OT_TOKEN,
): void {
	if (token) injectOriginTrialToken(token);
	const mc = getModelContext();
	if (!mc) return;
	void import("./register").then((m) => m.registerWebMcpTools(mc));
}
