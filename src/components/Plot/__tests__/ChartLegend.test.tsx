import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { SeriesConfig } from "../../../services/persistence";
import { buildSeriesConfig } from "../../../utils/series";
import { ChartLegend } from "../ChartLegend";

/**
 * Series identity is carried redundantly by colour *and* shape, so that it
 * survives colour-vision deficiency (see buildSeriesConfig). That only works
 * if the legend shows the same shape the plot draws — otherwise the extra cue
 * is lost exactly where the user goes to look it up.
 */

function renderLegend(series: SeriesConfig[]) {
	const { container } = render(
		<ChartLegend
			series={series}
			onToggleVisibility={vi.fn()}
			onHighlight={vi.fn()}
		/>,
	);
	return container;
}

/** The glyph for one series, found via its accessible name. */
function glyphFor(container: HTMLElement, name: string): SVGElement {
	const item = screen.getByRole("button", {
		name: `Toggle visibility for ${name}`,
	});
	const svg = item.querySelector("svg");
	if (!svg) throw new Error(`no glyph rendered for ${name}`);
	return svg as unknown as SVGElement;
}

describe("ChartLegend glyphs", () => {
	it.each([
		["solid", "none"],
		["dashed", "6,4"],
		["dotted", "2,3"],
	])("draws a %s series with a matching stroke pattern", (style, dash) => {
		const s = {
			...buildSeriesConfig("S", "ds-1", 0),
			name: "S",
			lineStyle: style as SeriesConfig["lineStyle"],
		};
		const container = renderLegend([s]);
		const line = glyphFor(container, "S").querySelector("line");
		expect(line).not.toBeNull();
		expect(line?.getAttribute("stroke-dasharray")).toBe(dash);
	});

	it.each([
		["circle", "circle"],
		["square", "rect"],
		["cross", "path"],
	])("draws a %s point as the matching shape", (pointStyle, tag) => {
		const s = {
			...buildSeriesConfig("S", "ds-1", 0),
			name: "S",
			pointStyle: pointStyle as SeriesConfig["pointStyle"],
		};
		const container = renderLegend([s]);
		expect(glyphFor(container, "S").querySelector(tag)).not.toBeNull();
	});

	it("shows a distinct glyph for each of the first six series", () => {
		const series = Array.from({ length: 6 }, (_, i) => ({
			...buildSeriesConfig(`S${i}`, "ds-1", i),
			name: `S${i}`,
		}));
		const container = renderLegend(series);

		// Colour deliberately left out of the signature: this asserts the
		// legend stays readable when hue carries no information at all.
		const signatures = series.map((s) => {
			const g = glyphFor(container, s.name);
			const line = g.querySelector("line");
			const point = g.querySelector("circle, rect, path");
			return `${line?.getAttribute("stroke-dasharray") ?? "-"}/${
				point?.tagName ?? "-"
			}`;
		});
		expect(new Set(signatures).size).toBe(6);
	});
});

describe("ChartLegend interaction", () => {
	const make = (name: string, over: Partial<SeriesConfig> = {}) => ({
		...buildSeriesConfig(name, "ds-1", 0),
		id: name,
		name,
		...over,
	});

	it("toggles visibility and reports hover for highlighting", () => {
		const onToggle = vi.fn();
		const onHighlight = vi.fn();
		render(
			<ChartLegend
				series={[make("A"), make("B", { hidden: true })]}
				onToggleVisibility={onToggle}
				onHighlight={onHighlight}
			/>,
		);
		const a = screen.getByRole("button", { name: "Toggle visibility for A" });
		const b = screen.getByRole("button", { name: "Toggle visibility for B" });
		fireEvent.click(a);
		fireEvent.click(b);
		expect(onToggle).toHaveBeenNthCalledWith(1, "A", true);
		expect(onToggle).toHaveBeenNthCalledWith(2, "B", false);
		expect(b.style.opacity).toBe("0.35");

		fireEvent.mouseEnter(a);
		expect(onHighlight).toHaveBeenLastCalledWith("A");
		fireEvent.mouseLeave(a);
		expect(onHighlight).toHaveBeenLastCalledWith(null);
	});

	it("omits series drawn with neither line nor points, and renders nothing if none remain", () => {
		const invisible = make("Ghost", { lineStyle: "none", pointStyle: "none" });
		const { rerender } = render(
			<ChartLegend
				series={[make("A"), invisible]}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
			/>,
		);
		expect(screen.queryByText("Ghost")).toBeNull();
		rerender(
			<ChartLegend
				series={[invisible]}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
			/>,
		);
		expect(screen.queryByRole("region", { name: "Chart Legend" })).toBeNull();
	});

	it("anchors to the top-right inside the plot padding", () => {
		render(
			<ChartLegend
				series={[make("A")]}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
				padding={{ top: 30, right: 50, bottom: 0, left: 0 }}
			/>,
		);
		const legend = screen.getByRole("region", { name: "Chart Legend" });
		expect(legend.style.right).toBe("60px");
		expect(legend.style.top).toBe("40px");
	});

	it("can be dragged by its background, clamped to the plot's top-left", () => {
		render(
			<ChartLegend
				series={[make("A")]}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
			/>,
		);
		const legend = screen.getByRole("region", { name: "Chart Legend" });
		// jsdom has no layout: give the legend a positioned parent so the drag
		// starts from x=0 (every rect left is 0) and the default y=20.
		Object.defineProperty(legend, "offsetParent", { value: document.body });
		fireEvent.mouseDown(legend, { clientX: 100, clientY: 100 });
		fireEvent.mouseMove(window, { clientX: 130, clientY: 115 });
		expect(legend.style.left).toBe("30px");
		expect(legend.style.top).toBe("35px");
		fireEvent.mouseMove(window, { clientX: -500, clientY: -500 });
		expect(legend.style.left).toBe("0px");
		expect(legend.style.top).toBe("0px");
		fireEvent.mouseUp(window);

		// Released: further moves no longer drag, and the position sticks.
		fireEvent.mouseMove(window, { clientX: 300, clientY: 300 });
		expect(legend.style.left).toBe("0px");

		// A second drag continues from the stored position.
		fireEvent.mouseDown(legend, { clientX: 0, clientY: 0 });
		fireEvent.mouseMove(window, { clientX: 5, clientY: 7 });
		expect(legend.style.left).toBe("5px");
		expect(legend.style.top).toBe("7px");
		fireEvent.mouseUp(window);
	});

	it("does not start a drag from a legend item", () => {
		render(
			<ChartLegend
				series={[make("A")]}
				onToggleVisibility={vi.fn()}
				onHighlight={vi.fn()}
			/>,
		);
		const legend = screen.getByRole("region", { name: "Chart Legend" });
		const item = screen.getByRole("button", { name: "Toggle visibility for A" });
		fireEvent.mouseDown(item, { clientX: 0, clientY: 0 });
		fireEvent.mouseMove(window, { clientX: 50, clientY: 50 });
		expect(legend.style.left).toBe("");
		fireEvent.mouseUp(window);
	});
});
