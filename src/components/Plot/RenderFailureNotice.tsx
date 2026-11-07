import type { RenderFailure } from "./renderFailure";

const CAUSE: Record<RenderFailure, string> = {
	"no-webgl2":
		"This browser did not provide WebGL 2, which WebGraphy needs to draw the plot.",
	shader: "The graphics driver could not set up WebGL 2 to draw the plot.",
};

/**
 * Stands in for a plot the renderer could not draw at all. Without it the
 * canvas just stays blank and nothing says why.
 */
export function RenderFailureNotice({
	failure,
	padding,
}: {
	failure: RenderFailure;
	padding: { top: number; right: number; bottom: number; left: number };
}) {
	return (
		<div
			role="alert"
			style={{
				position: "absolute",
				...padding,
				display: "flex",
				alignItems: "center",
				justifyContent: "center",
				padding: 16,
				pointerEvents: "none",
			}}
		>
			<div
				style={{
					maxWidth: 440,
					padding: "16px 20px",
					background: "var(--bg2)",
					border: "1px solid var(--border-color)",
					color: "var(--text-color)",
					textAlign: "center",
					lineHeight: 1.5,
				}}
			>
				<strong style={{ display: "block", marginBottom: 6 }}>
					The chart cannot be displayed
				</strong>
				<p style={{ margin: 0 }}>{CAUSE[failure]}</p>
				<p style={{ margin: "6px 0 0", color: "var(--text-muted-color)" }}>
					Try a current version of Chrome, Edge or Firefox, and make sure hardware
					acceleration is turned on in the browser settings.
					{failure === "shader" && " Updating the graphics driver may also help."}
				</p>
			</div>
		</div>
	);
}
