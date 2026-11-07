/**
 * Why the plot renderer could not start: the browser gave no WebGL2 context,
 * or the driver rejected the shaders. Either way nothing can be drawn, so the
 * host replaces the blank canvas with an explanation.
 */
export type RenderFailure = "no-webgl2" | "shader";

export type RenderFailureListener = (failure: RenderFailure) => void;

/**
 * Remembers the first failure and replays it to a listener attached later: a
 * backend can fail while it is being built, before the host subscribes, and a
 * StrictMode remount re-attaches to the backend that already failed.
 */
export class FailureSignal {
	private failure: RenderFailure | null = null;
	private listener: RenderFailureListener | null = null;

	report(failure: RenderFailure): void {
		if (this.failure) return;
		this.failure = failure;
		this.listener?.(failure);
	}

	/** Replaces the listener; replays a failure that already happened. */
	listen(listener: RenderFailureListener): void {
		this.listener = listener;
		if (this.failure) listener(this.failure);
	}
}
