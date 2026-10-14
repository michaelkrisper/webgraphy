import { afterEach, describe, expect, it, vi } from "vitest";
import { countPageview, GOATCOUNTER_ENDPOINT, pageviewUrl } from "../analytics";

function setHost(hostname: string, pathname = "/webgraphy/") {
	vi.stubGlobal("location", {
		...window.location,
		protocol: "https:",
		hostname,
		pathname,
		search: "",
	});
}

describe("analytics", () => {
	afterEach(() => {
		vi.unstubAllGlobals();
		localStorage.clear();
	});

	it("builds a GoatCounter pageview URL for the current page", () => {
		setHost("example.github.io");
		document.title = "WebGraphy";
		const url = new URL(pageviewUrl() ?? "");
		expect(`${url.origin}${url.pathname}`).toBe(GOATCOUNTER_ENDPOINT);
		expect(url.searchParams.get("p")).toBe("/webgraphy/");
		expect(url.searchParams.get("t")).toBe("WebGraphy");
		expect(url.searchParams.has("r")).toBe(false);
		expect(url.searchParams.get("b")).toBe("0");
		expect(url.searchParams.get("s")).toMatch(/^\d+$/);
		expect(url.searchParams.has("e")).toBe(false);
		expect(url.searchParams.get("rnd")).toMatch(/^[a-z0-9]+$/);
	});

	it.each(["localhost", "127.0.0.1", "192.168.1.5", "10.0.0.2"])(
		"skips local host %s",
		(host) => {
			setHost(host);
			expect(pageviewUrl()).toBeNull();
		},
	);

	it("honours the skipgc opt-out", () => {
		setHost("example.github.io");
		localStorage.setItem("skipgc", "t");
		expect(pageviewUrl()).toBeNull();
	});

	it("flags automated browsers as bots", () => {
		setHost("example.github.io");
		Object.defineProperty(navigator, "webdriver", {
			value: true,
			configurable: true,
		});
		try {
			const url = new URL(pageviewUrl() ?? "");
			expect(url.searchParams.get("b")).toBe("153");
		} finally {
			delete (navigator as { webdriver?: boolean }).webdriver;
		}
	});

	it("sends the beacon as an image request once loaded", () => {
		setHost("example.github.io");
		const sources: string[] = [];
		vi.stubGlobal(
			"Image",
			class {
				set src(v: string) {
					sources.push(v);
				}
			},
		);
		countPageview();
		expect(sources).toHaveLength(1);
		expect(sources[0].startsWith(GOATCOUNTER_ENDPOINT)).toBe(true);
	});
});
