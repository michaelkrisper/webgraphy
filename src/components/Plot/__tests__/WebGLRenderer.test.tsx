import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RendererViewport } from "../rendererCore";
import { WebGLRenderer } from "../WebGLRenderer";

const backend = vi.hoisted(() => ({
	setViewport: vi.fn(),
	setPlotBg: vi.fn(),
	setSeries: vi.fn(),
	setOverlay: vi.fn(),
	setLabels: vi.fn(),
	sceneShared: vi.fn(() => false),
	setSceneContext: vi.fn(),
	redraw: vi.fn(),
	dispose: vi.fn(),
}));
const acquire = vi.hoisted(() => vi.fn(() => backend));

vi.mock("../renderBackend", () => ({
	acquireRenderBackend: acquire,
	releaseRenderBackend: vi.fn(),
}));

const padding = { top: 10, right: 10, bottom: 10, left: 10 };

function props(over: Record<string, unknown> = {}) {
	return {
		datasets: [],
		series: [],
		xAxes: [],
		yAxes: [],
		width: 200,
		height: 100,
		padding,
		plotBg: "#ffffff",
		...over,
	};
}

function lastViewport(): RendererViewport {
	const calls = backend.setViewport.mock.calls as unknown as [
		RendererViewport,
	][];
	return calls[calls.length - 1][0];
}

describe("WebGLRenderer viewport", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it("creates the backend at the host-measured DPR and exact pixel size", () => {
		render(
			<WebGLRenderer
				{...props({ dpr: 1.25, pixelWidth: 251, pixelHeight: 125 })}
			/>,
		);
		expect(acquire).toHaveBeenCalledWith(
			expect.anything(),
			expect.objectContaining({ dpr: 1.25, pixelWidth: 251, pixelHeight: 125 }),
			expect.anything(),
			expect.any(Function),
		);
	});

	it("re-sends the viewport when only the DPR changes", () => {
		const { rerender } = render(<WebGLRenderer {...props({ dpr: 1 })} />);
		backend.setViewport.mockClear();

		// Same CSS size, window moved to a 2x monitor.
		rerender(
			<WebGLRenderer {...props({ dpr: 2, pixelWidth: 400, pixelHeight: 200 })} />,
		);
		expect(lastViewport()).toMatchObject({
			width: 200,
			height: 100,
			dpr: 2,
			pixelWidth: 400,
			pixelHeight: 200,
		});
	});

	it("ignores an exact pixel size that does not match the CSS size", () => {
		const { rerender } = render(<WebGLRenderer {...props({ dpr: 1 })} />);
		// Width already 300 CSS px, device-pixel box still from the old 200.
		rerender(
			<WebGLRenderer
				{...props({ width: 300, dpr: 1, pixelWidth: 200, pixelHeight: 100 })}
			/>,
		);
		const vp = lastViewport();
		expect(vp.pixelWidth).toBeUndefined();
		expect(vp.pixelHeight).toBe(100);
	});
});

describe("WebGLRenderer failure notice", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	function reportFailure(failure: "no-webgl2" | "shader") {
		const calls = acquire.mock.calls as unknown as [
			unknown,
			unknown,
			unknown,
			(f: string) => void,
		][];
		act(() => calls[calls.length - 1][3](failure));
	}

	it("shows nothing while the renderer works", () => {
		render(<WebGLRenderer {...props()} />);
		expect(screen.queryByRole("alert")).toBeNull();
	});

	it("explains a missing WebGL2 and what to try, keeping the canvas", () => {
		render(<WebGLRenderer {...props()} />);
		reportFailure("no-webgl2");
		const alert = screen.getByRole("alert");
		expect(alert.textContent).toContain("The chart cannot be displayed");
		expect(alert.textContent).toContain("WebGL 2");
		expect(alert.textContent).toContain("Chrome, Edge or Firefox");
		expect(alert.textContent).toContain("hardware acceleration");
		expect(alert.textContent).not.toContain("graphics driver may");
		// The canvas stays mounted: it may already belong to the render worker.
		expect(screen.getByRole("img")).not.toBeNull();
	});

	it("suggests a driver update when the shaders were rejected", () => {
		render(<WebGLRenderer {...props()} />);
		reportFailure("shader");
		expect(screen.getByRole("alert").textContent).toContain(
			"Updating the graphics driver may also help.",
		);
	});
});
