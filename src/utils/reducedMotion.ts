// `prefers-reduced-motion`, read once and kept current by a change listener.
// The chart's rAF loop asks every frame, so this must stay a plain variable
// read: no matchMedia call and no store subscription on the per-frame path.

const QUERY = "(prefers-reduced-motion: reduce)";

let reduced = false;

if (typeof window !== "undefined" && typeof window.matchMedia === "function") {
	const mq = window.matchMedia(QUERY);
	reduced = mq.matches;
	mq.addEventListener?.("change", (e) => {
		reduced = e.matches;
	});
}

/** True when the user asked the OS/browser to minimise animation. */
export function prefersReducedMotion(): boolean {
	return reduced;
}
