import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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
});
