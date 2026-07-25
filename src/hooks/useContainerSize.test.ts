import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi, afterEach } from "vitest";
import { useContainerSize } from "./useContainerSize";
import type React from "react";

describe("useContainerSize", () => {
	let mockElement: HTMLElement;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockResizeObserver: any;
	let resizeCallback: ResizeObserverCallback;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let originalResizeObserver: any;

	beforeEach(() => {
		originalResizeObserver = globalThis.ResizeObserver;

		mockElement = {
			getBoundingClientRect: vi.fn(() => ({ width: 100, height: 200 })),
		} as unknown as HTMLElement;

		mockResizeObserver = {
			observe: vi.fn(),
			disconnect: vi.fn(),
			unobserve: vi.fn(),
		};

		class MockResizeObserver {
			constructor(cb: ResizeObserverCallback) {
				resizeCallback = cb;
			}
			observe = mockResizeObserver.observe;
			disconnect = mockResizeObserver.disconnect;
			unobserve = mockResizeObserver.unobserve;
		}

		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		globalThis.ResizeObserver = MockResizeObserver as any;
	});

	afterEach(() => {
		globalThis.ResizeObserver = originalResizeObserver;
		vi.clearAllMocks();
	});

	it("should initialize with default dimensions if ref is null", () => {
		const ref = { current: null } as React.RefObject<HTMLElement | null>;
		const { result } = renderHook(() => useContainerSize(ref, 10, 20));

		expect(result.current.width).toBe(10);
		expect(result.current.height).toBe(20);
	});

	it("should update dimensions using getBoundingClientRect on mount", () => {
		const ref = { current: mockElement } as React.RefObject<HTMLElement | null>;
		const { result } = renderHook(() => useContainerSize(ref, 10, 20));

		expect(result.current.width).toBe(100);
		expect(result.current.height).toBe(200);
		expect(mockElement.getBoundingClientRect).toHaveBeenCalled();
	});

	it("should update dimensions when ResizeObserver triggers", () => {
		const ref = { current: mockElement } as React.RefObject<HTMLElement | null>;
		const { result } = renderHook(() => useContainerSize(ref, 10, 20));

		act(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			resizeCallback([{ contentRect: { width: 300, height: 400 } }] as any, mockResizeObserver);
		});

		expect(result.current.width).toBe(300);
		expect(result.current.height).toBe(400);
	});

	it("should not update dimensions when ResizeObserver triggers with empty entries", () => {
		const ref = { current: mockElement } as React.RefObject<HTMLElement | null>;
		const { result } = renderHook(() => useContainerSize(ref, 10, 20));

		act(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			resizeCallback([{ contentRect: { width: 100, height: 200 } }] as any, mockResizeObserver);
		});

		expect(result.current.width).toBe(100);

		act(() => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			resizeCallback([] as any, mockResizeObserver);
		});

		expect(result.current.width).toBe(100);
		expect(result.current.height).toBe(200);
	});

	it("should clean up observer on unmount", () => {
		const ref = { current: mockElement } as React.RefObject<HTMLElement | null>;
		const { unmount } = renderHook(() => useContainerSize(ref, 10, 20));

		unmount();

		expect(mockResizeObserver.disconnect).toHaveBeenCalled();
	});
});
