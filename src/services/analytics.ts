/**
 * First-party GoatCounter pageview beacon. Replaces the third-party count.js
 * so CSP script-src can stay 'self' (no remote script without SRI); the
 * request is the same documented `/count` pixel count.js sends.
 */
export const GOATCOUNTER_ENDPOINT = "https://webgraphy.goatcounter.com/count";

const LOCAL_HOST =
	/(localhost$|^127\.|^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\.|^0\.0\.0\.0$)/;

/** Non-zero flags the hit as automated; GoatCounter stores it but does not count it. */
function botScore(): number {
	const w = window as unknown as Record<string, unknown>;
	const d = document as unknown as Record<string, unknown>;
	if (w.callPhantom || w._phantom || w.phantom) return 150;
	if (w.__nightmare) return 151;
	if (d.__selenium_unwrapped || d.__webdriver_evaluate || d.__driver_evaluate)
		return 152;
	if (navigator.webdriver) return 153;
	return 0;
}

/** Why a pageview must not be sent, or `null` to send it. */
function skipReason(): string | null {
	if (location.protocol === "file:" || LOCAL_HOST.test(location.hostname))
		return "localhost";
	if (window.top !== window) return "frame";
	try {
		if (localStorage.getItem("skipgc") === "t") return "disabled";
	} catch {
		// Storage blocked: count as usual.
	}
	return null;
}

/** The beacon URL for the current page, or `null` when it must not be counted. */
export function pageviewUrl(): string | null {
	if (skipReason()) return null;
	// Mirrors count.js: empty values are omitted, `s` is the screen width only.
	const fields: Record<string, string> = {
		p: location.pathname + location.search || "/",
		t: document.title,
		r: document.referrer,
		s: String(screen.width),
		b: String(botScore()),
		q: location.search,
		rnd: Math.random().toString(36).slice(2, 7),
	};
	const params = new URLSearchParams();
	for (const [k, v] of Object.entries(fields)) if (v !== "") params.set(k, v);
	return `${GOATCOUNTER_ENDPOINT}?${params}`;
}

/** Sends one pageview once the page has loaded (img-src allows the endpoint). */
export function countPageview(): void {
	const send = () => {
		const url = pageviewUrl();
		if (url) new Image().src = url;
	};
	if (document.readyState === "complete") send();
	else window.addEventListener("load", send, { once: true });
}
