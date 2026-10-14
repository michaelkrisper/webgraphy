import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exactPixelSize, useDevicePixelSize } from "../useDevicePixelSize";

type Entry = {
	devicePixelContentBoxSize?: { inlineSize: number; blockSize: number }[];
};

class MockResizeObserver {
	static instances: MockResizeObserver[] = [];
	static supportsDevicePixelBox = true;
	options: ResizeObserverOptions | undefined;
	disconnected = false;
	constructor(public cb: (entries: Entry[]) => void) {
		MockResizeObserver.instances.push(this);
	}
	observe(_el: Element, options?: ResizeObserverOptions) {
		if (
			options?.box === "device-pixel-content-box" &&
			!MockResizeObserver.supportsDevicePixelBox
		) {
			throw new TypeError("unsupported box");
		}
		this.options = options;
	}
	disconnect() {
		this.disconnected = true;
	}
	emit(w: number, h: number) {
		this.cb([{ devicePixelContentBoxSize: [{ inlineSize: w, blockSize: h }] }]);
	}
}

/** matchMedia stand-in: one list per query, change fired by `setDpr`. */
function installMatchMedia() {
	const lists = new Map<string, EventTarget>();
	const matchMedia = vi.fn((query: string) => {
		let list = lists.get(query);
		if (!list) {
			list = new EventTarget();
			lists.set(query, list);
		}
		return list as unknown as MediaQueryList;
	});
	vi.stubGlobal("matchMedia", matchMedia);
	return {
		matchMedia,
		setDpr(dpr: number) {
			const old = window.devicePixelRatio;
			Object.defineProperty(window, "devicePixelRatio", {
				configurable: true,
				value: dpr,
			});
			lists.get(`(resolution: ${old}dppx)`)?.dispatchEvent(new Event("change"));
		},
	};
}

function renderSize() {
	const ref = { current: document.createElement("div") };
	return renderHook(() => useDevicePixelSize(ref));
}

describe("useDevicePixelSize", () => {
	beforeEach(() => {
		MockResizeObserver.instances = [];
		MockResizeObserver.supportsDevicePixelBox = true;
		vi.stubGlobal("ResizeObserver", MockResizeObserver);
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 1,
		});
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 1,
		});
	});

	it("reports the exact device-pixel content box", () => {
		installMatchMedia();
		const { result } = renderSize();
		const ro = MockResizeObserver.instances[0];
		expect(ro.options).toEqual({ box: "device-pixel-content-box" });
		expect(result.current).toEqual({ dpr: 1 });

		act(() => ro.emit(801, 599));
		expect(result.current).toEqual({
			dpr: 1,
			pixelWidth: 801,
			pixelHeight: 599,
		});
	});

	it("picks up a DPR change reported by the observer alone", () => {
		installMatchMedia();
		const { result } = renderSize();
		const ro = MockResizeObserver.instances[0];
		act(() => ro.emit(800, 600));

		// Window dragged to a 2x monitor: same CSS size, new device-pixel box.
		Object.defineProperty(window, "devicePixelRatio", {
			configurable: true,
			value: 2,
		});
		act(() => ro.emit(1600, 1200));
		expect(result.current).toEqual({
			dpr: 2,
			pixelWidth: 1600,
			pixelHeight: 1200,
		});
	});

	it("falls back to a resolution media query without device-pixel-content-box", () => {
		MockResizeObserver.supportsDevicePixelBox = false;
		const mm = installMatchMedia();
		const { result } = renderSize();
		expect(MockResizeObserver.instances[0].disconnected).toBe(true);
		expect(mm.matchMedia).toHaveBeenCalledWith("(resolution: 1dppx)");

		act(() => mm.setDpr(1.5));
		expect(result.current).toEqual({ dpr: 1.5 });
		// Re-armed for the new ratio, so the next change is caught too.
		expect(mm.matchMedia).toHaveBeenCalledWith("(resolution: 1.5dppx)");
		act(() => mm.setDpr(2));
		expect(result.current).toEqual({ dpr: 2 });
	});

	it("drops an exact size measured at the previous DPR", () => {
		const mm = installMatchMedia();
		const { result } = renderSize();
		act(() => MockResizeObserver.instances[0].emit(800, 600));

		// Media query fires before the observer reports the new box.
		act(() => mm.setDpr(2));
		expect(result.current).toEqual({ dpr: 2 });
	});

	it("disconnects and unsubscribes on unmount", () => {
		const mm = installMatchMedia();
		const { unmount } = renderSize();
		const list = mm.matchMedia.mock.results[0].value as EventTarget;
		const remove = vi.spyOn(list, "removeEventListener");
		unmount();
		expect(MockResizeObserver.instances[0].disconnected).toBe(true);
		expect(remove).toHaveBeenCalledWith("change", expect.any(Function));
	});
});

describe("exactPixelSize", () => {
	it("keeps a measured size that belongs to the CSS box", () => {
		expect(exactPixelSize(200.4, 1.25, 251)).toBe(251);
	});

	it("rejects a missing or stale measurement", () => {
		expect(exactPixelSize(200, 1.25, undefined)).toBeUndefined();
		// Measured before a resize to 300 CSS px: far off, fall back.
		expect(exactPixelSize(300, 1.25, 250)).toBeUndefined();
	});
});
