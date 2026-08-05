import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useContainerSize } from "./useContainerSize";

describe("useContainerSize", () => {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let mockResizeObserver: any;
	let observeMock: ReturnType<typeof vi.fn>;
	let disconnectMock: ReturnType<typeof vi.fn>;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	let resizeCallback: (entries: any[]) => void;

	beforeEach(() => {
		observeMock = vi.fn();
		disconnectMock = vi.fn();

		mockResizeObserver = class {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			constructor(callback: (entries: any[]) => void) {
				resizeCallback = callback;
			}
			observe = observeMock;
			disconnect = disconnectMock;
		};

		vi.stubGlobal("ResizeObserver", mockResizeObserver);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.clearAllMocks();
	});

	it("should initialize with default values", () => {
		const ref = { current: null };
		const { result } = renderHook(() => useContainerSize(ref));

		expect(result.current).toEqual({ width: 0, height: 0 });
	});

	it("should initialize with provided initial values", () => {
		const ref = { current: null };
		const { result } = renderHook(() => useContainerSize(ref, 100, 200));

		expect(result.current).toEqual({ width: 100, height: 200 });
	});

	it("should read initial size from getBoundingClientRect", () => {
		const mockElement = {
			getBoundingClientRect: vi.fn().mockReturnValue({ width: 300, height: 400 }),
		} as unknown as HTMLElement;
		const ref = { current: mockElement };

		const { result } = renderHook(() => useContainerSize(ref));

		expect(mockElement.getBoundingClientRect).toHaveBeenCalled();
		expect(result.current).toEqual({ width: 300, height: 400 });
	});

	it("should observe the element via ResizeObserver", () => {
		const mockElement = {
			getBoundingClientRect: vi.fn().mockReturnValue({ width: 0, height: 0 }),
		} as unknown as HTMLElement;
		const ref = { current: mockElement };

		renderHook(() => useContainerSize(ref));

		expect(observeMock).toHaveBeenCalledWith(mockElement);
	});

	it("should update state when ResizeObserver fires", () => {
		const mockElement = {
			getBoundingClientRect: vi.fn().mockReturnValue({ width: 100, height: 100 }),
		} as unknown as HTMLElement;
		const ref = { current: mockElement };

		const { result } = renderHook(() => useContainerSize(ref));

		expect(result.current).toEqual({ width: 100, height: 100 });

		act(() => {
			resizeCallback([
				{
					contentRect: { width: 500, height: 600 },
				},
			]);
		});

		expect(result.current).toEqual({ width: 500, height: 600 });
	});

	it("should not update state when ResizeObserver fires with empty entries", () => {
		const mockElement = {
			getBoundingClientRect: vi.fn().mockReturnValue({ width: 100, height: 100 }),
		} as unknown as HTMLElement;
		const ref = { current: mockElement };

		const { result } = renderHook(() => useContainerSize(ref));

		expect(result.current).toEqual({ width: 100, height: 100 });

		act(() => {
			resizeCallback([]);
		});

		expect(result.current).toEqual({ width: 100, height: 100 });
	});

	it("should disconnect ResizeObserver on unmount", () => {
		const mockElement = {
			getBoundingClientRect: vi.fn().mockReturnValue({ width: 0, height: 0 }),
		} as unknown as HTMLElement;
		const ref = { current: mockElement };

		const { unmount } = renderHook(() => useContainerSize(ref));

		expect(disconnectMock).not.toHaveBeenCalled();

		unmount();

		expect(disconnectMock).toHaveBeenCalled();
	});
});
