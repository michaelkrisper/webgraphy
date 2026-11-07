import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useDebouncedValue } from "../useDebouncedValue";

describe("useDebouncedValue", () => {
	beforeEach(() => {
		vi.useFakeTimers();
	});
	afterEach(() => {
		vi.useRealTimers();
	});

	it("returns the initial value immediately", () => {
		const { result } = renderHook(() => useDebouncedValue("a", 200));
		expect(result.current).toBe("a");
	});

	it("follows a change only after the delay has passed", () => {
		const { result, rerender } = renderHook(
			({ value }) => useDebouncedValue(value, 200),
			{ initialProps: { value: 1 } },
		);
		rerender({ value: 2 });
		expect(result.current).toBe(1);
		act(() => {
			vi.advanceTimersByTime(199);
		});
		expect(result.current).toBe(1);
		act(() => {
			vi.advanceTimersByTime(1);
		});
		expect(result.current).toBe(2);
	});

	it("restarts the delay on every change and keeps only the last value", () => {
		const seen: string[] = [];
		const { result, rerender } = renderHook(
			({ value }) => {
				const debounced = useDebouncedValue(value, 200);
				if (seen.at(-1) !== debounced) seen.push(debounced);
				return debounced;
			},
			{ initialProps: { value: "" } },
		);
		for (const value of ["1", "12", "123"]) {
			rerender({ value });
			act(() => {
				vi.advanceTimersByTime(150);
			});
		}
		expect(result.current).toBe("");
		act(() => {
			vi.advanceTimersByTime(50);
		});
		expect(result.current).toBe("123");
		expect(seen).toEqual(["", "123"]);
	});

	it("drops a pending update on unmount", () => {
		const { rerender, unmount } = renderHook(
			({ value }) => useDebouncedValue(value, 200),
			{ initialProps: { value: 1 } },
		);
		rerender({ value: 2 });
		unmount();
		expect(vi.getTimerCount()).toBe(0);
	});
});
