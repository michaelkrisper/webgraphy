import type { ReactNode } from "react";
import React from "react";
import { persistence } from "../services/persistence";

// Instead of `autoFocus`: Preact only sets the attribute, which browsers
// ignore on elements inserted after page load.
const focusOnMount = (el: HTMLElement | null) => el?.focus();

interface Props {
	children: ReactNode;
	level?: "top" | "component";
}

/** Steps of the top-level "Reset workspace" escape hatch. */
type ResetStep = "idle" | "confirm" | "working" | "blocked" | "failed";

interface State {
	hasError: boolean;
	error: Error | null;
	errorInfo: React.ErrorInfo | null;
	reset: ResetStep;
}

const dangerButton: React.CSSProperties = {
	padding: "10px 20px",
	background: "var(--danger)",
	color: "#fff",
};

export default class ErrorBoundary extends React.Component<Props, State> {
	constructor(props: Props) {
		super(props);
		this.state = {
			hasError: false,
			error: null,
			errorInfo: null,
			reset: "idle",
		};
	}

	static getDerivedStateFromError(): Partial<State> {
		return { hasError: true };
	}

	componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
		this.setState({
			error,
			errorInfo,
		});
	}

	handleReset = () => {
		if (this.props.level === "top") {
			window.location.reload();
		} else {
			this.setState({
				hasError: false,
				error: null,
				errorInfo: null,
			});
		}
	};

	/**
	 * A crash caused by saved state comes back on every reload, so Reload
	 * alone can loop; wiping what is stored in the browser breaks the loop.
	 */
	handleResetWorkspace = async () => {
		this.setState({ reset: "working" });
		try {
			await persistence.resetAll(() => this.setState({ reset: "blocked" }));
		} catch {
			this.setState({ reset: "failed" });
			return;
		}
		window.location.reload();
	};

	renderResetConfirm() {
		const { reset } = this.state;
		const busy = reset === "working" || reset === "blocked";
		return (
			<section
				role="alertdialog"
				aria-labelledby="reset-workspace-title"
				aria-describedby="reset-workspace-warning"
				style={{ maxWidth: 520, marginTop: 8 }}
			>
				<h2 id="reset-workspace-title">Reset workspace?</h2>
				<p id="reset-workspace-warning">
					This deletes all datasets, series and settings WebGraphy has stored in this
					browser. It cannot be undone.
				</p>
				<p>
					If the app still works after a plain Reload, save a session first (Save
					session… in the export menu) so you can restore your data afterwards.
				</p>
				{reset === "blocked" && (
					<p role="status">
						Waiting for WebGraphy in other tabs — close them to finish the reset.
					</p>
				)}
				{reset === "failed" && (
					<p role="alert">
						The browser data could not be deleted. Try clearing this site's data in
						the browser settings.
					</p>
				)}
				<div
					style={{
						display: "flex",
						gap: 12,
						justifyContent: "center",
						marginTop: 16,
					}}
				>
					<button
						type="button"
						ref={focusOnMount}
						disabled={busy}
						onClick={() => this.setState({ reset: "idle" })}
						style={{ padding: "10px 20px" }}
					>
						Cancel
					</button>
					<button
						type="button"
						disabled={busy}
						onClick={this.handleResetWorkspace}
						style={dangerButton}
					>
						Delete all data and reload
					</button>
				</div>
			</section>
		);
	}

	render() {
		if (this.state.hasError) {
			if (this.props.level === "top") {
				return (
					<div className="error-page">
						<h1>Application Error</h1>
						<p>{this.state.error?.message || "An unexpected error occurred"}</p>
						<pre>{this.state.errorInfo?.componentStack}</pre>
						{this.state.reset === "idle" ? (
							<div style={{ display: "flex", gap: 12 }}>
								<button
									type="button"
									onClick={this.handleReset}
									className="error-page-reset"
								>
									Reload
								</button>
								<button
									type="button"
									onClick={() => this.setState({ reset: "confirm" })}
									style={{ padding: "10px 20px" }}
								>
									Reset workspace…
								</button>
							</div>
						) : (
							this.renderResetConfirm()
						)}
					</div>
				);
			} else {
				return (
					<div className="error-component">
						<h3>Rendering failed</h3>
						<p>{this.state.error?.message || "An unexpected error occurred"}</p>
						<button
							type="button"
							onClick={this.handleReset}
							className="error-component-reset"
						>
							Retry
						</button>
					</div>
				);
			}
		}

		return this.props.children;
	}
}
