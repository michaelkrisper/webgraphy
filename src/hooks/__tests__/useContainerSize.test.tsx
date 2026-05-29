import { act, renderHook } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useContainerSize } from "../useContainerSize";

type ResizeCallback = (entries: { contentRect: DOMRectReadOnly }[]) => void;

class MockResizeObserver {
	cb: ResizeCallback;
	target: Element | null = null;
	disconnected = false;
	static instances: MockResizeObserver[] = [];

	constructor(cb: ResizeCallback) {
		this.cb = cb;
		MockResizeObserver.instances.push(this);
	}
	observe(el: Element) {
		this.target = el;
	}
	disconnect() {
		this.disconnected = true;
	}
	emit(width: number, height: number) {
		this.cb([{ contentRect: { width, height } as DOMRectReadOnly }]);
	}
}

function renderWithRef(initial?: { w?: number; h?: number }, rect?: DOMRect) {
	return renderHook(() => {
		const ref = useRef<HTMLDivElement | null>(null);
		if (!ref.current && rect !== undefined) {
			const el = document.createElement("div");
			el.getBoundingClientRect = () => rect;
			ref.current = el;
		}
		const size = useContainerSize(ref, initial?.w, initial?.h);
		return { ref, size };
	});
}

describe("useContainerSize", () => {
	let origRO: typeof ResizeObserver;

	beforeEach(() => {
		MockResizeObserver.instances = [];
		origRO = globalThis.ResizeObserver;
		globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver;
	});

	afterEach(() => {
		globalThis.ResizeObserver = origRO;
		vi.restoreAllMocks();
	});

	it("returns the supplied initial size when there is no element", () => {
		const { result } = renderHook(() => {
			const ref = useRef<HTMLDivElement | null>(null);
			return useContainerSize(ref, 800, 600);
		});
		expect(result.current).toEqual({ width: 800, height: 600 });
	});

	it("reads the initial size from the element's bounding rect on mount", () => {
		const rect = { width: 1024, height: 768 } as DOMRect;
		const { result } = renderWithRef({ w: 0, h: 0 }, rect);
		expect(result.current.size.width).toBe(1024);
		expect(result.current.size.height).toBe(768);
	});

	it("updates when the ResizeObserver fires", () => {
		const rect = { width: 100, height: 100 } as DOMRect;
		const { result } = renderWithRef({ w: 0, h: 0 }, rect);

		const observer = MockResizeObserver.instances[0];
		expect(observer).toBeDefined();
		act(() => observer.emit(500, 300));
		expect(result.current.size).toEqual({ width: 500, height: 300 });
	});

	it("uses the last entry when the observer reports multiple", () => {
		const rect = { width: 100, height: 100 } as DOMRect;
		const { result } = renderWithRef({ w: 0, h: 0 }, rect);

		const observer = MockResizeObserver.instances[0];
		act(() =>
			observer.cb([
				{ contentRect: { width: 1, height: 2 } as DOMRectReadOnly },
				{ contentRect: { width: 9, height: 8 } as DOMRectReadOnly },
			]),
		);
		expect(result.current.size).toEqual({ width: 9, height: 8 });
	});

	it("disconnects the observer on unmount", () => {
		const rect = { width: 50, height: 60 } as DOMRect;
		const { unmount } = renderWithRef({ w: 0, h: 0 }, rect);

		const observer = MockResizeObserver.instances[0];
		expect(observer.disconnected).toBe(false);
		unmount();
		expect(observer.disconnected).toBe(true);
	});
});
