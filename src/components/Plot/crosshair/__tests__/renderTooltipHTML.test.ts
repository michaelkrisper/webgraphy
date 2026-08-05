import { beforeEach, describe, expect, it } from "vitest";
import { renderTooltipHTML } from "../renderTooltipHTML";
import type { SnapGroup, SnapResult } from "../types";

/**
 * The tooltip recycles its DOM nodes instead of rebuilding them, because it is
 * rewritten on every mouse move. Recycling bugs do not throw — they leave a
 * stale row visible or drop a series — so the tests below check the resulting
 * DOM after successive renders, not just after the first one.
 */

const COLORS = {
	tooltipSubColor: "#888888",
	tooltipDividerColor: "#cccccc",
	tooltipColor: "#111111",
};

const item = (
	label: string,
	value: number,
	over: Record<string, unknown> = {},
) => ({
	label,
	value,
	color: "#ff0000",
	yScreen: 10,
	xScreen: 20,
	pointStyle: "circle",
	...over,
});

const group = (
	xLabel: string,
	xAxisName: string,
	items: SnapGroup["items"],
) => ({
	xLabel,
	xAxisName,
	items,
});

const snapWith = (...groups: SnapGroup[]): SnapResult => ({
	snapScreenX: 42,
	entries: groups,
});

let tooltip: HTMLDivElement;

const render = (snap: SnapResult | null, over: Record<string, unknown> = {}) =>
	renderTooltipHTML({
		tooltip,
		snap,
		pos: { x: 100, y: 200 },
		isPanning: false,
		...COLORS,
		...over,
	});

const rows = () =>
	Array.from(tooltip.querySelectorAll<HTMLElement>(".chart-tooltip-item-row"));

const visibleRows = () => rows().filter((r) => !r.hidden);

const visibleGroups = () =>
	Array.from(tooltip.children).filter(
		(g) => (g as HTMLElement).style.display !== "none",
	) as HTMLElement[];

beforeEach(() => {
	tooltip = document.createElement("div");
});

describe("renderTooltipHTML", () => {
	it("does nothing without a tooltip element", () => {
		expect(() =>
			renderTooltipHTML({
				tooltip: null,
				snap: snapWith(group("1", "Time", [item("Temp", 5)])),
				pos: { x: 0, y: 0 },
				isPanning: false,
				...COLORS,
			}),
		).not.toThrow();
	});

	it("hides itself when there is no snap, no position, or a pan is running", () => {
		for (const over of [
			{ snap: null },
			{ pos: null },
			{ isPanning: true },
		] as const) {
			tooltip = document.createElement("div");
			renderTooltipHTML({
				tooltip,
				snap: snapWith(group("1", "Time", [item("Temp", 5)])),
				pos: { x: 1, y: 2 },
				isPanning: false,
				...COLORS,
				...over,
			});
			expect(tooltip.style.display).toBe("none");
		}
	});

	it("positions itself below and right of the pointer", () => {
		render(snapWith(group("1", "Time", [item("Temp", 5)])));

		expect(tooltip.style.display).toBe("");
		expect(tooltip.style.left).toBe("112px");
		expect(tooltip.style.top).toBe("215px");
	});

	it("renders one labelled row per item", () => {
		render(
			snapWith(group("4", "Time", [item("Temp", 40), item("Humidity", 55)])),
		);

		const [first, second] = visibleRows();
		expect(first.children[0].textContent).toBe("Temp:");
		expect(second.children[0].textContent).toBe("Humidity:");
		expect(tooltip.querySelector(".chart-tooltip-x-label")?.textContent).toBe(
			"4",
		);
	});

	it("splits the value at the decimal separator", () => {
		render(snapWith(group("1", "Time", [item("Temp", 12.5)])));

		const row = visibleRows()[0];
		// Integer and fractional parts live in separate spans so the decimals
		// can be dimmed without reformatting the number.
		expect(row.children[1].textContent).toBe("12");
		expect(row.children[2].textContent).toBe(".5");
	});

	it("splits at the thousands separator for large values", () => {
		render(snapWith(group("1", "Time", [item("Temp", 1234.5)])));

		const row = visibleRows()[0];
		// Documents current behaviour: the split searches for the first "." or
		// "," and a grouped number hits the thousands separator first, so the
		// grouping digits end up in the dimmed decimal span. The rendered text
		// is still correct — only the styling boundary is off.
		expect(row.children[1].textContent).toBe("1");
		expect(row.children[2].textContent).toBe(",234.5");
		expect(`${row.children[1].textContent}${row.children[2].textContent}`).toBe(
			"1,234.5",
		);
	});

	it("leaves the decimal span empty for a whole number", () => {
		render(snapWith(group("1", "Time", [item("Temp", 42)])));

		const row = visibleRows()[0];
		expect(row.children[1].textContent).toBe("42");
		expect(row.children[2].textContent).toBe("");
	});

	it("prefers a category label over the numeric value", () => {
		render(
			snapWith(group("1", "Time", [item("State", 2, { valueLabel: "high" })])),
		);

		const row = visibleRows()[0];
		expect(row.children[1].textContent).toBe("high");
		expect(row.children[2].textContent).toBe("");
	});

	it("prefixes the axis name only when several axes are shown", () => {
		render(snapWith(group("4", "Time", [item("Temp", 40)])));
		expect(tooltip.querySelector(".chart-tooltip-x-label")?.textContent).toBe(
			"4",
		);

		tooltip = document.createElement("div");
		render(
			snapWith(
				group("4", "Time", [item("Temp", 40)]),
				group("7", "Distance", [item("Speed", 12)]),
			),
		);
		const labels = Array.from(
			tooltip.querySelectorAll(".chart-tooltip-x-label"),
		).map((n) => n.textContent);
		expect(labels).toEqual(["Time: 4", "Distance: 7"]);
	});

	it("separates the second and later groups with a divider", () => {
		render(
			snapWith(
				group("4", "Time", [item("Temp", 40)]),
				group("7", "Distance", [item("Speed", 12)]),
			),
		);

		const [first, second] = visibleGroups();
		expect(first.style.borderTop).toBe("");
		// jsdom normalises the hex colour to rgb() when reading the style back.
		expect(second.style.borderTop).toBe("1px solid rgb(204, 204, 204)");
		expect(second.style.paddingTop).toBe("4px");
	});

	it("hides leftover rows when a later render has fewer items", () => {
		render(
			snapWith(
				group("4", "Time", [
					item("Temp", 40),
					item("Humidity", 55),
					item("Pressure", 1013),
				]),
			),
		);
		expect(visibleRows()).toHaveLength(3);

		// Same tooltip element, fewer series — the third row must not linger.
		render(snapWith(group("4", "Time", [item("Temp", 41)])));

		expect(visibleRows()).toHaveLength(1);
		expect(rows()).toHaveLength(3);
		expect(visibleRows()[0].children[1].textContent).toBe("41");
	});

	it("hides leftover groups when a later render has fewer of them", () => {
		render(
			snapWith(
				group("4", "Time", [item("Temp", 40)]),
				group("7", "Distance", [item("Speed", 12)]),
			),
		);
		expect(visibleGroups()).toHaveLength(2);

		render(snapWith(group("4", "Time", [item("Temp", 40)])));

		expect(visibleGroups()).toHaveLength(1);
		expect(tooltip.children).toHaveLength(2);
	});

	it("reuses existing nodes instead of recreating them", () => {
		render(snapWith(group("4", "Time", [item("Temp", 40)])));
		const firstRow = rows()[0];
		const firstGroup = tooltip.firstElementChild;

		render(snapWith(group("5", "Time", [item("Temp", 50)])));

		expect(rows()[0]).toBe(firstRow);
		expect(tooltip.firstElementChild).toBe(firstGroup);
		expect(rows()[0].children[1].textContent).toBe("50");
	});

	it("restores a previously hidden row when the series comes back", () => {
		render(
			snapWith(group("4", "Time", [item("Temp", 40), item("Humidity", 55)])),
		);
		render(snapWith(group("4", "Time", [item("Temp", 40)])));
		expect(visibleRows()).toHaveLength(1);

		render(
			snapWith(group("4", "Time", [item("Temp", 40), item("Humidity", 60)])),
		);

		expect(visibleRows()).toHaveLength(2);
		expect(visibleRows()[1].children[1].textContent).toBe("60");
	});

	it("grows the DOM when a later render adds groups", () => {
		render(snapWith(group("4", "Time", [item("Temp", 40)])));

		render(
			snapWith(
				group("4", "Time", [item("Temp", 40)]),
				group("7", "Distance", [item("Speed", 12)]),
				group("9", "Depth", [item("Pressure", 3)]),
			),
		);

		expect(visibleGroups()).toHaveLength(3);
	});
});
