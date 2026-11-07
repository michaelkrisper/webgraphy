import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { THEMES } from "../../themes";

describe("useTheme", () => {
	beforeEach(() => {
		localStorage.clear();
		document.documentElement.className = "";
		document.documentElement.dataset.theme = "";
		document.head.innerHTML = "";
		vi.resetModules();
	});

	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("should return default theme when no theme is present", async () => {
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());
		expect(result.current[0]).toBe("light");
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("should get theme from localStorage if present", async () => {
		localStorage.setItem("theme", "matrix");
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());
		expect(result.current[0]).toBe("matrix");
		expect(document.documentElement.dataset.theme).toBe("matrix");
	});

	it("should fallback to light theme if localStorage contains invalid theme", async () => {
		localStorage.setItem("theme", "invalid-theme");
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());
		expect(result.current[0]).toBe("light");
		expect(document.documentElement.dataset.theme).toBe("light");
	});

	it("should cycle through themes correctly", async () => {
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());

		expect(result.current[0]).toBe("light");

		act(() => {
			result.current[1](); // cycle
		});

		expect(result.current[0]).toBe("dark");
		expect(localStorage.getItem("theme")).toBe("dark");

		act(() => {
			result.current[1](); // cycle
		});

		expect(result.current[0]).toBe("matrix");
		expect(localStorage.getItem("theme")).toBe("matrix");
	});

	it("should set CSS variables correctly when theme changes", async () => {
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());

		act(() => {
			// cycle to dark
			result.current[1]();
		});

		const style = document.documentElement.style;
		expect(style.getPropertyValue("--bg")).toBe(THEMES.dark.bg);
		expect(style.getPropertyValue("--text-color")).toBe(THEMES.dark.text);
	});

	it("should set 'dark' class correctly for dark and matrix themes", async () => {
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());

		expect(document.documentElement.classList.contains("dark")).toBe(false);

		act(() => {
			result.current[1](); // dark
		});
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		act(() => {
			result.current[1](); // matrix
		});
		expect(document.documentElement.classList.contains("dark")).toBe(true);

		act(() => {
			result.current[1](); // winnie
		});
		expect(document.documentElement.classList.contains("dark")).toBe(false);
	});

	it("should handle missing localStorage gracefully", async () => {
		vi.stubGlobal("localStorage", undefined);

		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());

		expect(result.current[0]).toBe("light");

		act(() => {
			result.current[1](); // cycle to dark
		});

		// result.current[0] reads from getSnapshot which reads from localStorage,
		// but since localStorage is undefined, getSnapshot *always* returns "light",
		// regardless of what applyTheme does to the actual current theme.
		// So useSyncExternalStore state will revert to "light" when it calls getSnapshot.
		expect(result.current[0]).toBe("light");

		// The side effect of applyTheme still works!
		expect(document.documentElement.dataset.theme).toBe("dark");

		vi.unstubAllGlobals();
	});

	describe("OS colour-scheme preference", () => {
		/** A prefers-color-scheme: dark list whose answer the test controls. */
		function stubDarkPreference(matches: boolean) {
			const listeners: (() => void)[] = [];
			const mql = {
				matches,
				addEventListener: (_: string, cb: () => void) => listeners.push(cb),
			};
			vi.stubGlobal(
				"matchMedia",
				vi.fn((query: string) => {
					expect(query).toBe("(prefers-color-scheme: dark)");
					return mql;
				}),
			);
			return {
				set(next: boolean) {
					mql.matches = next;
					for (const cb of listeners) cb();
				},
			};
		}

		afterEach(() => {
			vi.unstubAllGlobals();
		});

		it("defaults to dark on a dark OS without persisting the default", async () => {
			stubDarkPreference(true);
			const { useTheme } = await import("../useTheme");
			const { result } = renderHook(() => useTheme());
			expect(result.current[0]).toBe("dark");
			expect(document.documentElement.dataset.theme).toBe("dark");
			expect(localStorage.getItem("theme")).toBeNull();
		});

		it("lets an explicit choice win over a dark OS", async () => {
			stubDarkPreference(true);
			localStorage.setItem("theme", "light");
			const { useTheme } = await import("../useTheme");
			const { result } = renderHook(() => useTheme());
			expect(result.current[0]).toBe("light");
		});

		it("follows an OS switch until the user picks a theme", async () => {
			const os = stubDarkPreference(false);
			const { useTheme } = await import("../useTheme");
			const { result } = renderHook(() => useTheme());
			expect(result.current[0]).toBe("light");

			act(() => os.set(true));
			expect(result.current[0]).toBe("dark");
			expect(document.documentElement.dataset.theme).toBe("dark");

			act(() => result.current[2]("winnie"));
			act(() => os.set(false));
			expect(result.current[0]).toBe("winnie");
			expect(document.documentElement.dataset.theme).toBe("winnie");
		});
	});

	it("sets color-scheme and the theme-color metas for the browser chrome", async () => {
		document.head.innerHTML = `
			<meta name="color-scheme" content="light dark">
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#ffffff">
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#0a0c10">`;
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());
		const metas = () =>
			[
				...document.head.querySelectorAll<HTMLMetaElement>(
					'meta[name="theme-color"]',
				),
			].map((m) => m.content);
		const scheme = () =>
			document.head.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')
				?.content;

		expect(scheme()).toBe("light");
		expect(document.documentElement.style.colorScheme).toBe("light");

		act(() => result.current[2]("matrix"));
		// Both media variants: the chosen theme wins whatever the OS prefers.
		expect(metas()).toEqual([THEMES.matrix.plotBg, THEMES.matrix.plotBg]);
		expect(scheme()).toBe("dark");
		expect(document.documentElement.style.colorScheme).toBe("dark");

		act(() => result.current[2]("unicorn"));
		expect(metas()).toEqual([THEMES.unicorn.plotBg, THEMES.unicorn.plotBg]);
		expect(scheme()).toBe("light");
	});

	it("creates the chrome metas when the document has none", async () => {
		const { useTheme } = await import("../useTheme");
		renderHook(() => useTheme());
		expect(
			document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
				?.content,
		).toBe(THEMES.light.plotBg);
	});

	it("loads another theme's fonts on demand", async () => {
		const { loadThemeFonts } = await import("../useTheme");
		await expect(loadThemeFonts("unicorn")).resolves.toBeUndefined();
	});

	it("should allow setting a specific theme and handle existing fonts", async () => {
		const { useTheme } = await import("../useTheme");
		const { result } = renderHook(() => useTheme());

		act(() => {
			result.current[2]("winnie"); // set
		});

		expect(result.current[0]).toBe("winnie");
		expect(localStorage.getItem("theme")).toBe("winnie");
		expect(document.documentElement.dataset.theme).toBe("winnie");

		act(() => {
			result.current[2]("winnie"); // set again to test early return in loadFont
		});
	});
});
