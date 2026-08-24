import { render, screen } from "@testing-library/react";
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
